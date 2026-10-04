"""Estimación de consumo por equipos declarados. Todo resultado es ESTIMATED."""
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Bill, Equipment, Home
from app.schemas.dashboard import Metric
from app.schemas.equipment import EquipmentEstimateItem, EquipmentEstimateOut
from app.services import calculations as calc

NOTE = ("Estimación por potencia nominal × horas de uso declaradas × 30 días. "
        "No es una medición: el consumo real depende del uso, la eficiencia y el ciclo de cada equipo.")


def _m(value: Decimal, unit: str, quality: str) -> Metric:
    return Metric(value=value, unit=unit, quality=quality)


def build_estimate(db: Session, home: Home) -> EquipmentEstimateOut:
    items = list(db.scalars(
        select(Equipment).where(Equipment.home_id == home.id).order_by(Equipment.room, Equipment.name)
    ))
    out_items = []
    total_daily = total_monthly = Decimal(0)
    for e in items:
        daily = calc.equipment_daily_kwh(e.power_w, e.hours_per_day)
        monthly = calc.equipment_monthly_kwh(e.power_w, e.hours_per_day)
        total_daily += daily
        total_monthly += monthly
        out_items.append(EquipmentEstimateItem(
            equipment_id=e.id, name=e.name, room=e.room,
            daily_kwh=_m(daily, "kWh/día", "ESTIMATED"), monthly_kwh=_m(monthly, "kWh/mes", "ESTIMATED"),
        ))

    latest = db.scalars(
        select(Bill).where(Bill.home_id == home.id).order_by(Bill.period_end.desc()).limit(1)
    ).first()
    latest_kwh = coverage = None
    if latest is not None:
        latest_kwh = _m(latest.kwh, "kWh", "REAL")
        # % de la última factura que explican los equipos declarados (normalizado a 30 días).
        if latest.kwh > 0 and latest.days > 0 and items:
            bill_30d = latest.kwh / latest.days * calc.DAYS_PER_MONTH
            coverage = _m(calc.q2(total_monthly / bill_30d * 100), "%", "ESTIMATED")

    return EquipmentEstimateOut(
        home_id=home.id, equipment_count=len(items), items=out_items,
        total_daily_kwh=_m(calc.q2(total_daily), "kWh/día", "ESTIMATED"),
        total_monthly_kwh=_m(calc.q2(total_monthly), "kWh/mes", "ESTIMATED"),
        days_per_month=int(calc.DAYS_PER_MONTH),
        latest_bill_kwh=latest_kwh, bill_coverage_pct=coverage, note=NOTE,
    )
