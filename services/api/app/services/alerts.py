"""Alertas por variación de factura y umbrales por vivienda.

Reglas:
- Solo hay alerta si existe historial (factura anterior) y la variación de kWh supera el umbral.
- El período base es la factura inmediatamente anterior (por fecha de período).
- Si el período base tiene 0 kWh no se calcula % y no hay alerta (no se inventa).
- Recalcular conserva el estado (read/dismissed) de alertas que siguen siendo válidas.
"""
import logging
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import func, select, case
from sqlalchemy.orm import Session

from app.models import Alert, AlertSettings, Anomaly, Bill, MeterReading
from app.models.alert import (ALERT_TYPE_ANOMALY, ALERT_TYPE_BILL_VARIATION, ALERT_TYPE_MISSING_BILL, ALERT_TYPE_PAYMENT,
                              ALERT_TYPE_STALE_READINGS)
from app.services import alert_rules
from app.services import consumption_calc as cc
from app.services import calculations as calc
from app.services.transactions import require_home, write_transaction
from app.services.audit import record_change, snapshot
from app.services.errors import NotFound


log = logging.getLogger("energyrd.alerts")
SAVINGS_PCT = Decimal(20)
SEVERITY_RANK = {"savings": 0, "info": 1, "warning": 2, "critical": 3}
RULE_TYPES = (ALERT_TYPE_PAYMENT, ALERT_TYPE_MISSING_BILL, ALERT_TYPE_STALE_READINGS)
FRESH_DAYS_DAY = 14      # una desviación de un día solo genera aviso mientras es reciente
FRESH_DAYS_PERIOD = 45   # facturas y meses: reciente = cerró en los últimos 45 días


@dataclass
class AlertChanges:
    """Qué cambió en una evaluación: sirve para avisar solo de lo nuevo o de lo que empeoró."""
    created: list[Alert] = field(default_factory=list)
    escalated: list[Alert] = field(default_factory=list)
    # (alerta, fecha a la que se refiere): las viejas (capturar facturas pasadas) se listan pero no se envían por correo/push.
    references: dict = field(default_factory=dict)

    def notifiable(self, today: date) -> list[Alert]:
        out = []
        for alert in [*self.created, *self.escalated]:
            reference = self.references.get(alert.id)
            if alert.severity in ("warning", "critical") and (reference is None or (today - reference).days <= FRESH_DAYS_PERIOD):
                out.append(alert)
        return out


def _today(now: datetime | None) -> date:
    return (now or datetime.now(timezone.utc)).astimezone(cc.SANTO_DOMINGO).date()


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
    if pct < 0:
        return _message_savings(pct, prev, cur)
    return (f"El consumo subió {pct}% frente al período anterior "
            f"({calc.q2(prev.kwh)} kWh → {calc.q2(cur.kwh)} kWh).")


def recompute_alerts(db: Session, home_id: uuid.UUID) -> AlertChanges:
    """Recalcula las alertas de variación de toda la vivienda. No hace commit."""
    warning_pct, critical_pct = thresholds(db, home_id)
    bills = list(db.scalars(
        select(Bill).where(Bill.home_id == home_id).order_by(Bill.period_end, Bill.period_start)
    ))
    existing = {a.bill_id: a for a in db.scalars(
        select(Alert).where(Alert.home_id == home_id, Alert.type == ALERT_TYPE_BILL_VARIATION)
    )}
    changes = AlertChanges()
    wanted: set[uuid.UUID] = set()
    for prev, cur in zip(bills, bills[1:]):
        v = calc.variation(cur, prev)
        sev = calc.severity_for(v.kwh_pct, warning_pct, critical_pct)
        if sev is None and v.kwh_pct is not None and v.kwh_pct <= -SAVINGS_PCT:
            sev = "savings"  # bajó de forma notable: se celebra en la app, nunca se envía por correo ni push
        if sev is None:
            continue
        wanted.add(cur.id)
        threshold = SAVINGS_PCT if sev == "savings" else critical_pct if sev == "critical" else warning_pct
        fields = dict(
            basis_bill_id=prev.id, basis_period_start=prev.period_start, basis_period_end=prev.period_end,
            kwh_pct=v.kwh_pct, threshold_pct=threshold, severity=sev, message=_message(v.kwh_pct, prev, cur),
        )
        alert = existing.get(cur.id)
        if alert is None:
            alert = Alert(home_id=home_id, bill_id=cur.id, type=ALERT_TYPE_BILL_VARIATION, **fields)
            db.add(alert)
            db.flush()
            changes.created.append(alert)
        else:
            # Si cambió el contenido (otra base, otro %), vuelve a "no leída"; si no, conserva el estado.
            changed = (alert.basis_bill_id != prev.id or alert.severity != sev
                       or Decimal(alert.kwh_pct or 0) != v.kwh_pct)
            if SEVERITY_RANK[sev] > SEVERITY_RANK[alert.severity]:
                changes.escalated.append(alert)
            for k, val in fields.items():
                setattr(alert, k, val)
            if changed:
                alert.status = "unread"
        changes.references[alert.id] = cur.period_end
    for bill_id, alert in existing.items():
        if bill_id not in wanted:
            db.delete(alert)
    db.flush()
    return changes


