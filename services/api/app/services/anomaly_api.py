"""Read-only anomaly detection over the home's accumulated meter readings."""
from calendar import monthrange
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import MeterReading
from app.schemas.anomaly import AnomalyRecord
from app.services import consumption_calc as cc
from app.services.anomalies import detect_anomaly
from app.services.transactions import require_home


def _month_start(value: date) -> date:
    return value.replace(day=1)


def _month_end(value: date) -> date:
    return value.replace(day=monthrange(value.year, value.month)[1])


def list_anomalies(
    db: Session,
    home_id,
    granularity: str = "month",
    *,
    minimum_history: int = 3,
    warning_delta_pct: Decimal = Decimal("50"),
    critical_delta_pct: Decimal = Decimal("100"),
) -> list[AnomalyRecord]:
    require_home(db, home_id)
    if granularity not in ("day", "month"):
        raise ValueError("Granularidad no soportada")
    readings = list(db.scalars(select(MeterReading).where(MeterReading.home_id == home_id)
                           .order_by(MeterReading.read_at, MeterReading.id)))
    if len(readings) < 2:
        return []
    points = [cc.MeterPoint(r.read_at, r.reading_kwh) for r in readings]
    intervals = cc.intervals_from_readings(points)
    local_dates = [r.read_at.astimezone(cc.SANTO_DOMINGO).date() for r in readings]
    first, last = min(local_dates), max(local_dates)
    if granularity == "month":
        first, last = _month_start(first), _month_end(last)
    buckets = cc.calendar_buckets(granularity, first, last, cc.SANTO_DOMINGO)
    result = detect_anomaly(buckets=cc.allocate(intervals, buckets), minimum_history=minimum_history,
                            warning_delta_pct=warning_delta_pct, critical_delta_pct=critical_delta_pct)
    if result is None:
        return []
    return [AnomalyRecord(home_id=home_id, granularity=granularity, severity=result.severity,
                          observed_kwh=result.observed_kwh, baseline_kwh=result.baseline_kwh,
                          delta_pct=result.delta_pct, period_start=result.period_start,
                          period_end=result.period_end, explanation=result.explanation)]
