"""ERD-AUTH-05: recuperación de contraseña sin enumeración de cuentas. Sin FastAPI.

`request_reset` hace el mismo trabajo visible (token aleatorio + SHA-256 + consultas) exista o no
la cuenta y nunca informa del resultado al llamador HTTP: devuelve el mensaje a enviar (o None) y la
ruta lo entrega en segundo plano, después de responder 202.
"""
import secrets
from datetime import timedelta

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.config import settings
from app.models.auth import AuthSession, PasswordResetToken, User
from app.services.auth import hash_token, now, password_hasher
from app.services.auth_abuse import bucket_key
from app.services.email import EmailMessage, password_reset_message
from app.services.errors import ApplicationError
from app.services.transactions import write_transaction

# Las filas vencidas se purgan pasado este margen (≥ ventana máxima de cooldown por cuenta: 1 día).
PURGE_AFTER = timedelta(days=1)


class ResetTokenInvalid(ApplicationError):
    """Mismo error para token desconocido, caducado, usado o de cuenta inactiva."""
    status_code = 400
    code = "reset_token_invalid"
    no_store = True

    def __init__(self):
        super().__init__("El enlace de recuperación no es válido o ha caducado")


def revoke_all_sessions(db, user_id, at):
    """Revoca todas las familias de refresh; los access tokens de esas sesiones fallan al instante."""
    db.execute(update(AuthSession).where(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None))
               .values(revoked_at=at))


def request_reset(db, email: str, peer: str) -> EmailMessage | None:
    token = secrets.token_urlsafe(32)
    token_hash = hash_token(token)  # también para correos desconocidos: trabajo comparable
    current = now()
    # Maintenance must commit before acquiring ANY user lock: account erasure cascades
    # user -> token, so a token -> user transaction would introduce a deadlock cycle.
    # Independent session: never commit pending work in the caller's unit of work.
    with Session(db.get_bind()) as maintenance, maintenance.begin():
        maintenance.execute(delete(PasswordResetToken).where(PasswordResetToken.expires_at < current - PURGE_AFTER))
    with write_transaction(db):
        # Bloquea la fila del usuario: serializa cooldown e invalidación de solicitudes simultáneas.
        user = db.scalar(select(User).where(User.email == email).with_for_update())
        if user is None or not user.active:
            return None
        window_start = current - timedelta(seconds=settings.PASSWORD_RESET_ACCOUNT_WINDOW_SECONDS)
        recent = db.scalar(select(func.count()).select_from(PasswordResetToken).where(
            PasswordResetToken.user_id == user.id, PasswordResetToken.created_at >= window_start))
        if recent >= settings.PASSWORD_RESET_ACCOUNT_LIMIT:
            return None  # cooldown por cuenta: misma respuesta, sin correo
        db.execute(update(PasswordResetToken).where(PasswordResetToken.user_id == user.id,
                                                    PasswordResetToken.used_at.is_(None))
                   .values(used_at=current))
        db.add(PasswordResetToken(user_id=user.id, token_hash=token_hash, created_at=current,
                                  expires_at=current + timedelta(minutes=settings.PASSWORD_RESET_TTL_MINUTES),
                                  requested_peer_hash=bucket_key("password-reset-request", peer)))
        address = user.email
    return password_reset_message(address, settings.PASSWORD_RESET_URL, token, settings.PASSWORD_RESET_TTL_MINUTES)


def _usable(record, user, at):
    return (record is not None and record.used_at is None and record.expires_at > at
            and user is not None and user.active)


def reset_password(db, token: str, new_password: str) -> None:
    token_hash = hash_token(token)
    record = db.scalar(select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash))
    if record is None or record.used_at is not None or record.expires_at <= now():
        raise ResetTokenInvalid()
    user_id = record.user_id
    db.rollback()  # no mantener la transacción de lectura abierta durante Argon2
    new_hash = password_hasher.hash(new_password)  # fuera de los bloqueos
    with write_transaction(db):
        user = db.scalar(select(User).where(User.id == user_id).with_for_update()
                         .execution_options(populate_existing=True))
        record = db.scalar(select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash)
                           .with_for_update().execution_options(populate_existing=True))
        current = now()
        if not _usable(record, user, current):
            raise ResetTokenInvalid()
        user.password_hash = new_hash
        db.execute(update(PasswordResetToken).where(PasswordResetToken.user_id == user_id,
                                                    PasswordResetToken.used_at.is_(None))
                   .values(used_at=current))
        revoke_all_sessions(db, user_id, current)
