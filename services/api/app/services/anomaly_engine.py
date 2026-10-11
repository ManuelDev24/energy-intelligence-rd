"""ERD-ANOM-01-COMPLETE: motor de anomalías explicable. Puro: sin HTTP, ORM ni base de datos.

Qué detecta (y qué NO):
- `peak`     un día con un consumo muy superior al de un día típico (mediana de los días previos con lecturas).
- `increase` un mes (por lecturas) o una factura (por días facturados) con un ritmo kWh/día muy superior a la mediana previa.
- `drop`     lo mismo hacia abajo (menos ocupación, lectura estimada, medidor…); nunca «crítico»: es ambiguo.
- `night`    una noche (23:00–05:00 hora de RD) en que el medidor avanzó cerca del ritmo promedio de todo el día.

Reglas de honestidad: todo se compara por RITMO (kWh por día cubierto), nunca se trata un hueco como cero, no hay
interpolación, no se atribuye a ningún equipo, y cada hallazgo lleva su explicación, su evidencia y una confianza
(`low/medium/high`) calculada con reglas visibles (`confidence_for`). Umbrales de partida sin calibrar con datos reales.
"""
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from statistics import median
from typing import Literal, Sequence
from uuid import UUID

from app.services import consumption_calc as cc

Kind = Literal["increase", "drop", "peak", "night"]
Source = Literal["readings", "bills"]
Granularity = Literal["day", "month", "billing"]
Severity = Literal["info", "warning", "critical"]
Confidence = Literal["low", "medium", "high"]
CONFIDENCE_RANK = {"low": 0, "medium": 1, "high": 2}
HISTORY_WINDOW = 6  # períodos previos que alimentan la línea base


