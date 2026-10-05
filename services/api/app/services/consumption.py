"""Consumo por período desde lecturas del medidor (la matemática vive en consumption_calc)."""
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import MeterReading
from app.schemas.consumption import ConsumptionBucket, ConsumptionComparison, ConsumptionOut, ConsumptionTotals
from app.schemas.dashboard import Metric
from app.services import consumption_calc as cc
from app.services import tariffs
from app.services.errors import ApplicationError, InvalidInput
from app.services.transactions import require_home

MAX_RANGE_DAYS = 366
TIMEZONE_NAME = "America/Santo_Domingo"
QUALITY_LEGEND = {
    "REAL": "Diferencia entre dos lecturas del medidor que caen dentro del período.",
    "ESTIMATED": "Energía de un intervalo entre lecturas repartida proporcionalmente al tiempo entre períodos, "
                 "o promedio diario.",
}


def validate_range(first: date, last: date) -> None:
    if last < first:
        raise InvalidInput("'to' debe ser igual o posterior a 'from'")
    if (last - first).days + 1 > MAX_RANGE_DAYS:
        raise InvalidInput(f"El rango no puede exceder {MAX_RANGE_DAYS} días")


def load_points(db: Session, home_id, start_at: datetime, end_at: datetime) -> list[cc.MeterPoint]:
    """Lecturas dentro de [start_at, end_at] más la vecina anterior y la posterior (cubren los bordes)."""
    base = select(MeterReading).where(MeterReading.home_id == home_id)
    inside = list(db.scalars(base.where(MeterReading.read_at >= start_at, MeterReading.read_at <= end_at)))
    before = db.scalar(base.where(MeterReading.read_at < start_at).order_by(MeterReading.read_at.desc()).limit(1))
    after = db.scalar(base.where(MeterReading.read_at > end_at).order_by(MeterReading.read_at.asc()).limit(1))
    rows = [r for r in (before, *inside, after) if r is not None]
    return [cc.MeterPoint(read_at=r.read_at, reading_kwh=r.reading_kwh) for r in rows]


def intervals(points):
    try:
        return cc.intervals_from_readings(points)
    except ValueError as exc:  # datos inconsistentes ya guardados (la API los rechaza al crear)
        raise ApplicationError(f"Lecturas inconsistentes: {exc}") from exc


def local_range(first: date, last: date):
    return (datetime.combine(first, time(), cc.SANTO_DOMINGO),
            datetime.combine(last + timedelta(days=1), time(), cc.SANTO_DOMINGO))


def _bucket_out(r: cc.BucketResult) -> ConsumptionBucket:
    return ConsumptionBucket(start=r.bucket.start, end=r.bucket.end,
                             kwh=None if r.kwh is None else cc.q2(r.kwh), quality=r.quality,
                             coverage_ratio=cc.q4(r.coverage_ratio), reason_code=r.reason_code, reason=r.reason)


def build_consumption(db: Session, home_id, granularity: str, first: date, last: date) -> ConsumptionOut:
    validate_range(first, last)
    home = require_home(db, home_id)
    start_at, end_at = local_range(first, last)
    points = load_points(db, home_id, start_at, end_at)
    results = cc.allocate(intervals(points), cc.calendar_buckets(granularity, first, last, cc.SANTO_DOMINGO))
    summary = cc.summarize(results)
    reasons = []
    if summary.total_kwh is None:
        reasons.append("No hay al menos dos lecturas que cubran el rango: registre lecturas del medidor.")
    elif summary.coverage_ratio < 1:
        reasons.append("Parte del rango no está cubierta por lecturas; esos períodos no tienen valor.")

    estimated_cost = None
    if summary.total_kwh is not None:
        cost_est = tariffs.estimate_cost(db, home.distributor, last, summary.total_kwh)
        if cost_est.status == "available" and cost_est.breakdown is not None:
            estimated_cost = Metric(value=cc.q2(cost_est.breakdown.total_rd), unit="RD$", quality="ESTIMATED")
        else:
            reasons.append(cost_est.reason or "No hay tarifa vigente de la distribuidora para estimar el costo.")

    comparison = _comparison(db, home_id, first, last)

    return ConsumptionOut(
        home_id=home_id, granularity=granularity, from_date=first, to_date=last, timezone=TIMEZONE_NAME,
        buckets=[_bucket_out(r) for r in results],
        totals=ConsumptionTotals(
            kwh=None if summary.total_kwh is None else Metric(value=cc.q2(summary.total_kwh), unit="kWh",
                                                               quality=summary.total_quality),
            covered_days=cc.q4(summary.covered_days), coverage_ratio=cc.q4(summary.coverage_ratio)),
        average_daily_kwh=None if summary.avg_daily_kwh is None else Metric(
            value=cc.q2(summary.avg_daily_kwh), unit="kWh/día", quality="ESTIMATED"),
        peak_bucket=None if summary.peak is None else _bucket_out(summary.peak),
        estimated_cost=estimated_cost, comparison=comparison,
        readings_used=len(points), insufficient_reasons=reasons, quality_legend=QUALITY_LEGEND,
    )


def _comparison(db: Session, home_id, first: date, last: date) -> ConsumptionComparison | None:
    """Período inmediatamente anterior, de igual longitud que [first, last]. None sin ese historial."""
    length = (last - first).days + 1
    prev_last = first - timedelta(days=1)
    prev_first = prev_last - timedelta(days=length - 1)
    start_at, end_at = local_range(prev_first, prev_last)
    prev_points = load_points(db, home_id, start_at, end_at)
    prev_results = cc.allocate(intervals(prev_points), cc.calendar_buckets("day", prev_first, prev_last, cc.SANTO_DOMINGO))
    prev_summary = cc.summarize(prev_results)
    if prev_summary.total_kwh is None:
        return None
    current_points = load_points(db, home_id, *local_range(first, last))
    current_results = cc.allocate(intervals(current_points), cc.calendar_buckets("day", first, last, cc.SANTO_DOMINGO))
    current_total = cc.summarize(current_results).total_kwh
    if current_total is None:
        return None
    delta = current_total - prev_summary.total_kwh
    pct = None if prev_summary.total_kwh == 0 else cc.q2(delta / prev_summary.total_kwh * Decimal(100))
    return ConsumptionComparison(
        previous_from=prev_first, previous_to=prev_last,
        previous_kwh=Metric(value=cc.q2(prev_summary.total_kwh), unit="kWh", quality=prev_summary.total_quality or "ESTIMATED"),
        kwh_delta=Metric(value=cc.q2(delta), unit="kWh", quality="ESTIMATED"),
        kwh_pct=None if pct is None else Metric(value=pct, unit="%", quality="ESTIMATED"),
    )
