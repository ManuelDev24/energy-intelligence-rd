import uuid
from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel

from app.schemas.dashboard import Metric, Quality

Granularity = Literal["day", "week", "month"]


class ConsumptionBucket(BaseModel):
    start: date                       # primer día local (inclusive)
    end: date                         # último día local (inclusive)
    kwh: Decimal | None               # None = sin lecturas que cubran el período (nunca 0 inventado)
    quality: Quality | None           # REAL si ningún intervalo se repartió; ESTIMATED si hubo reparto
    coverage_ratio: Decimal           # 0..1: fracción del período cubierta por intervalos entre lecturas
    reason_code: Literal["no_coverage", "partial_coverage"] | None
    reason: str | None


class ConsumptionTotals(BaseModel):
    kwh: Metric | None                # REAL si todos los buckets son REAL; si no, ESTIMATED
    covered_days: Decimal
    coverage_ratio: Decimal


class ConsumptionComparison(BaseModel):
    previous_from: date
    previous_to: date
    previous_kwh: Metric
    kwh_delta: Metric
    kwh_pct: Metric | None            # None si el período anterior tiene 0 kWh


class ConsumptionOut(BaseModel):
    home_id: uuid.UUID
    granularity: Granularity
    from_date: date
    to_date: date
    timezone: str
    buckets: list[ConsumptionBucket]
    totals: ConsumptionTotals
    average_daily_kwh: Metric | None  # ESTIMATED: total / días cubiertos
    peak_bucket: ConsumptionBucket | None
    estimated_cost: Metric | None = None     # RD$, ESTIMATED; None si falta total o no hay tarifa vigente
    comparison: ConsumptionComparison | None = None  # vs. el período anterior de igual longitud; None sin historial
    readings_used: int
    resolution: Literal["meter_readings"] = "meter_readings"
    hourly_data_available: bool = False
    insufficient_reasons: list[str]
    quality_legend: dict[str, str]