def q2(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


@dataclass(frozen=True)
class Thresholds:
    increase_warning_pct: Decimal = Decimal(50)
    increase_critical_pct: Decimal = Decimal(100)
    drop_info_pct: Decimal = Decimal(40)
    drop_warning_pct: Decimal = Decimal(70)
    peak_warning_pct: Decimal = Decimal(100)
    peak_critical_pct: Decimal = Decimal(200)
    peak_min_extra_kwh: Decimal = Decimal(3)
    min_history: int = 3
    min_baseline_kwh_per_day: Decimal = Decimal("0.5")
    min_coverage: Decimal = Decimal("0.5")
    night_start_hour: int = 23
    night_end_hour: int = 5
    night_share: Decimal = Decimal("0.6")
    night_min_hours: Decimal = Decimal(2)
    night_min_kwh_per_hour: Decimal = Decimal("0.15")

    @classmethod
    def from_settings(cls, settings) -> "Thresholds":
        d = lambda value: Decimal(str(value))  # noqa: E731
        return cls(
            increase_warning_pct=d(settings.ANOMALY_INCREASE_WARNING_PCT), increase_critical_pct=d(settings.ANOMALY_INCREASE_CRITICAL_PCT),
            drop_info_pct=d(settings.ANOMALY_DROP_INFO_PCT), drop_warning_pct=d(settings.ANOMALY_DROP_WARNING_PCT),
            peak_warning_pct=d(settings.ANOMALY_PEAK_WARNING_PCT), peak_critical_pct=d(settings.ANOMALY_PEAK_CRITICAL_PCT),
            peak_min_extra_kwh=d(settings.ANOMALY_PEAK_MIN_EXTRA_KWH), min_history=settings.ANOMALY_MIN_HISTORY,
            min_baseline_kwh_per_day=d(settings.ANOMALY_MIN_BASELINE_KWH_PER_DAY), min_coverage=d(settings.ANOMALY_MIN_COVERAGE),
            night_start_hour=settings.ANOMALY_NIGHT_START_HOUR, night_end_hour=settings.ANOMALY_NIGHT_END_HOUR,
            night_share=d(settings.ANOMALY_NIGHT_SHARE), night_min_hours=d(settings.ANOMALY_NIGHT_MIN_HOURS),
            night_min_kwh_per_hour=d(settings.ANOMALY_NIGHT_MIN_KWH_PER_HOUR),
        )

    def __post_init__(self):
        if not (0 < self.increase_warning_pct <= self.increase_critical_pct and 0 < self.drop_info_pct <= self.drop_warning_pct
                and 0 < self.peak_warning_pct <= self.peak_critical_pct and self.min_history >= 2):
            raise ValueError("Umbrales de anomalías inválidos")


@dataclass(frozen=True)
class Period:
    """Unidad comparable: energía y días CUBIERTOS (no los del calendario) de un día, mes o factura."""
    start: date
    end: date
    kwh: Decimal
    days: Decimal
    coverage: Decimal
    estimated: bool = False
    bill_id: UUID | None = None


@dataclass(frozen=True)
class Finding:
    kind: Kind
    source: Source
    granularity: Granularity
    severity: Severity
    confidence: Confidence
    period_start: date
    period_end: date
    observed_kwh: Decimal
    baseline_kwh: Decimal
    delta_pct: Decimal | None
    days: Decimal
    explanation: str
    evidence: dict = field(default_factory=dict)
    bill_id: UUID | None = None

    @property
    def dedupe_key(self) -> str:
        return f"{self.kind}:{self.source}:{self.granularity}:{self.period_start}:{self.period_end}"


def periods_from_buckets(results: Sequence[cc.BucketResult]) -> list[Period]:
    """Solo buckets con valor y cobertura: un bucket sin lecturas no es cero, simplemente no existe."""
    out = []
    for r in results:
        if r.kwh is None or r.covered_seconds <= 0:
            continue
        out.append(Period(r.bucket.start, r.bucket.end, Decimal(r.kwh), Decimal(r.covered_seconds) / 86400,
                          Decimal(r.coverage_ratio), r.quality == "ESTIMATED"))
    return sorted(out, key=lambda p: p.start)


def periods_from_bills(bills) -> list[Period]:
    """Cada factura es un período con sus días facturados (> 0)."""
    out = [Period(b.period_start, b.period_end, Decimal(b.kwh), Decimal(b.days), Decimal(1), False, b.id)
           for b in bills if b.days and b.days > 0]
    return sorted(out, key=lambda p: (p.start, p.end))


def _spread(history_rates: Sequence[Decimal], base: Decimal) -> Decimal:
    if base <= 0:
        return Decimal(0)
    return Decimal(str(median(abs(r - base) for r in history_rates))) / base


def confidence_for(*, history_n: int, coverage: Decimal, estimated: bool, spread: Decimal, magnitude_ratio: Decimal) -> Confidence:
    """Puntos visibles: historial (≥6 → 2, ≥4 → 1), cobertura ≥ 90 %, dato medido (no repartido), línea base estable
    (MAD/mediana ≤ 25 %) y magnitud ≥ 1.5× el umbral. ≥5 alta, ≥3 media, si no baja."""
    points = (2 if history_n >= 6 else 1 if history_n >= 4 else 0) + (coverage >= Decimal("0.9")) + (not estimated) \
        + (spread <= Decimal("0.25")) + (magnitude_ratio >= Decimal("1.5"))
    return "high" if points >= 5 else "medium" if points >= 3 else "low"


def _valid(period: Period, th: Thresholds) -> bool:
    return period.days > 0 and period.coverage >= th.min_coverage


def _shift_text(kind: str, source: str, granularity: str, p: Period, rate: Decimal, base: Decimal, delta: Decimal, n: int) -> str:
    more = "más" if delta > 0 else "menos"
    pct = abs(delta)
    if kind == "peak":
        base_day = q2(base)
        return (f"El {p.start} el medidor registró {q2(p.kwh)} kWh en el día, frente a unos {base_day} kWh en un día típico "
                f"(mediana de {n} días previos con lecturas): {pct}% {more}. Un pico de un solo día puede deberse a visitas, "
                "equipos de uso ocasional o una lectura irregular; los datos no permiten atribuirlo a un equipo específico.")
    what = f"la factura del {p.start} al {p.end}" if source == "bills" else f"el período del {p.start} al {p.end}"
    tail = ("Puede deberse a más uso, a un cambio de hábitos o a una lectura errónea; los datos no permiten atribuirlo a un equipo específico."
            if kind == "increase" else
            "Puede deberse a menos ocupación, a una lectura estimada o a un ahorro real; confirme que la lectura sea correcta.")
    return (f"En {what} el consumo fue de {q2(p.kwh)} kWh en {q2(p.days)} días ({q2(rate)} kWh/día), frente a una línea base de "
            f"{q2(base)} kWh/día (mediana de {n} períodos previos): {pct}% {more}. {tail}")


def detect_shifts(periods: Sequence[Period], *, source: Source, granularity: Granularity, th: Thresholds, since: date) -> list[Finding]:
    """Compara el ritmo kWh/día de cada período con la mediana de los previos comparables."""
    findings: list[Finding] = []
    ordered = sorted(periods, key=lambda p: (p.start, p.end))
    for index, p in enumerate(ordered):
        if p.end < since or not _valid(p, th):
            continue
        history = [h for h in ordered[:index] if _valid(h, th)][-HISTORY_WINDOW:]
        if len(history) < th.min_history:
            continue
        rates = [h.kwh / h.days for h in history]
        base = Decimal(str(median(rates)))
        if base < th.min_baseline_kwh_per_day:
            continue  # sin línea base defendible no hay comparación relativa
        rate = p.kwh / p.days
        delta = q2((rate - base) / base * 100)
        kind: Kind | None = None
        severity: Severity = "warning"
        magnitude = Decimal(0)
        if granularity == "day":
            extra = p.kwh - base * p.days
            if delta >= th.peak_warning_pct and extra >= th.peak_min_extra_kwh:
                kind, magnitude = "peak", delta / th.peak_warning_pct
                severity = "critical" if delta >= th.peak_critical_pct else "warning"
        elif delta >= th.increase_warning_pct:
            kind, magnitude = "increase", delta / th.increase_warning_pct
            severity = "critical" if delta >= th.increase_critical_pct else "warning"
        elif -delta >= th.drop_info_pct:
            kind, magnitude = "drop", -delta / th.drop_info_pct
            severity = "warning" if -delta >= th.drop_warning_pct else "info"
        if kind is None:
            continue
        spread = _spread(rates, base)
        confidence = confidence_for(history_n=len(history), coverage=p.coverage, estimated=p.estimated, spread=spread, magnitude_ratio=magnitude)
        evidence = {"history_n": len(history), "baseline_rate": str(q2(base)), "rate": str(q2(rate)), "coverage": float(round(p.coverage, 3)),
                    "estimated": p.estimated, "spread": float(round(spread, 3))}
        findings.append(Finding(kind, source, granularity, severity, confidence, p.start, p.end, q2(p.kwh), q2(base * p.days), delta,
                                q2(p.days), _shift_text(kind, source, granularity, p, rate, base, delta, len(history)), evidence, p.bill_id))
    return findings


def detect_night(intervals: Sequence[cc.Interval], *, th: Thresholds, since: date, reference_since: date, tz=cc.SANTO_DOMINGO) -> list[Finding]:
    """Noches en que el medidor avanzó cerca del ritmo promedio de todo el día. Solo con lecturas DENTRO de la noche
    (no se interpola): hacen falta al menos dos lecturas en la ventana nocturna y ≥ 3 días de referencia."""
    ref = [i for i in intervals if i.end.astimezone(tz).date() >= reference_since]
    ref_hours = sum((Decimal((i.end - i.start).total_seconds()) / 3600 for i in ref), Decimal(0))
    if ref_hours < 72:
        return []
    ref_rate = sum((i.kwh for i in ref), Decimal(0)) / ref_hours
    if ref_rate <= 0:
        return []
    night_hours = Decimal(24 - th.night_start_hour + th.night_end_hour)
    nights: dict[date, list[cc.Interval]] = {}
    for i in intervals:
        start, end = i.start.astimezone(tz), i.end.astimezone(tz)
        origin = datetime.combine(start.date() if start.hour >= th.night_start_hour else start.date() - timedelta(days=1),
                                  datetime.min.time(), tz).replace(hour=th.night_start_hour)
        if start < origin or end > origin + timedelta(hours=float(night_hours)) or end.date() < since:
            continue
        nights.setdefault(origin.date(), []).append(i)
    raw = []
    for night, group in sorted(nights.items()):
        hours = sum((Decimal((i.end - i.start).total_seconds()) / 3600 for i in group), Decimal(0))
        kwh = sum((i.kwh for i in group), Decimal(0))
        if hours < th.night_min_hours:
            continue
        rate = kwh / hours
        expected = ref_rate * hours
        share = kwh / expected
        if share >= th.night_share and rate >= th.night_min_kwh_per_hour:
            raw.append((night, group, hours, kwh, rate, expected, share))
    findings = []
    for night, group, hours, kwh, rate, expected, share in raw:
        recent = sum(1 for other, *_ in raw if abs((other - night).days) <= 3)  # noches parecidas cerca: patrón, no un caso aislado
        confidence: Confidence = "high" if hours >= 4 and recent >= 3 else "medium" if hours >= 4 or recent >= 2 else "low"
        first, last = min(i.start for i in group).astimezone(tz), max(i.end for i in group).astimezone(tz)
        text = (f"Entre las {first:%H:%M} y las {last:%H:%M} ({q2(hours)} h) del {night} al {last.date()} el medidor avanzó {q2(kwh)} kWh "
                f"({q2(rate)} kWh/h), el {int(share * 100)}% del ritmo promedio de los últimos días ({q2(ref_rate)} kWh/h). "
                "Un consumo nocturno alto puede deberse a aire acondicionado, refrigeración u otros equipos encendidos; "
                "los datos no permiten identificar cuál.")
        findings.append(Finding("night", "readings", "day", "warning" if share >= 1 else "info", confidence, night, last.date(),
                                q2(kwh), q2(expected), None, max(q2(hours / 24), Decimal("0.01")), text,
                                {"hours": float(round(hours, 2)), "rate": str(q2(rate)), "reference_rate": str(q2(ref_rate)),
                                 "share": float(round(share, 3)), "similar_nights": recent}))
    return findings


def drop_overlaps(findings: Sequence[Finding]) -> list[Finding]:
    """Si por lecturas y por facturas se señala lo mismo (mismo tipo, períodos que se solapan) se conserva una:
    la de mayor confianza; en empate, la factura (es un hecho de facturación)."""
    kept: list[Finding] = []
    for f in findings:
        rival = next((k for k in kept if k.kind == f.kind and k.kind in ("increase", "drop") and k.source != f.source
                      and k.period_start <= f.period_end and f.period_start <= k.period_end), None)
        if rival is None:
            kept.append(f)
            continue
        better = CONFIDENCE_RANK[f.confidence] > CONFIDENCE_RANK[rival.confidence] or (
            CONFIDENCE_RANK[f.confidence] == CONFIDENCE_RANK[rival.confidence] and f.source == "bills")
        if better:
            kept[kept.index(rival)] = f
    return kept
