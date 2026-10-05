"""Consumo por período a partir de lecturas acumuladas del medidor (cálculo puro).

Reglas de calidad (honestidad de datos):
- El delta entre dos lecturas consecutivas es REAL para ese intervalo.
- Si un intervalo cae entero dentro de un bucket de calendario, su aporte es REAL.
- Si un intervalo cruza bordes de bucket, su energía se reparte proporcionalmente al tiempo:
  ese reparto es ESTIMATED (no sabemos a qué hora se consumió realmente).
- Un bucket sin ningún intervalo que lo cubra NO tiene valor (None + motivo), nunca 0.
- Los valores no se extrapolan: un bucket cubierto parcialmente informa solo lo medido
  y su coverage_ratio (< 1).

Sin HTTP ni ORM: solo stdlib. Fechas siempre con zona horaria.
"""
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone, tzinfo
from decimal import Decimal, ROUND_HALF_UP
from typing import Iterable, Literal, Sequence

try:  # La imagen slim puede no traer tzdata; RD es UTC-4 fijo (sin horario de verano desde 2000).
    from zoneinfo import ZoneInfo
    SANTO_DOMINGO: tzinfo = ZoneInfo("America/Santo_Domingo")
except Exception:  # pragma: no cover - depende del sistema
    SANTO_DOMINGO = timezone(timedelta(hours=-4), "America/Santo_Domingo")

Granularity = Literal["day", "week", "month"]
GRANULARITIES = ("day", "week", "month")
_MICRO = timedelta(microseconds=1)
NO_COVERAGE = "Sin lecturas que cubran este período: no se puede calcular consumo."
PARTIAL_COVERAGE = "Las lecturas cubren solo parte del período; el valor no se extrapola."


def q2(x: Decimal) -> Decimal:
    return x.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def q4(x: Decimal) -> Decimal:
    return x.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)


def _micros(delta: timedelta) -> Decimal:
    return Decimal(delta // _MICRO)


def _require_aware(value: datetime) -> None:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("Se requieren fechas con zona horaria")


@dataclass(frozen=True)
class MeterPoint:
    read_at: datetime
    reading_kwh: Decimal


@dataclass(frozen=True)
class Interval:
    start: datetime
    end: datetime
    kwh: Decimal


def intervals_from_readings(points: Iterable[MeterPoint]) -> list[Interval]:
    """Deltas entre lecturas consecutivas. Rechaza lecturas decrecientes (cambio de medidor no soportado)."""
    points = list(points)
    for p in points:
        _require_aware(p.read_at)
    ordered = sorted(points, key=lambda p: p.read_at)
    out = []
    for prev, cur in zip(ordered, ordered[1:]):
        if cur.read_at == prev.read_at:
            raise ValueError("Dos lecturas con la misma fecha y hora")
        delta = Decimal(cur.reading_kwh) - Decimal(prev.reading_kwh)
        if delta < 0:
            raise ValueError("Lecturas decrecientes: el reemplazo de medidor no está soportado")
        out.append(Interval(prev.read_at, cur.read_at, delta))
    return out


@dataclass(frozen=True)
class Bucket:
    start: date          # primer día local (inclusive)
    end: date            # último día local (inclusive)
    start_at: datetime   # medianoche local de start
    end_at: datetime     # medianoche local del día siguiente a end (exclusivo)


def _next_start(d: date, granularity: str) -> date:
    if granularity == "day":
        return d + timedelta(days=1)
    if granularity == "week":
        return d + timedelta(days=7 - d.weekday())
    return date(d.year + (d.month == 12), d.month % 12 + 1, 1)


def calendar_buckets(granularity: str, first: date, last: date, tz: tzinfo = SANTO_DOMINGO) -> list[Bucket]:
    """Buckets de calendario local (semanas ISO lunes-domingo), recortados al rango [first, last]."""
    if granularity not in GRANULARITIES:
        raise ValueError("Granularidad no soportada")
    if last < first:
        raise ValueError("El rango termina antes de empezar")
    out = []
    cur = first
    while cur <= last:
        nxt = min(_next_start(cur, granularity), last + timedelta(days=1))
        out.append(Bucket(cur, nxt - timedelta(days=1), datetime.combine(cur, time(), tz),
                          datetime.combine(nxt, time(), tz)))
        cur = nxt
    return out


@dataclass(frozen=True)
class BucketResult:
    bucket: Bucket
    kwh: Decimal | None
    quality: Literal["REAL", "ESTIMATED"] | None
    coverage_ratio: Decimal
    covered_seconds: Decimal
    reason_code: Literal["no_coverage", "partial_coverage"] | None
    reason: str | None


def allocate(intervals: Sequence[Interval], buckets: Sequence[Bucket]) -> list[BucketResult]:
    """Reparte la energía de cada intervalo entre los buckets en proporción al tiempo solapado.

    Usa posiciones acumuladas (telescópicas) para que la suma de las partes sea exactamente el delta.
    """
    out = []
    for b in buckets:
        kwh = Decimal(0)
        covered = Decimal(0)
        touched = split = False
        for i in intervals:
            lo, hi = max(i.start, b.start_at), min(i.end, b.end_at)
            if hi <= lo:
                continue
            total = _micros(i.end - i.start)
            kwh += i.kwh * _micros(hi - i.start) / total - i.kwh * _micros(lo - i.start) / total
            covered += _micros(hi - lo)
            touched = True
            split = split or i.start < b.start_at or i.end > b.end_at
        span = _micros(b.end_at - b.start_at)
        ratio = covered / span
        if not touched:
            out.append(BucketResult(b, None, None, Decimal(0), Decimal(0), "no_coverage", NO_COVERAGE))
            continue
        partial = ratio < 1
        out.append(BucketResult(b, kwh, "ESTIMATED" if split else "REAL", ratio, covered / 1_000_000,
                                "partial_coverage" if partial else None, PARTIAL_COVERAGE if partial else None))
    return out


@dataclass(frozen=True)
class Summary:
    total_kwh: Decimal | None
    total_quality: Literal["REAL", "ESTIMATED"] | None
    covered_days: Decimal
    coverage_ratio: Decimal
    avg_daily_kwh: Decimal | None   # siempre ESTIMATED: es un promedio sobre los días cubiertos
    peak: BucketResult | None


def summarize(results: Sequence[BucketResult]) -> Summary:
    valued = [r for r in results if r.kwh is not None]
    span = sum((_micros(r.bucket.end_at - r.bucket.start_at) for r in results), Decimal(0))
    covered_seconds = sum((r.covered_seconds for r in valued), Decimal(0))
    covered_days = covered_seconds / 86400
    if not valued:
        return Summary(None, None, Decimal(0), Decimal(0), None, None)
    values = [(r, r.kwh) for r in valued if r.kwh is not None]
    total = sum((kwh for _, kwh in values), Decimal(0))
    quality = "REAL" if all(r.quality == "REAL" for r in valued) else "ESTIMATED"
    peak, peak_kwh = values[0]
    for r, kwh in values[1:]:
        if kwh > peak_kwh:  # empate: se conserva el bucket más antiguo
            peak, peak_kwh = r, kwh
    avg = total / covered_days if covered_days > 0 else None
    return Summary(total, quality, covered_days, covered_seconds * 1_000_000 / span if span else Decimal(0), avg, peak)