def _message_savings(pct: Decimal, prev: Bill, cur: Bill) -> str:
    return (f"El consumo bajó {abs(pct)}% frente al período anterior "
            f"({calc.q2(prev.kwh)} kWh → {calc.q2(cur.kwh)} kWh). ¡Buen trabajo!")


def reconcile_rule_alerts(db: Session, home_id: uuid.UUID, today: date, changes: AlertChanges) -> None:
    """Alertas de pago y de datos incompletos: se crean, se actualizan o se retiran según el estado actual."""
    bills = list(db.scalars(select(Bill).where(Bill.home_id == home_id)))
    count, last = db.execute(select(func.count(MeterReading.id), func.max(MeterReading.read_at)).where(MeterReading.home_id == home_id)).one()
    last_day = last.astimezone(cc.SANTO_DOMINGO).date() if last else None
    wanted = {r.key: r for r in (alert_rules.payment_alert(bills, today), alert_rules.missing_bill_alert(bills, today),
                                 alert_rules.stale_readings_alert(count, last_day, today)) if r is not None}
    existing = {a.dedupe_key: a for a in db.scalars(select(Alert).where(Alert.home_id == home_id, Alert.type.in_(RULE_TYPES)))}
    for key, rule in wanted.items():
        alert = existing.get(key)
        if alert is None:
            alert = Alert(home_id=home_id, bill_id=rule.bill_id, type=rule.type, severity=rule.severity, message=rule.message, dedupe_key=key)
            db.add(alert)
            db.flush()
            changes.created.append(alert)
            continue
        if SEVERITY_RANK[rule.severity] > SEVERITY_RANK[alert.severity]:
            alert.status = "unread"
            changes.escalated.append(alert)
        alert.severity, alert.message = rule.severity, rule.message
    for key, alert in existing.items():
        if key not in wanted:
            db.delete(alert)  # la condición ya no se cumple (se pagó, se registró la factura…): al volver a cumplirse avisará de nuevo
    db.flush()


def refresh_alerts(db: Session, home_id: uuid.UUID, *, now: datetime | None = None, notify: bool = True) -> AlertChanges:
    """Evalúa todas las alertas por reglas de la vivienda y encola los avisos de lo nuevo. No hace commit."""
    from app.services import notifications  # import tardío: notifications usa modelos que alerts también toca
    today = _today(now)
    changes = recompute_alerts(db, home_id)
    reconcile_rule_alerts(db, home_id, today, changes)
    if notify:
        notifications.fan_out(db, home_id, changes.notifiable(today), now=now)
    return changes


def finish_write(db: Session, home_id: uuid.UUID, changes: AlertChanges | None = None, *, now: datetime | None = None) -> None:
    """Tras escribir facturas o lecturas: reglas de pago/datos incompletos y avisos de lo nuevo. NUNCA hace fallar la escritura
    (SAVEPOINT): el trabajo diario `alerts.evaluate_home` lo reintenta."""
    from app.services import notifications
    try:
        with db.begin_nested():
            changes = changes or AlertChanges()
            today = _today(now)
            reconcile_rule_alerts(db, home_id, today, changes)
            notifications.fan_out(db, home_id, changes.notifiable(today), now=now)
    except Exception:  # noqa: BLE001
        log.exception("alert evaluation failed after write", extra={"home_id": str(home_id)})


