"""ERD-ALERT-02: avisos por correo y push de las alertas importantes. Sin FastAPI.

Solo avisan las alertas `warning` y `critical` y solo las recientes (capturar facturas viejas no manda correos); las
`info`/`savings` se ven en la app. Cada envío es una fila única por (alerta, persona, canal, severidad): reevaluar no repite,
una escalada de severidad sí avisa una vez más. Las preferencias (`alerts_email`, `alerts_push`) se aplican al encolar y otra
vez al enviar. El correo no lleva cifras ni datos de consumo: solo el tipo de aviso y a dónde ir.
"""
import html
import logging
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Alert, DeviceToken, Home, HomeMember, Notification, User
from app.models.auth import NotificationPreference
from app.services import email, push
from app.services.email import EmailMessage
from app.services.jobs import queue

log = logging.getLogger("energyrd.notifications")
KIND = "notifications.deliver"
# Solo avisan estos tipos. «Datos incompletos» (falta una factura, lecturas atrasadas) se ve en la app: nunca es urgente.
NOTIFY_TYPES = ("bill_variation", "anomaly", "payment_due")
SEVERITY_WORD = {"critical": "crítica", "warning": "importante"}
ANOMALY_TITLES = {"increase": "Consumo más alto de lo habitual", "drop": "Consumo más bajo de lo habitual",
                  "peak": "Pico de consumo en un día", "night": "Consumo nocturno alto"}


def alert_title(alert: Alert, anomaly_kind: str | None = None) -> str:
    """Titular corto y sin cifras (sirve para correo y push)."""
    if alert.type == "payment_due":
        return "Su factura está vencida" if alert.severity == "critical" else "Su factura vence pronto"
    if alert.type == "anomaly":
        return ANOMALY_TITLES.get(anomaly_kind or "", "Desviación de consumo detectada")
    if alert.type == "bill_variation":
        return "Su consumo subió frente al período anterior"
    return "Tiene una alerta nueva"


def web_origin() -> str:
    parts = urlsplit(settings.PASSWORD_RESET_URL)
    return f"{parts.scheme}://{parts.netloc}"


def alert_email(to: str, home_name: str, alert: Alert, title: str) -> EmailMessage:
    link = f"{web_origin()}/alerts"
    word = SEVERITY_WORD.get(alert.severity, "nueva")
    text = (f"Hola:\n\nHay una alerta {word} en «{home_name}»: {title}.\n\nRevísela en Energy RD:\n{link}\n\n"
            "Puede elegir qué avisos recibir en Perfil → Notificaciones.\n\nEnergy RD\n")
    safe = html.escape(link, quote=True)
    body = ('<!doctype html><html lang="es"><body style="font-family:Arial,sans-serif;color:#1f2937"><p>Hola:</p>'
            f"<p>Hay una alerta {word} en «{html.escape(home_name)}»: <strong>{html.escape(title)}</strong>.</p>"
            f'<p><a href="{safe}">Revisar la alerta en Energy RD</a></p>'
            "<p>Puede elegir qué avisos recibir en Perfil → Notificaciones.</p><p>Energy RD</p></body></html>")
    return EmailMessage(to=to, subject=f"Energy RD: {title}", text=text, html=body)


def _prefs(db: Session, user_ids) -> dict:
    return {row.user_id: row for row in db.scalars(select(NotificationPreference).where(NotificationPreference.user_id.in_(list(user_ids))))}


