"""Explainable anomalies over daily or monthly consumption buckets."""
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from statistics import median
from typing import Literal, Sequence, cast

from app.services.consumption_calc import BucketResult


@dataclass(frozen=True)
class Anomaly:
    severity: Literal["warning", "critical"]
    observed_kwh: Decimal
    baseline_kwh: Decimal
    delta_pct: Decimal
    period_start: date
    period_end: date
    explanation: str


def _q2(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def detect_anomaly(
    buckets: Sequence[BucketResult],
    *,
    minimum_history: int = 3,
    warning_delta_pct: Decimal = Decimal("50"),
    critical_delta_pct: Decimal = Decimal("100"),
) -> Anomaly | None:
    """Compare the latest valued bucket with the median of prior comparable buckets.

    Missing buckets are not treated as zero. A zero baseline is deliberately not
    assigned a percentage: there is no defensible relative comparison.
    """
    if minimum_history < 1 or critical_delta_pct < warning_delta_pct or warning_delta_pct <= 0:
        raise ValueError("Umbrales o historial inválidos")
    valued = [bucket for bucket in buckets if bucket.kwh is not None and bucket.coverage_ratio > 0]
    if len(valued) < minimum_history + 1:
        return None
    current = valued[-1]
    history: list[Decimal] = [Decimal(bucket.kwh) for bucket in valued[:-1]][-minimum_history:]
    baseline = Decimal(str(median(history)))
    observed = Decimal(cast(Decimal, current.kwh))
    if baseline <= 0 or observed <= baseline:
        return None
    delta_pct = _q2((observed - baseline) / baseline * Decimal(100))
    if delta_pct < warning_delta_pct:
        return None
    severity: Literal["warning", "critical"] = (
        "critical" if delta_pct >= critical_delta_pct else "warning"
    )
    start, end = current.bucket.start, current.bucket.end
    explanation = (
        f"El consumo del período {start} al {end} fue de {_q2(observed)} kWh/día, "
        f"frente a una línea base mediana de {_q2(baseline)} kWh/día "
        f"({delta_pct}% más). La comparación usa {len(history)} períodos previos; "
        "los datos no permiten atribuirlo a un equipo específico."
    )
    return Anomaly("critical" if severity == "critical" else "warning", _q2(observed),
                   _q2(baseline), delta_pct, start, end, explanation)
