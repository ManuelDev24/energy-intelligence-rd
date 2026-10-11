"""ERD-SHARE-01: compartir una vivienda (invitar, aceptar, revocar, expulsar, salir, transferir la propiedad). Sin FastAPI.

Las rutas de propietario llegan con la fila de la vivienda y la del solicitante ya bloqueadas (`authorize_home`);
aceptar una invitación no pasa por ahí, así que bloquea la vivienda él mismo (misma regla que el borrado de cuenta
y la transferencia, para serializar). Los datos personales (correos) nunca van a la auditoría.
"""
import secrets
from datetime import timedelta

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.config import settings
from app.models.audit import AuditEvent
from app.models.auth import HomeInvitation, HomeMember, User
from app.services.account import ReauthenticationFailed
from app.services.auth import hash_token, now, unauthorized, verify_password
from app.services.email import EmailMessage, invitation_message
from app.services.errors import ApplicationError, InvalidInput, NotFound
from app.services.transactions import require_home, write_transaction

ACTOR = "user"


class InvitationInvalid(ApplicationError):
    """Mismo error para token desconocido, caducado, usado, revocado o de otro correo: no es un oráculo."""
    status_code = 400
    code = "invitation_invalid"
    no_store = True

    def __init__(self):
        super().__init__("La invitación no es válida o ha caducado")


class InvitationLimitReached(ApplicationError):
    status_code = 409
    code = "invitation_limit_reached"


class InvitationRateLimited(ApplicationError):
    status_code = 429
    code = "invitation_rate_limited"
    no_store = True


class AlreadyMember(ApplicationError):
    status_code = 409
    code = "already_member"


class InvitationPending(ApplicationError):
    status_code = 409
    code = "invitation_pending"


class OwnershipConflict(ApplicationError):
    status_code = 409
    code = "ownership_transfer_required"


def _audit(db, home_id, entity_id, entity, operation, before=None, after=None):
    db.add(AuditEvent(home_id=home_id, entity_id=entity_id, entity=entity, operation=operation, actor=ACTOR,
                      before=before, after=after, created_at=func.clock_timestamp()))


def _active(current):
    return (HomeInvitation.accepted_at.is_(None), HomeInvitation.revoked_at.is_(None), HomeInvitation.expires_at > current)


def list_members(db: Session, home_id) -> list[dict]:
    rows = db.execute(select(HomeMember.user_id, User.email, HomeMember.role, HomeMember.created_at)
                      .join(User, User.id == HomeMember.user_id).where(HomeMember.home_id == home_id)
                      .order_by(HomeMember.created_at, User.email)).all()
    return [{"user_id": r.user_id, "email": r.email, "role": r.role, "joined_at": r.created_at} for r in rows]


def list_invitations(db: Session, home_id) -> list[HomeInvitation]:
    return list(db.scalars(select(HomeInvitation).where(HomeInvitation.home_id == home_id, *_active(now()))
                           .order_by(HomeInvitation.created_at).execution_options(populate_existing=True)))


def create_invitation(db: Session, home, inviter, address: str) -> tuple[HomeInvitation, EmailMessage]:
    current = now()
    token = secrets.token_urlsafe(32)
    with write_transaction(db):
        # Una invitación vencida sin revocar ocuparía el hueco único de (vivienda, correo).
        db.execute(update(HomeInvitation).where(
            HomeInvitation.home_id == home.id, HomeInvitation.email == address, HomeInvitation.accepted_at.is_(None),
            HomeInvitation.revoked_at.is_(None), HomeInvitation.expires_at <= current).values(revoked_at=current))
        if address == inviter.email:
            raise InvalidInput("No puedes invitarte a ti mismo")
        if db.scalar(select(func.count()).select_from(HomeMember).join(User, User.id == HomeMember.user_id)
                     .where(HomeMember.home_id == home.id, User.email == address)):
            raise AlreadyMember("Esa persona ya es miembro de la vivienda")
        recent = db.scalar(select(func.count()).select_from(HomeInvitation).where(
            HomeInvitation.invited_by == inviter.id, HomeInvitation.created_at >= current - timedelta(hours=24)))
        if recent >= settings.INVITATION_DAILY_LIMIT_PER_USER:
            raise InvitationRateLimited("Demasiadas invitaciones hoy. Inténtalo mañana")
        pending = db.scalar(select(func.count()).select_from(HomeInvitation).where(
            HomeInvitation.home_id == home.id, *_active(current)))
        if pending >= settings.INVITATION_MAX_PENDING_PER_HOME:
            raise InvitationLimitReached("Demasiadas invitaciones pendientes en esta vivienda")
        if db.scalar(select(func.count()).select_from(HomeInvitation).where(
                HomeInvitation.home_id == home.id, HomeInvitation.email == address, *_active(current))):
            raise InvitationPending("Ya hay una invitación pendiente para ese correo")
        invitation = HomeInvitation(home_id=home.id, invited_by=inviter.id, email=address, token_hash=hash_token(token),
                                    created_at=current, expires_at=current + timedelta(days=settings.INVITATION_TTL_DAYS))
        db.add(invitation)
        db.flush()
        _audit(db, home.id, invitation.id, "home_invitation", "create", after={"role": "member"})
        home_name = home.name
    message = invitation_message(address, settings.INVITATION_URL, token, settings.INVITATION_TTL_DAYS, home_name)
    return invitation, message


