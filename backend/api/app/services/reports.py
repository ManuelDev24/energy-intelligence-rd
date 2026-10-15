"""ERD-RPT-01: informe energético por vivienda y período (solo lectura; base de la vista imprimible y del PDF).

Qué cuenta: las facturas cuyo período TERMINA dentro del rango pedido (criterio simple y explicado en `notes`). El período anterior tiene la
misma duración y se compara con ese mismo criterio. Todo cálculo reutiliza `calculations`; aquí solo se ensambla y se etiqueta la calidad.
"""
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Bill, Equipment, Home, HomeGoal
from app.schemas.dashboard import Metric
from app.schemas.report import (
    EnergyReportOut, ReportBill, ReportComparison, ReportEquipment, ReportGoal, ReportHome, ReportPeriod, ReportRecommendation,
    ReportSource, ReportTotals,
)
from app.services import calculations as calc
from app.services import recommendation_engine as engine
from app.services import recommendations as recs
from app.services.errors import InvalidInput

MAX_DAYS = 366
MAX_BILLS = 60
TOP_EQUIPMENT = 5
TOP_RECOMMENDATIONS = 5
SANTO_DOMINGO = timezone(timedelta(hours=-4), "America/Santo_Domingo")


def today_rd(now: datetime | None = None) -> date:
    return (now or datetime.now(timezone.utc)).astimezone(SANTO_DOMINGO).date()


def _m(value: Decimal, unit: str, quality: str) -> Metric:
    return Metric(value=value, unit=unit, quality=quality)


def resolve_period(period_from: date | None, period_to: date | None, *, today: date | None = None) -> tuple[date, date]:
    today = today or today_rd()
    end = period_to or today
    start = period_from or (end - timedelta(days=364))
    if start > end:
        raise InvalidInput("`from` no puede ser posterior a `to`")
    if end > today:
        raise InvalidInput("El período no puede terminar en el futuro")
    if (end - start).days + 1 > MAX_DAYS:
        raise InvalidInput(f"El período no puede superar {MAX_DAYS} días")
    return start, end


def _bills_in(db: Session, home_id, start: date, end: date) -> list[Bill]:
    return list(db.scalars(
        select(Bill).where(Bill.home_id == home_id, Bill.period_end >= start, Bill.period_end <= end)
        .order_by(Bill.period_start, Bill.period_end, Bill.id).limit(MAX_BILLS)))


def _bill_out(b: Bill) -> ReportBill:
    price = calc.q2(b.amount_dop / b.kwh) if b.kwh > 0 else None
    return ReportBill(bill_id=b.id, period_start=b.period_start, period_end=b.period_end, days=b.days, kwh=_m(b.kwh, "kWh", "REAL"),
                      amount_dop=_m(b.amount_dop, "RD$", "REAL"), avg_price_per_kwh=_m(price, "RD$/kWh", "ESTIMATED") if price is not None else None)


def _totals(bills: list[Bill]) -> ReportTotals:
    if not bills:
        return ReportTotals(bills_count=0, kwh=None, amount_dop=None, avg_price_per_kwh=None, avg_kwh_per_bill=None)
    kwh = sum((b.kwh for b in bills), Decimal(0))
    amount = sum((b.amount_dop for b in bills), Decimal(0))
    return ReportTotals(
        bills_count=len(bills), kwh=_m(calc.q2(kwh), "kWh", "REAL"), amount_dop=_m(calc.q2(amount), "RD$", "REAL"),
        avg_price_per_kwh=_m(calc.q2(amount / kwh), "RD$/kWh", "ESTIMATED") if kwh > 0 else None,
        avg_kwh_per_bill=_m(calc.q2(kwh / len(bills)), "kWh", "ESTIMATED"),
    )


