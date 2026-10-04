"""Alertas por variación de factura y umbrales por vivienda.

Reglas:
- Solo hay alerta si existe historial (factura anterior) y la variación de kWh supera el umbral.
- El período base es la factura inmediatamente anterior (por fecha de período).
- Si el período base tiene 0 kWh no se calcula % y no hay alerta (no se inventa).
- Recalcular conserva el estado (read/dismissed) de alertas que siguen siendo válidas.
"""
import uuid
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Alert, AlertSettings, Bill
from app.models.alert import ALERT_TYPE_BILL_VARIATION
from app.services import calculations as calc


def get_settings(db: Session, home_id: uuid.UUID) -> AlertSettings:
    s = db.get(AlertSettings, home_id)
    if s is None:
        s = AlertSettings(home_id=home_id, warning_pct=calc.WARNING_PCT, critical_pct=calc.CRITICAL_PCT)
        db.add(s)
        db.flush()
    return s


def thresholds(db: Session, home_id: uuid.UUID) -> tuple[Decimal, Decimal]:
    """Umbrales vigentes sin crear fila (para lecturas como el dashboard)."""
    s = db.get(AlertSettings, home_id)
    if s is None:
        return calc.WARNING_PCT, calc.CRITICAL_PCT
    return Decimal(s.warning_pct), Decimal(s.critical_pct)


def _message(pct: Decimal, prev: Bill, cur: Bill) -> str:
    return (f"El consumo subió {pct}% frente al período anterior "
            f"({prev.kwh} kWh → {cur.kwh} kWh).")


def recompute_alerts(db: Session, home_id: uuid.UUID) -> None:
    """Recalcula las alertas de variación de toda la vivienda. No hace commit."""
    warning_pct, critical_pct = thresholds(db, home_id)
    bills = list(db.scalars(
        select(Bill).where(Bill.home_id == home_id).order_by(Bill.period_end, Bill.period_start)
    ))
    existing = {a.bill_id: a for a in db.scalars(
        select(Alert).where(Alert.home_id == home_id, Alert.type == ALERT_TYPE_BILL_VARIATION)
    )}
    wanted: set[uuid.UUID] = set()
    for prev, cur in zip(bills, bills[1:]):
        v = calc.variation(cur, prev)
        sev = calc.severity_for(v.kwh_pct, warning_pct, critical_pct)
        if sev is None:
            continue
        wanted.add(cur.id)
        threshold = critical_pct if sev == "critical" else warning_pct
        fields = dict(
            basis_bill_id=prev.id, basis_period_start=prev.period_start, basis_period_end=prev.period_end,
            kwh_pct=v.kwh_pct, threshold_pct=threshold, severity=sev, message=_message(v.kwh_pct, prev, cur),
        )
        alert = existing.get(cur.id)
        if alert is None:
            db.add(Alert(home_id=home_id, bill_id=cur.id, type=ALERT_TYPE_BILL_VARIATION, **fields))
        else:
            # Si cambió el contenido (otra base, otro %), vuelve a "no leída"; si no, conserva el estado.
            changed = (alert.basis_bill_id != prev.id or alert.severity != sev
                       or Decimal(alert.kwh_pct or 0) != v.kwh_pct)
            for k, val in fields.items():
                setattr(alert, k, val)
            if changed:
                alert.status = "unread"
    for bill_id, alert in existing.items():
        if bill_id not in wanted:
            db.delete(alert)
    db.flush()