def revoke_invitation(db: Session, home_id, invitation_id) -> None:
    with write_transaction(db):
        invitation = db.scalar(select(HomeInvitation).where(
            HomeInvitation.id == invitation_id, HomeInvitation.home_id == home_id,
            HomeInvitation.accepted_at.is_(None), HomeInvitation.revoked_at.is_(None)).with_for_update())
        if invitation is None:
            raise NotFound("Invitación no encontrada")
        invitation.revoked_at = now()
        _audit(db, home_id, invitation.id, "home_invitation", "revoke")


def accept_invitation(db: Session, user, token: str):
    token_hash = hash_token(token)
    home_id = db.scalar(select(HomeInvitation.home_id).where(HomeInvitation.token_hash == token_hash))
    if home_id is None:
        raise InvitationInvalid()
    with write_transaction(db):
        require_home(db, home_id, lock=True)  # serializa con borrado, transferencia y expulsión
        invitation = db.scalar(select(HomeInvitation).where(HomeInvitation.token_hash == token_hash)
                               .with_for_update().execution_options(populate_existing=True))
        current = now()
        if (invitation is None or invitation.accepted_at is not None or invitation.revoked_at is not None
                or invitation.expires_at <= current or invitation.email != user.email):
            raise InvitationInvalid()
        membership = db.scalar(select(HomeMember).where(HomeMember.home_id == home_id, HomeMember.user_id == user.id))
        if membership is None:
            db.add(HomeMember(home_id=home_id, user_id=user.id, role="member"))
            _audit(db, home_id, user.id, "home_member", "create", after={"role": "member"})
        invitation.accepted_at, invitation.accepted_by = current, user.id
        home = require_home(db, home_id)
    return home


def remove_member(db: Session, home_id, actor_id, target_id) -> None:
    if target_id == actor_id:
        raise InvalidInput("Para salir de la vivienda usa «Salir de la vivienda»")
    with write_transaction(db):
        target = db.scalar(select(HomeMember).where(HomeMember.home_id == home_id, HomeMember.user_id == target_id)
                           .with_for_update())
        if target is None:
            raise NotFound("Miembro no encontrado")
        if target.role == "owner":
            raise OwnershipConflict("No se puede expulsar a un propietario; transfiere o cede la propiedad primero")
        db.delete(target)
        _audit(db, home_id, target_id, "home_member", "delete", before={"role": target.role})


def leave_home(db: Session, home_id, user) -> None:
    with write_transaction(db):
        members = list(db.scalars(select(HomeMember).where(HomeMember.home_id == home_id).with_for_update()
                                  .execution_options(populate_existing=True)))
        mine = next((m for m in members if m.user_id == user.id), None)
        if mine is None:
            raise NotFound("Vivienda no encontrada")
        others = [m for m in members if m.user_id != user.id]
        if mine.role == "owner" and not any(m.role == "owner" for m in others):
            if others:
                raise OwnershipConflict("Transfiere la propiedad a otro miembro antes de salir")
            raise OwnershipConflict("Eres el único miembro: borra la vivienda si ya no la necesitas")
        db.delete(mine)
        _audit(db, home_id, user.id, "home_member", "delete", before={"role": mine.role})


def transfer_ownership(db: Session, home_id, actor, target_id, password: str) -> None:
    """El propietario cede la propiedad a otro miembro (queda como miembro). Reautentica con la contraseña."""
    if target_id == actor.id:
        raise InvalidInput("Ya eres el propietario")
    verified_hash = actor.password_hash
    if not verify_password(actor, password):
        raise ReauthenticationFailed(str(unauthorized()))
    with write_transaction(db):
        locked = db.scalar(select(User).where(User.id == actor.id).with_for_update().execution_options(populate_existing=True))
        if locked is None or not locked.active or locked.password_hash != verified_hash:
            raise ReauthenticationFailed(str(unauthorized()))
        members = {m.user_id: m for m in db.scalars(select(HomeMember).where(HomeMember.home_id == home_id)
                                                    .order_by(HomeMember.user_id).with_for_update()
                                                    .execution_options(populate_existing=True))}
        mine, target = members.get(actor.id), members.get(target_id)
        if mine is None or mine.role != "owner":
            raise NotFound("Vivienda no encontrada")
        if target is None:
            raise NotFound("Miembro no encontrado")
        if target.role == "owner":
            raise InvalidInput("Esa persona ya es propietaria")
        target.role, mine.role = "owner", "member"
        _audit(db, home_id, target_id, "home_member", "update", before={"role": "member"}, after={"role": "owner"})
        _audit(db, home_id, actor.id, "home_member", "update", before={"role": "owner"}, after={"role": "member"})
