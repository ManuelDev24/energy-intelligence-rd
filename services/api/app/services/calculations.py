"""Cálculos puros (sin base de datos) de variación y proyección lineal.

Reglas de datos:
- Solo se calcula con facturas mensuales introducidas; nunca se inventan valores.
- Con historial insuficiente se devuelve None + motivo, no un porcentaje.
- La proyección es lineal (mínimos cuadrados) sobre los totales por factura.
"""
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from typing import Protocol, Sequence

PROJECTION_WINDOW = 6          # máximo de facturas recientes usadas
MIN_BILLS_COMPARISON = 2
MIN_BILLS_PROJECTION = 2
WARNING_PCT = Decimal("20")    # variación kWh >= 20 % -> warning
CRITICAL_PCT = Decimal("40")   # variación kWh >= 40 % -> critical


class BillLike(Protocol):
    period_start: object
    period_end: object
    kwh: Decimal
    amount_dop: Decimal
    days: int


def q2(x: Decimal) -> Decimal:
    return x.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


@dataclass(frozen=True)
class Variation:
    kwh_delta: Decimal
    kwh_pct: Decimal | None       # None si la base es 0 (no se inventa un %)
    amount_delta: Decimal
    amount_pct: Decimal | None


def _pct(delta: Decimal, base: Decimal) -> Decimal | None:
    return None if base == 0 else q2(delta / base * 100)


def variation(current: BillLike, previous: BillLike) -> Variation:
    kd = current.kwh - previous.kwh
    ad = current.amount_dop - previous.amount_dop
    return Variation(q2(kd), _pct(kd, previous.kwh), q2(ad), _pct(ad, previous.amount_dop))


@dataclass(frozen=True)
class Projection:
    kwh: Decimal
    amount_dop: Decimal
    bills_used: int
    method: str = "linear_least_squares"


def _linear_next(values: Sequence[Decimal]) -> Decimal:
    """Ajuste y = a + b*x por mínimos cuadrados con x = 0..n-1; devuelve y(n), >= 0."""
    n = len(values)
    xs = [Decimal(i) for i in range(n)]
    mean_x = sum(xs) / n
    mean_y = sum(values) / n
    sxx = sum((x - mean_x) ** 2 for x in xs)
    sxy = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, values))
    slope = sxy / sxx
    intercept = mean_y - slope * mean_x
    return max(Decimal(0), intercept + slope * n)


def project_next(bills_oldest_first: Sequence[BillLike]) -> Projection | None:
    """Proyecta la próxima factura mensual. None si hay menos de 2 facturas."""
    window = list(bills_oldest_first)[-PROJECTION_WINDOW:]
    if len(window) < MIN_BILLS_PROJECTION:
        return None
    return Projection(
        kwh=q2(_linear_next([b.kwh for b in window])),
        amount_dop=q2(_linear_next([b.amount_dop for b in window])),
        bills_used=len(window),
    )


def severity_for(kwh_pct: Decimal | None, warning_pct: Decimal = WARNING_PCT,
                 critical_pct: Decimal = CRITICAL_PCT) -> str | None:
    if kwh_pct is None or kwh_pct < warning_pct:
        return None
    return "critical" if kwh_pct >= critical_pct else "warning"


# ---------- Equipos declarados (siempre ESTIMATED) ----------
DAYS_PER_MONTH = Decimal(30)


def equipment_daily_kwh(power_w: Decimal, hours_per_day: Decimal) -> Decimal:
    """kWh/día = W × h / 1000. Es una estimación: supone potencia nominal constante."""
    return q2(power_w * hours_per_day / 1000)


def equipment_monthly_kwh(power_w: Decimal, hours_per_day: Decimal) -> Decimal:
    return q2(power_w * hours_per_day / 1000 * DAYS_PER_MONTH)


# ---------- Metas mensuales (Fase 2) ----------
MIN_RUN_RATE_DAYS = Decimal(1)
GOAL_STATUS_PRIORITY = ("exceeded", "at_risk", "insufficient_data", "on_track")


def goal_status(so_far: Decimal | None, projected: Decimal | None, target: Decimal) -> str:
    """exceeded si lo observado ya supera la meta; si no, decide la proyección; sin proyección: insufficient_data."""
    if so_far is not None and so_far > target:
        return "exceeded"
    if projected is None:
        return "insufficient_data"
    return "at_risk" if projected > target else "on_track"


def goal_percent(value: Decimal | None, target: Decimal) -> Decimal | None:
    return None if value is None else q2(value / target * 100)


def run_rate(kwh: Decimal, covered_days: Decimal, days_in_month: int) -> Decimal | None:
    """Proyección lineal por ritmo diario observado. None con menos de 1 día cubierto (muy ruidoso)."""
    if covered_days < MIN_RUN_RATE_DAYS:
        return None
    return q2(kwh / covered_days * days_in_month)


def worst_goal_status(statuses: Sequence[str]) -> str:
    for status in GOAL_STATUS_PRIORITY:
        if status in statuses:
            return status
    return "insufficient_data"
