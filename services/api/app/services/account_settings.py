"""ERD-PROF-01: preferencias de notificación y sesiones activas de la cuenta. Sin FastAPI."""
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models.auth import AuthSession, NotificationPreference
from app.services.auth import now
from app.services.errors import NotFound
from app.services.transactions import write_transaction


def get_preferences(db: Session, user) -> dict:
    row = db.get(NotificationPreference, user.id, populate_existing=True)
    if row is None:
        return {"alerts_email": True, "alerts_push": True, "updated_at": None}
    return {"alerts_email": row.alerts_email, "alerts_push": row.alerts_push, "updated_at": row.updated_at}


def save_preferences(db: Session, user, alerts_email: bool, alerts_push: bool) -> dict:
    with write_transaction(db):
        row = db.scalar(select(NotificationPreference).where(NotificationPreference.user_id == user.id)
                        .with_for_update().execution_options(populate_existing=True))
        if row is None:
            row = NotificationPreference(user_id=user.id)
            db.add(row)
        row.alerts_email, row.alerts_push, row.updated_at = alerts_email, alerts_push, now()
        db.flush()
        result = {"alerts_email": row.alerts_email, "alerts_push": row.alerts_push, "updated_at": row.updated_at}
    return result


def list_sessions(db: Session, user, current_session_id) -> list[dict]:
    rows = db.scalars(select(AuthSession).where(AuthSession.user_id == user.id, AuthSession.revoked_at.is_(None),
                                                AuthSession.expires_at > now()).order_by(AuthSession.created_at, AuthSession.id)
                      .execution_options(populate_existing=True))
    return [{"id": s.id, "created_at": s.created_at, "expires_at": s.expires_at, "current": s.id == current_session_id}
            for s in rows]


def revoke_session(db: Session, user, session_id) -> None:
    """Cierra una sesión de ESTA cuenta (ajena o ya cerrada = 404, sin distinguir)."""
    with write_transaction(db):
        revoked = db.execute(update(AuthSession).where(
            AuthSession.id == session_id, AuthSession.user_id == user.id, AuthSession.revoked_at.is_(None),
            AuthSession.expires_at > now()).values(revoked_at=now())).rowcount
        if not revoked:
            raise NotFound("Sesión no encontrada")


def revoke_other_sessions(db: Session, user, current_session_id) -> None:
    with write_transaction(db):
        db.execute(update(AuthSession).where(
            AuthSession.user_id == user.id, AuthSession.id != current_session_id, AuthSession.revoked_at.is_(None))
            .values(revoked_at=now()))