def sync_anomaly_alerts(db: Session, home_id: uuid.UUID, *, now: datetime | None = None, notify: bool = True) -> AlertChanges:
    """Una alerta por anomalía reciente y vigente; se retira al resolverse y se descarta al descartarse la anomalía."""
    from app.services import notifications
    today = _today(now)
    changes = AlertChanges()
    anomalies = list(db.scalars(select(Anomaly).where(Anomaly.home_id == home_id)))
    existing = {a.anomaly_id: a for a in db.scalars(select(Alert).where(Alert.home_id == home_id, Alert.type == ALERT_TYPE_ANOMALY))}
    for anomaly in anomalies:
        alert = existing.get(anomaly.id)
        if anomaly.status == "resolved":
            if alert is not None:
                db.delete(alert)
            continue
        window = FRESH_DAYS_DAY if anomaly.granularity == "day" else FRESH_DAYS_PERIOD
        if alert is None:
            if anomaly.status == "dismissed" or (today - anomaly.period_end).days > window:
                continue  # lo viejo se ve en el panel de desviaciones, pero no genera una alerta nueva
            alert = Alert(home_id=home_id, bill_id=anomaly.bill_id, anomaly_id=anomaly.id, type=ALERT_TYPE_ANOMALY,
                          severity=anomaly.severity, message=anomaly.explanation, dedupe_key=f"anomaly:{anomaly.id}",
                          status={"open": "unread", "acknowledged": "read"}.get(anomaly.status, "unread"))
            db.add(alert)
            db.flush()
            changes.created.append(alert)
            changes.references[alert.id] = anomaly.period_end
            continue
        if anomaly.status != "dismissed" and SEVERITY_RANK[anomaly.severity] > SEVERITY_RANK[alert.severity]:
            changes.escalated.append(alert)
            changes.references[alert.id] = anomaly.period_end
            alert.status = "unread"
        else:  # el estado de la alerta sigue al de la anomalía (se pueden cambiar desde cualquiera de las dos pantallas)
            alert.status = {"open": "unread", "acknowledged": "read", "dismissed": "dismissed"}[anomaly.status]
        alert.severity, alert.message = anomaly.severity, anomaly.explanation
    db.flush()
    if notify:
        notifications.fan_out(db, home_id, changes.notifiable(today), now=now)
    return changes


def update_settings(db, home_id, payload):
    with write_transaction(db):
        require_home(db, home_id, lock=True)
        settings = get_settings(db, home_id)
        before = snapshot(settings)
        settings.warning_pct, settings.critical_pct = payload.warning_pct, payload.critical_pct
        record_change(db, home_id, settings, "update", before)
        recompute_alerts(db, home_id)
    return settings


def update_status(db, home_id, alert_id, payload):
    with write_transaction(db):
        require_home(db, home_id, lock=True)
        alert = db.scalar(select(Alert).where(Alert.id == alert_id, Alert.home_id == home_id))
        if alert is None:
            raise NotFound("Alerta no encontrada para esta vivienda")
        before = snapshot(alert)
        alert.status = payload.status
        if alert.anomaly_id is not None:  # misma cosa vista desde dos pantallas: el estado se mantiene coherente
            anomaly = db.get(Anomaly, alert.anomaly_id, with_for_update=True)
            if anomaly is not None and anomaly.status != "resolved":
                anomaly.status = {"unread": "open", "read": "acknowledged", "dismissed": "dismissed"}[payload.status]
                anomaly.status_changed_at = datetime.now(timezone.utc)
        record_change(db, home_id, alert, "update", before)
    return alert


def list_alert_records(db, home_id, status=None, include_dismissed=False, limit=100, offset=0):
    q = select(Alert).where(Alert.home_id == home_id)
    if status is not None:
        q = q.where(Alert.status == status)
    elif not include_dismissed:
        q = q.where(Alert.status != "dismissed")
    unread_first = case((Alert.status == "unread", 0), else_=1)
    return list(db.scalars(q.order_by(unread_first, Alert.basis_period_end.desc(), Alert.created_at.desc(), Alert.id)
                           .limit(limit).offset(offset)))
