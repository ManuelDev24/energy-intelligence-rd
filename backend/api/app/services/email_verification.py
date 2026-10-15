"""Auditoría C-10: verificación de correo. Sin FastAPI.

`issue` crea un token de un solo uso (solo se guarda su SHA-256) ligado al correo actual de la cuenta y devuelve el mensaje a enviar, o
None si la cuenta ya está verificada o si superó el tope de envíos por hora (la respuesta HTTP es la misma: no se revela nada).
`verify` lo canjea: marca `users.email_verified_at` si el token es válido, no se usó, no venció y el correo de la cuenta sigue siendo el mismo.
"""
import secrets
from datetime import timedelta

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.config import settings
from app.models.auth import EmailVerificationToken, User
from app.services.auth import hash_token, now
from app.services.email import EmailMessage, email_verification_message
from app.services.errors import ApplicationError
from app.services.transactions import write_transaction

PURGE_AFTER = timedelta(days=1)


class VerificationTokenInvalid(ApplicationError):
    """Mismo error para token desconocido, usado, vencido, de otro correo o de cuenta inactiva."""
    status_code = 400
    code = "verification_token_invalid"
    no_store = True

    def __init__(self):
        super().__init__("El enlace de verificación no es válido o ha caducado")


def issue(db: Session, user_id) -> EmailMessage | None:
    token = secrets.token_urlsafe(32)
    current = now()
    with write_transaction(db):
        db.execute(delete(EmailVerificationToken).where(EmailVerificationToken.expires_at < current - PURGE_AFTER))
        user = db.scalar(select(User).where(User.id == user_id).with_for_update().execution_options(populate_existing=True))
        if user is None or not user.active or user.email_verified_at is not None:
            return None
        recent = db.scalar(select(func.count()).select_from(EmailVerificationToken).where(
            EmailVerificationToken.user_id == user.id, EmailVerificationToken.created_at >= current - timedelta(hours=1)))
        if recent >= settings.EMAIL_VERIFICATION_ACCOUNT_LIMIT:
            return None
        db.execute(update(EmailVerificationToken).where(EmailVerificationToken.user_id == user.id, EmailVerificationToken.used_at.is_(None))
                   .values(used_at=current))
        db.add(EmailVerificationToken(user_id=user.id, email=user.email, token_hash=hash_token(token), created_at=current,
                                      expires_at=current + timedelta(hours=settings.EMAIL_VERIFICATION_TTL_HOURS)))
        address = user.email
    return email_verification_message(address, settings.EMAIL_VERIFICATION_URL, token, settings.EMAIL_VERIFICATION_TTL_HOURS)


def is_verified(db: Session, user_id) -> bool:
    return db.scalar(select(User.email_verified_at).where(User.id == user_id)) is not None


def verify(db: Session, token: str) -> None:
    token_hash = hash_token(token)
    with write_transaction(db):
        record = db.scalar(select(EmailVerificationToken).where(EmailVerificationToken.token_hash == token_hash).with_for_update())
        current = now()
        if record is None or record.used_at is not None or record.expires_at <= current:
            raise VerificationTokenInvalid()
        user = db.scalar(select(User).where(User.id == record.user_id).with_for_update().execution_options(populate_existing=True))
        if user is None or not user.active or user.email != record.email:
            raise VerificationTokenInvalid()
        if user.email_verified_at is None:
            user.email_verified_at = current
        db.execute(update(EmailVerificationToken).where(EmailVerificationToken.user_id == user.id, EmailVerificationToken.used_at.is_(None))
                   .values(used_at=current))