def build_energy_report(db: Session, home: Home, period_from: date | None = None, period_to: date | None = None, *,
                        now: datetime | None = None) -> EnergyReportOut:
    generated = now or datetime.now(timezone.utc)
    start, end = resolve_period(period_from, period_to, today=today_rd(generated))
    days = (end - start).days + 1
    bills = _bills_in(db, home.id, start, end)
    totals = _totals(bills)
    peak = max(bills, key=lambda b: (b.kwh, b.period_end)) if bills else None

    comparison = None
    prev_end = start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=days - 1)
    previous = _bills_in(db, home.id, prev_start, prev_end)
    if bills and previous:
        p_kwh = sum((b.kwh for b in previous), Decimal(0))
        p_amount = sum((b.amount_dop for b in previous), Decimal(0))
        comparison = ReportComparison(
            previous_from=prev_start, previous_to=prev_end, previous_kwh=_m(calc.q2(p_kwh), "kWh", "REAL"),
            previous_amount_dop=_m(calc.q2(p_amount), "RD$", "REAL"),
            kwh_pct=_m(calc.q2((totals.kwh.value - p_kwh) / p_kwh * 100), "%", "ESTIMATED") if p_kwh > 0 else None,
            amount_pct=_m(calc.q2((totals.amount_dop.value - p_amount) / p_amount * 100), "%", "ESTIMATED") if p_amount > 0 else None,
        )

    items = list(db.scalars(select(Equipment).where(Equipment.home_id == home.id).order_by(Equipment.room, Equipment.name, Equipment.id)))
    shares = calc.shares_pct([e.power_w * e.hours_per_day for e in items])
    equipment = sorted(
        (ReportEquipment(name=e.name, room=e.room, monthly_kwh=_m(calc.equipment_monthly_kwh(e.power_w, e.hours_per_day), "kWh/mes", "ESTIMATED"),
                         share_pct=_m(share, "%", "ESTIMATED")) for e, share in zip(items, shares, strict=True)),
        key=lambda e: (-e.share_pct.value, e.name))[:TOP_EQUIPMENT]

    active = recs.list_recommendations(db, home.id, status="active", limit=100)
    recommendations = [
        ReportRecommendation(title=r.title, action=r.action, difficulty=engine.difficulty_for(r.rule_id), impact=engine.impact_for(r.savings_kwh_month),
                             savings_kwh_month=_m(r.savings_kwh_month, "kWh/mes", "ESTIMATED") if r.savings_kwh_month is not None else None)
        for r in active if r.category == "equipment"][:TOP_RECOMMENDATIONS]

    goal_row = db.get(HomeGoal, home.id)
    goal = ReportGoal(monthly_kwh=goal_row.monthly_kwh, monthly_amount_rd=goal_row.monthly_amount_rd) if goal_row else None

    sources: list[ReportSource] = []
    notes = [
        "Incluye las facturas cuyo período termina dentro del rango elegido. El período anterior tiene la misma duración.",
        "Las facturas son mensuales: este informe no tiene medición diaria ni por hora.",
    ]
    if bills:
        sources.append(ReportSource(label=f"{len(bills)} factura(s) registradas por ti", quality="REAL"))
    else:
        notes.append("No hay facturas registradas en este período; registra tus facturas para ver consumo y gasto.")
    if previous and bills:
        sources.append(ReportSource(label="Facturas del período anterior (comparación)", quality="REAL"))
    elif bills:
        notes.append("No hay facturas en el período anterior: no se muestra comparación.")
    if equipment:
        sources.append(ReportSource(label="Equipos declarados con su potencia y horas de uso", quality="ESTIMATED"))
        notes.append("El reparto por equipo es una estimación a partir de lo que declaraste, no una medición.")
    if recommendations:
        sources.append(ReportSource(label="Recomendaciones de ahorro vigentes", quality="ESTIMATED"))
        notes.append("Los ahorros de las recomendaciones son estimaciones, no garantías.")
    if len(bills) == MAX_BILLS:
        notes.append(f"Se muestran como máximo {MAX_BILLS} facturas.")

    return EnergyReportOut(
        home_id=home.id, home=ReportHome(id=home.id, name=home.name, distributor=home.distributor, province=home.province, municipality=home.municipality),
        period=ReportPeriod(period_from=start, period_to=end, days=days), generated_at=generated, bills=[_bill_out(b) for b in bills],
        totals=totals, peak_bill=_bill_out(peak) if peak else None, comparison=comparison, equipment=equipment, recommendations=recommendations,
        goal=goal, sources=sources, notes=notes,
    )
