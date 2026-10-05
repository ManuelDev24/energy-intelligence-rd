"""Metas mensuales y progreso del mes en curso (calendario America/Santo_Domingo).

Fuentes en orden: lecturas del medidor (kWh REAL/ESTIMATED) > facturas que solapan el mes (prorrateo ESTIMATED).
RD$ desde kWh solo con tarifa vigente (ESTIMATED + source_resolution) o con el precio medio de la última
factura (ESTIMATED). Sin ninguna de las dos no se inventa RD$: insufficient_data con motivo.
"""
from calendar import monthrange
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Bill, HomeGoal
from app.schemas.dashboard import Metric
from app.schemas.goal import GoalMetricProgress, GoalOut, GoalProgressOut
from app.schemas.tariff import TariffRef
from app.services import calculations as calc
from app.services import consumption_calc as cc
from app.services import tariff_calc
from app.services.audit import record_change, snapshot
from app.services.consumption import TIMEZONE_NAME, intervals, load_points, local_range
from app.services.tariffs import resolve_tariff
from app.services.transactions import require_home, write_transaction

QUALITY_LEGEND = {
    "REAL": "Diferencia entre lecturas del medidor dentro del mes.",
    "ESTIMATED": "Prorrateo por tiempo/días, o RD$ calculado con tarifa (sin impuestos ni otros cargos) "
                 "o con el precio medio de la última factura.",
    "PROJECTED": "Cierre de mes proyectado: ritmo diario de las lecturas o tendencia lineal de facturas.",
}
NO_DATA = "No hay lecturas ni facturas que cubran el mes en curso."
NO_PROJECTION = "Datos insuficientes para proyectar el mes: se necesita ≥1 día de lecturas o ≥2 facturas."


def get_goal(db, home_id):
    require_home(db, home_id)
    return db.get(HomeGoal, home_id)


def save_goal(db, home_id, payload):
    with write_transaction(db):
        require_home(db, home_id, lock=True)
        goal = db.get(HomeGoal, home_id, populate_existing=True)
        before = snapshot(goal) if goal is not None else None
        if goal is None:
            goal = HomeGoal(home_id=home_id)
            db.add(goal)
        for key, value in payload.model_dump().items():
            # Canónico como Numeric(12,2): la auditoría guarda "250.00", no "250".
            setattr(goal, key, None if value is None else value.quantize(Decimal("0.01")))
        record_change(db, home_id, goal, "update" if before else "create", before)
    return goal


@dataclass
class _Month:
    kwh_so_far: Decimal | None = None
    kwh_quality: str | None = None
    kwh_basis: str | None = None
    amount_so_far_bills: Decimal | None = None
    kwh_projected: Decimal | None = None
    amount_projected_bills: Decimal | None = None
    method: str | None = None
    source: str = "none"
    avg_price: Decimal | None = None
    reasons: list[str] = field(default_factory=list)


def _bills_overlap(db, home_id, month_start: date, as_of: date, month: _Month) -> None:
    bills = list(db.scalars(select(Bill).where(Bill.home_id == home_id, Bill.period_start <= as_of,
                                               Bill.period_end >= month_start)))
    if not bills:
        return
    kwh = amount = Decimal(0)
    split = False
    for b in bills:
        lo, hi = max(b.period_start, month_start), min(b.period_end, as_of)
        span = (b.period_end - b.period_start).days + 1
        share = Decimal((hi - lo).days + 1) / span
        split = split or share < 1
        kwh += b.kwh * share
        amount += b.amount_dop * share
    month.kwh_so_far, month.amount_so_far_bills = calc.q2(kwh), calc.q2(amount)
    month.kwh_quality = "ESTIMATED" if split else "REAL"
    month.kwh_basis, month.source = "bills_prorated", "bills"


def _collect(db: Session, home_id, month_start: date, as_of: date, days_in_month: int) -> _Month:
    month = _Month()
    start_at, end_at = local_range(month_start, as_of)
    [r] = cc.allocate(intervals(load_points(db, home_id, start_at, end_at)),
                      [cc.Bucket(month_start, as_of, start_at, end_at)])
    if r.kwh is not None:
        month.kwh_so_far, month.kwh_quality = calc.q2(r.kwh), r.quality
        month.kwh_basis, month.source = "readings", "readings"
        month.kwh_projected = calc.run_rate(r.kwh, r.covered_seconds / 86400, days_in_month)
        month.method = "run_rate_readings" if month.kwh_projected is not None else None
    else:
        _bills_overlap(db, home_id, month_start, as_of, month)
    recent = list(db.scalars(select(Bill).where(Bill.home_id == home_id)
                             .order_by(Bill.period_end.desc(), Bill.id.desc()).limit(calc.PROJECTION_WINDOW)))
    if month.kwh_projected is None:
        proj = calc.project_next(list(reversed(recent)))
        if proj is not None:
            month.kwh_projected, month.amount_projected_bills = proj.kwh, proj.amount_dop
            month.method = "linear_least_squares"
            if month.source == "none":
                month.source = "bills"
    latest_priced = next((b for b in recent if b.kwh > 0), None)
    if latest_priced is not None:
        month.avg_price = latest_priced.amount_dop / latest_priced.kwh
    return month