def fan_out(db: Session, home_id, alerts, *, now: datetime | None = None) -> int:
    """Crea los envíos pendientes (uno por persona y canal activo) y encola su entrega. No hace commit."""
    alerts = [a for a in alerts if a.severity in ("warning", "critical") and a.type in NOTIFY_TYPES]
    if not alerts:
        return 0
    members = list(db.scalars(select(HomeMember.user_id).where(HomeMember.home_id == home_id)))
    if not members:
        return 0
    prefs = _prefs(db, members)
    with_device = set(db.scalars(select(DeviceToken.user_id).where(DeviceToken.user_id.in_(members))))
    created = 0
    for alert in alerts:
        for user_id in members:
            pref = prefs.get(user_id)
            channels = [c for c, enabled in (("email", pref.alerts_email if pref else True), ("push", (pref.alerts_push if pref else True) and user_id in with_device)) if enabled]
            for channel in channels:
                new_id = db.execute(pg_insert(Notification).values(id=uuid.uuid4(), alert_id=alert.id, user_id=user_id, channel=channel,
                                                                    severity=alert.severity, status="pending")
                                    .on_conflict_do_nothing(constraint="uq_notifications_once").returning(Notification.id)).scalar()
                if new_id is None:
                    continue
                queue.enqueue(db, KIND, {"notification_id": str(new_id)}, idempotency_key=str(new_id), now=now, commit=False)
                created += 1
    return created


def _skip(row: Notification, reason: str) -> str:
    row.status, row.reason = "skipped", reason
    return "skipped"


def deliver(db: Session, notification_id, *, attempt: int, max_attempts: int, now: datetime | None = None,
            email_sender=None, push_sender=None) -> str:
    """Entrega un aviso. Devuelve `sent`, `skipped`, `failed` o `gone`; lanza `RuntimeError` para que el trabajo reintente."""
    current = now or datetime.now(timezone.utc)
    row = db.get(Notification, notification_id, with_for_update=True, populate_existing=True)
    if row is None:
        return "gone"
    if row.status != "pending":
        return row.status
    row.attempts = attempt
    alert = db.get(Alert, row.alert_id)
    user = db.get(User, row.user_id)
    if alert is None or user is None:
        return _skip_commit(db, row, "gone")
    pref = db.get(NotificationPreference, row.user_id)
    enabled = (pref.alerts_email if pref else True) if row.channel == "email" else (pref.alerts_push if pref else True)
    if not enabled:
        return _skip_commit(db, row, "preference")
    if alert.status == "dismissed":
        return _skip_commit(db, row, "dismissed")
    if row.channel == "email" and user.email_verified_at is None:
        return _skip_commit(db, row, "unverified_email")  # auditoría C-10: nunca correo a una dirección no confirmada
    sent_today = db.scalar(select(func.count()).select_from(Notification).where(
        Notification.user_id == row.user_id, Notification.channel == row.channel, Notification.status == "sent",
        Notification.sent_at > current - timedelta(hours=24)))
    if sent_today >= settings.NOTIFY_DAILY_CAP:
        return _skip_commit(db, row, "daily_cap")
    kind = None
    if alert.anomaly_id is not None:
        from app.models import Anomaly
        kind = db.scalar(select(Anomaly.kind).where(Anomaly.id == alert.anomaly_id))
    title = alert_title(alert, kind)
    try:
        if row.channel == "email":
            home_name = db.scalar(select(Home.name).where(Home.id == alert.home_id)) or "su vivienda"
            if not (email_sender or email.get_email_sender()).send(alert_email(user.email, home_name, alert, title)):
                raise RuntimeError("email_failed")
        else:
            tokens = list(db.scalars(select(DeviceToken.token).where(DeviceToken.user_id == row.user_id)))
            if not tokens:
                return _skip_commit(db, row, "no_device")
            result = (push_sender or push.get_push_sender()).send(tokens, title=title, body="Ábrala en Energy RD para ver los detalles.",
                                                                  data={"alert_id": str(alert.id), "home_id": str(alert.home_id)})
            if result.invalid:
                db.execute(delete(DeviceToken).where(DeviceToken.token.in_(result.invalid)))
            if result.delivered == 0:
                row.status, row.reason = "failed", "no_valid_device"
                db.commit()
                return "failed"
    except (RuntimeError, push.PushUnavailable):
        if attempt >= max_attempts:
            row.status, row.reason = "failed", "delivery_error"
            db.commit()
            return "failed"
        db.commit()  # conserva el contador de intentos
        raise RuntimeError("delivery_retry") from None
    row.status, row.sent_at, row.reason = "sent", current, None
    db.commit()
    return "sent"


def _skip_commit(db: Session, row: Notification, reason: str) -> str:
    _skip(row, reason)
    db.commit()
    return "skipped"
