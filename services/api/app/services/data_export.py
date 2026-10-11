"""ERD-LEGAL-FINAL: exportación de los datos del titular (derecho de acceso y portabilidad, Ley 172-13). Sin FastAPI.

Incluye los datos de la cuenta y de las viviendas donde la persona es miembro. NUNCA incluye: hash de contraseña,
tokens ni sus hashes, claves de almacenamiento, auditoría interna, invitaciones enviadas ni datos de otras personas
(correos de otros miembros o viviendas ajenas). Las viviendas compartidas se exportan con el rol del solicitante.
"""
from datetime import datetime, timezone

from pydantic_core import to_jsonable_python
from sqlalchemy import inspect, select
from sqlalchemy.orm import Session

from app.models import (Alert, AlertSettings, Anomaly, Bill, Contract, PowerOutage, Recommendation, DeviceToken, Document, Equipment, Home, HomeGoal, MeterReading,
                        Notification)
from app.models.bill_detail import BillItem
from app.models.auth import AuthSession, HomeMember, NotificationPreference, User

FORMAT_VERSION = 1
# Los montos y kWh son Decimal: pydantic los serializa como texto exacto (igual que la API), nunca como float.


def _row(record, *, exclude: frozenset = frozenset()) -> dict:
    return to_jsonable_python({column.key: getattr(record, column.key) for column in inspect(record).mapper.column_attrs
                               if column.key not in exclude})


def _rows(db: Session, model, home_id, order, *, exclude: frozenset = frozenset(), key="home_id") -> list[dict]:
    return [_row(record, exclude=exclude) for record in db.scalars(
        select(model).where(getattr(model, key) == home_id).order_by(*order))]


def export_user_data(db: Session, user: User, now: datetime | None = None) -> dict:
    homes = []
    memberships = db.execute(select(HomeMember, Home).join(Home, Home.id == HomeMember.home_id)
                             .where(HomeMember.user_id == user.id).order_by(Home.created_at, Home.id)).all()
    for membership, home in memberships:
        bills = []
        for bill in db.scalars(select(Bill).where(Bill.home_id == home.id).order_by(Bill.period_start, Bill.id)):
            items = [_row(item, exclude=frozenset({"bill_id"})) for item in db.scalars(
                select(BillItem).where(BillItem.bill_id == bill.id).order_by(BillItem.position))]
            bills.append({**_row(bill), "items": items})
        contract = db.scalar(select(Contract).where(Contract.home_id == home.id))
        goal = db.scalar(select(HomeGoal).where(HomeGoal.home_id == home.id))
        settings = db.scalar(select(AlertSettings).where(AlertSettings.home_id == home.id))
        homes.append({
            "role": membership.role,
            "home": _row(home),
            "contract": _row(contract) if contract else None,
            "goal": _row(goal) if goal else None,
            "alert_settings": _row(settings) if settings else None,
            "bills": bills,
            "equipment": _rows(db, Equipment, home.id, (Equipment.created_at, Equipment.id)),
            "readings": _rows(db, MeterReading, home.id, (MeterReading.read_at, MeterReading.id)),
            "outages": _rows(db, PowerOutage, home.id, (PowerOutage.started_at, PowerOutage.id)),
            "recommendations": _rows(db, Recommendation, home.id, (Recommendation.created_at, Recommendation.id), exclude=frozenset({"dedupe_key"})),
            "alerts": _rows(db, Alert, home.id, (Alert.created_at, Alert.id), exclude=frozenset({"dedupe_key"})),
            "anomalies": _rows(db, Anomaly, home.id, (Anomaly.period_start, Anomaly.id), exclude=frozenset({"dedupe_key"})),
            "documents": _rows(db, Document, home.id, (Document.created_at, Document.id),
                               exclude=frozenset({"storage_key", "uploaded_by"})),
        })
    sessions = [_row(s, exclude=frozenset({"id", "user_id"})) for s in db.scalars(
        select(AuthSession).where(AuthSession.user_id == user.id).order_by(AuthSession.created_at))]
    preferences = db.get(NotificationPreference, user.id)
    devices = [_row(d, exclude=frozenset({"id", "user_id", "token"})) for d in db.scalars(
        select(DeviceToken).where(DeviceToken.user_id == user.id).order_by(DeviceToken.created_at, DeviceToken.id))]
    notifications = [_row(n, exclude=frozenset({"id", "user_id"})) for n in db.scalars(
        select(Notification).where(Notification.user_id == user.id).order_by(Notification.created_at, Notification.id))]
    return {
        "format_version": FORMAT_VERSION,
        "generated_at": to_jsonable_python(now or datetime.now(timezone.utc)),
        "account": _row(user, exclude=frozenset({"password_hash", "active"})),
        "homes": homes,
        "sessions": sessions,
        "notification_preferences": _row(preferences, exclude=frozenset({"user_id"})) if preferences else None,
        "devices": devices,
        "notifications": notifications,
        "not_included": ["contraseña y hashes", "tokens (incluidos los de notificaciones push)", "claves de almacenamiento de archivos",
                         "auditoría interna", "datos de otras personas", "invitaciones enviadas a terceros"],
    }