def _metric(value, unit, quality):
    return None if value is None else Metric(value=value, unit=unit, quality=quality)


def _progress(target, unit, so_far, so_far_quality, projected, basis, method, tariff, reasons):
    reasons = list(reasons)
    if so_far is None:
        reasons.append(NO_DATA)
    if projected is None:
        reasons.append(NO_PROJECTION)
    return GoalMetricProgress(
        target=target, unit=unit, so_far=_metric(so_far, unit, so_far_quality),
        projected=_metric(projected, unit, "PROJECTED"), percent_so_far=calc.goal_percent(so_far, target),
        percent_projected=calc.goal_percent(projected, target), status=calc.goal_status(so_far, projected, target),
        basis=basis, projection_method=method if projected is not None else None, tariff=tariff, reasons=reasons)


def _tariff_ref(t) -> TariffRef:
    return TariffRef(tariff_id=t.id, distributor=t.distributor, tariff_code=t.tariff_code,
                     effective_from=t.effective_from, effective_to=t.effective_to,
                     source_resolution=t.source_resolution, source_url=t.source_url)


def _amount(db, home, as_of, month: _Month, target) -> GoalMetricProgress:
    so_far = projected = basis = tariff = None
    quality = "ESTIMATED"
    reasons: list[str] = []
    if month.source == "bills" and month.amount_so_far_bills is not None:
        so_far, quality, basis = month.amount_so_far_bills, month.kwh_quality, "bills_prorated"
    if month.method == "linear_least_squares":
        projected = month.amount_projected_bills
    needs_price = (month.kwh_basis == "readings") or (month.method == "run_rate_readings")
    if needs_price:
        res = resolve_tariff(db, home.distributor, as_of)
        if res.tariff is not None:
            # RD$ desde kWh con pliego oficial: ESTIMATED (sin impuestos/otros cargos), con su resolución.
            tariff, basis = _tariff_ref(res.tariff), "tariff"
            price = lambda kwh: tariff_calc.cost(kwh, res.tariff).total_rd  # noqa: E731
        elif month.avg_price is not None:
            basis = "bill_average_price"
            price = lambda kwh: calc.q2(kwh * month.avg_price)  # noqa: E731
        else:
            price = None
            reasons.append(f"{res.reason} Tampoco hay facturas con monto: no se estima RD$ desde kWh.")
        if price is not None:
            if month.kwh_basis == "readings":
                so_far = price(month.kwh_so_far)
            if month.method == "run_rate_readings":
                projected = price(month.kwh_projected)
    return _progress(target, "RD$", so_far, quality, projected, basis, month.method, tariff, reasons)


def build_progress(db: Session, home_id, on: date | None) -> GoalProgressOut:
    home = require_home(db, home_id)
    as_of = on or datetime.now(cc.SANTO_DOMINGO).date()
    month_start = as_of.replace(day=1)
    days_in_month = monthrange(as_of.year, as_of.month)[1]
    goal = db.get(HomeGoal, home_id)
    month = _collect(db, home_id, month_start, as_of, days_in_month)
    kwh = amount = None
    reasons: list[str] = []
    if goal is None:
        reasons.append("No hay meta mensual definida para esta vivienda.")
    else:
        if goal.monthly_kwh is not None:
            kwh = _progress(goal.monthly_kwh, "kWh", month.kwh_so_far, month.kwh_quality, month.kwh_projected,
                            month.kwh_basis, month.method, None, [])
        if goal.monthly_amount_rd is not None:
            amount = _amount(db, home, as_of, month, goal.monthly_amount_rd)
    statuses = [m.status for m in (kwh, amount) if m is not None]
    return GoalProgressOut(
        home_id=home_id, month_start=month_start, month_end=month_start + timedelta(days=days_in_month - 1),
        as_of=as_of, timezone=TIMEZONE_NAME, goal=GoalOut.model_validate(goal) if goal else None,
        status=calc.worst_goal_status(statuses), data_source=month.source, kwh=kwh, amount=amount,
        reasons=reasons, quality_legend=QUALITY_LEGEND)
