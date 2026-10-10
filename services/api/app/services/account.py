"""Account erasure (ERD-AUTH-03). One transaction; see services/api/ACCOUNT_DELETION.md.

Rules per membership of the user:
- only member of the home      -> the home and all its data are deleted (DB cascades);
- sole owner, others remain    -> OwnershipTransferRequired (409), nothing changes;
- member, or co-owner          -> only the membership row is removed.

Bill snapshots are deleted through their existing orphan-only rule (the trigger allows DELETE
only once the parent bill no longer exists), so no new bypass of the immutability triggers exists.
Audit rows of erased homes are kept but pseudonymized: actor='deleted-user', payloads cleared.
"""
from sqlalchemy import delete, func, select, update

from app.models import Home
from app.models.audit import AuditEvent
from app.models.auth import AuthSession, HomeMember, User
from app.services.auth import now, unauthorized, verify_password
from app.services.errors import ApplicationError, Forbidden
from app.services.transactions import require_home, write_transaction

DELETED_ACTOR = "deleted-user"


class OwnershipTransferRequired(ApplicationError):
    status_code = 409
    code = "ownership_transfer_required"


class ReauthenticationFailed(Forbidden):
    """Same text as a failed login: no hint whether the password or the account was wrong."""
    code = "reauthentication_failed"


def pseudonymize_audit(db, home_ids):
    if not home_ids:
        return
    db.execute(update(AuditEvent).where(AuditEvent.home_id.in_(home_ids))
               .values(actor=DELETED_ACTOR, before=None, after=None))


def _audit(db, home_id, entity, operation):
    db.add(AuditEvent(home_id=home_id, entity_id=home_id, entity=entity, operation=operation,
                      actor=DELETED_ACTOR, before=None, after=None, created_at=func.clock_timestamp()))


def delete_account(db, user, password):
    verified_hash = user.password_hash
    if not verify_password(user, password):
        raise ReauthenticationFailed(str(unauthorized()))
    with write_transaction(db):
        locked = db.scalar(select(User).where(User.id == user.id).with_for_update()
                           .execution_options(populate_existing=True))
        if locked is None:
            raise unauthorized()
        # Reset may have committed after the dependency loaded this user or after verification.
        if not locked.active or locked.password_hash != verified_hash:
            raise ReauthenticationFailed(str(unauthorized()))
        home_ids = sorted(db.scalars(select(HomeMember.home_id).where(HomeMember.user_id == user.id)))
        erase, leave = [], []
        # Same home row lock as authorize_home() for writes, in a fixed order to avoid deadlocks.
        for home_id in home_ids:
            require_home(db, home_id, lock=True)
            members = list(db.scalars(select(HomeMember).where(HomeMember.home_id == home_id).with_for_update()
                                      .execution_options(populate_existing=True)))
            mine = next(m for m in members if m.user_id == user.id)
            others = [m for m in members if m.user_id != user.id]
            if not others:
                erase.append(home_id)
            elif mine.role == "owner" and not any(m.role == "owner" for m in others):
                raise OwnershipTransferRequired(
                    "Transfiere la propiedad de las viviendas compartidas antes de borrar la cuenta")
            else:
                leave.append(home_id)
        db.execute(update(AuthSession).where(AuthSession.user_id == user.id, AuthSession.revoked_at.is_(None))
                   .values(revoked_at=now()))
        for home_id in leave:
            db.execute(delete(HomeMember).where(HomeMember.home_id == home_id, HomeMember.user_id == user.id))
            _audit(db, home_id, "home_member", "delete")
        if erase:
            # DB cascades remove bills, items, snapshots (orphan rule), alerts, readings, goals,
            # equipment, settings, contract and memberships.
            db.execute(delete(Home).where(Home.id.in_(erase)))
            pseudonymize_audit(db, erase)
            for home_id in erase:
                _audit(db, home_id, "home", "erase")
        db.flush()  # the session factory has autoflush disabled
        # Sessions and refresh tokens cascade with the user row.
        db.execute(delete(User).where(User.id == user.id))
