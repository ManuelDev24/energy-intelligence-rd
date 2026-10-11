"""Estimación de consumo por equipos declarados. Todo resultado es ESTIMATED."""
from decimal import ROUND_DOWN, Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Bill, Equipment, Home
from app.schemas.dashboard import Metric
from app.schemas.equipment import EquipmentEstimateItem, EquipmentEstimateOut
from app.services import calculations as calc
from app.services.audit import record_change, snapshot
from app.services.errors import NotFound
from app.services.transactions import require_home, write_transaction


def get_equipment(db, home_id, equipment_id):
    item = db.scalar(select(Equipment).where(Equipment.id == equipment_id, Equipment.home_id == home_id))
    if item is None:
        raise NotFound("Equipo no encontrado para esta vivienda")
    return item


def list_equipment(db, home_id, limit=100, offset=0):
    require_home(db, home_id)
    return list(db.scalars(select(Equipment).where(Equipment.home_id == home_id)
                          .order_by(Equipment.room, Equipment.name, Equipment.id).limit(limit).offset(offset)))


def save_equipment(db, home_id, payload, equipment_id=None):
    with write_transaction(db):
        require_home(db, home_id, lock=True)
        item = get_equipment(db, home_id, equipment_id) if equipment_id else Equipment(home_id=home_id)
        before = snapshot(item) if equipment_id else None
        for key, value in payload.model_dump().items():
            setattr(item, key, value)
        db.add(item)
        record_change(db, home_id, item, "update" if equipment_id else "create", before)
    return item


def delete_equipment(db, home_id, equipment_id):
    with write_transaction(db):
        require_home(db, home_id, lock=True)
        item = get_equipment(db, home_id, equipment_id)
        record_change(db, home_id, item, "delete", snapshot(item))
        db.delete(item)

NOTE = ("Estimación por potencia nominal × horas de uso declaradas × 30 días. "
        "No es una medición: el consumo real depende del uso, la eficiencia y el ciclo de cada equipo. "
        "El porcentaje por equipo es su parte del total estimado de los equipos declarados, no de la factura.")


def shares_pct(raw: list[Decimal]) -> list[Decimal]:
    """Reparto en % con 2 decimales que suma exactamente 100,00 (método del mayor resto). Sin consumo: todo 0."""
    total = sum(raw, Decimal(0))
    if total <= 0:
        return [Decimal("0.00")] * len(raw)
    cents = Decimal("0.01")
    exact = [value / total * 100 for value in raw]
    floors = [x.quantize(cents, rounding=ROUND_DOWN) for x in exact]
    missing = int(((Decimal(100) - sum(floors, Decimal(0))) / cents).to_integral_value())
    # Quien más resto tiene recibe el centésimo que falta; a igualdad, el de menor índice (resultado estable).
    order = sorted(range(len(raw)), key=lambda i: (-(exact[i] - floors[i]), i))
    for i in order[:missing]:
        floors[i] += cents
    return floors


def _m(value: Decimal, unit: str, quality: str) -> Metric:
    return Metric(value=value, unit=unit, quality=quality)


def build_estimate(db: Session, home: Home) -> EquipmentEstimateOut:
    items = list(db.scalars(
        select(Equipment).where(Equipment.home_id == home.id).order_by(Equipment.room, Equipment.name)
    ))
    out_items = []
    total_daily = total_monthly = Decimal(0)
    shares = shares_pct([e.power_w * e.hours_per_day for e in items])
    for e, share in zip(items, shares, strict=True):
        daily = calc.equipment_daily_kwh(e.power_w, e.hours_per_day)
        monthly = calc.equipment_monthly_kwh(e.power_w, e.hours_per_day)
        total_daily += daily
        total_monthly += monthly
        out_items.append(EquipmentEstimateItem(
            equipment_id=e.id, name=e.name, room=e.room, kind=e.kind, brand=e.brand, model=e.model, icon=e.icon,
            daily_kwh=_m(daily, "kWh/día", "ESTIMATED"), monthly_kwh=_m(monthly, "kWh/mes", "ESTIMATED"),
            share_pct=_m(share, "%", "ESTIMATED"),
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
