"""ERD-ADM-USERS-WRITE: request tracking and scoped account security actions.

Requests are workflow records only: they never execute an export or erase an account. All
mutations share a DB transaction with the immutable administrative audit event.
"""
import uuid

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.models.admin_user_request import AdminUserRequest
from app.models.auth import AuthSession, User
from app.services import admin
from app.services.errors import ApplicationError, InvalidInput, NotFound
from app.services.transactions import write_transaction

_ALLOWED_TRANSITIONS = {
    "pending": {"in_progress", "rejected"},
    "in_progress": {"completed", "rejected"},
    "completed": set(),
    "rejected": set(),
}


def _request_dict(row: AdminUserRequest) -> dict:
    return {
        "id": row.id,
        "target_user_id": row.target_user_id,
        "kind": row.kind,
        "status": row.status,
        "reason": row.reason,
        "resolution_reason": row.resolution_reason,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
        "resolved_at": row.resolved_at,
    }


def create_request(db: Session, *, target_user_id: uuid.UUID, actor_user_id: uuid.UUID,
                   kind: str, reason: str, request_id: str | None) -> dict:
    with write_transaction(db):
        target = db.scalar(select(User).where(User.id == target_user_id).with_for_update())
        if target is None:
            raise NotFound("Persona no encontrada")
        duplicate = db.scalar(select(AdminUserRequest.id).where(
            AdminUserRequest.target_user_id == target_user_id,
            AdminUserRequest.kind == kind,
            AdminUserRequest.status.in_(("pending", "in_progress")),
        ))
        if duplicate is not None:
            raise ApplicationError("Ya existe una solicitud activa de este tipo para esta persona")
        row = AdminUserRequest(target_user_id=target_user_id, created_by_user_id=actor_user_id,
                               kind=kind, status="pending", reason=reason)
        db.add(row)
        db.flush()
        admin.record_audit(db, actor_user_id=actor_user_id, action="users.request.create",
                           resource=f"users:{target_user_id}", scope_used="admin.users.requests.manage",
                           reason=reason, result="success", request_id=request_id,
                           metadata={"request_id": str(row.id), "kind": kind})
    return _request_dict(row)


def list_requests(db: Session, *, status: str | None, limit: int, offset: int) -> tuple[list[dict], int]:
    query = select(AdminUserRequest)
    if status:
        query = query.where(AdminUserRequest.status == status)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.scalars(query.order_by(AdminUserRequest.created_at.desc(), AdminUserRequest.id)
                      .limit(limit).offset(offset)).all()
    return [_request_dict(row) for row in rows], int(total)


def transition_request(db: Session, *, request_record_id: uuid.UUID, actor_user_id: uuid.UUID,
                       status: str, reason: str, request_id: str | None) -> dict:
    with write_transaction(db):
        row = db.scalar(select(AdminUserRequest).where(AdminUserRequest.id == request_record_id)
                        .with_for_update().execution_options(populate_existing=True))
        if row is None:
            raise NotFound("Solicitud no encontrada")
        if status not in _ALLOWED_TRANSITIONS[row.status]:
            raise InvalidInput("La solicitud no puede avanzar desde el estado actual")
        row.status = status
        row.updated_by_user_id = actor_user_id
        row.updated_at = admin.now()
        if status in ("completed", "rejected"):
            row.resolved_at = admin.now()
            row.resolution_reason = reason
        admin.record_audit(db, actor_user_id=actor_user_id, action="users.request.transition",
                           resource=f"admin_user_requests:{row.id}", scope_used="admin.users.requests.manage",
                           reason=reason, result="success", request_id=request_id,
                           metadata={"target_user_id": str(row.target_user_id), "kind": row.kind, "status": status})
    return _request_dict(row)


def close_sessions(db: Session, *, target_user_id: uuid.UUID, actor_user_id: uuid.UUID,
                   reason: str, request_id: str | None) -> dict:
    with write_transaction(db):
        target = db.scalar(select(User).where(User.id == target_user_id).with_for_update())
        if target is None:
            raise NotFound("Persona no encontrada")
        moment = admin.now()
        closed = db.execute(update(AuthSession).where(
            AuthSession.user_id == target_user_id, AuthSession.revoked_at.is_(None), AuthSession.expires_at > moment,
        ).values(revoked_at=moment)).rowcount or 0
        admin.record_audit(db, actor_user_id=actor_user_id, action="users.sessions.close",
                           resource=f"users:{target_user_id}", scope_used="admin.users.sessions.close",
                           reason=reason, result="success", request_id=request_id,
                           metadata={"closed_sessions": int(closed)})
    return {"user_id": target_user_id, "closed_sessions": int(closed)}


def deactivate_user(db: Session, *, target_user_id: uuid.UUID, actor_user_id: uuid.UUID,
                    reason: str, request_id: str | None) -> dict:
    with write_transaction(db):
        target = db.scalar(select(User).where(User.id == target_user_id).with_for_update())
        if target is None:
            raise NotFound("Persona no encontrada")
        if not target.active:
            raise ApplicationError("La cuenta ya está desactivada")
        admin.guard_admin_account_deactivation(db, target_user_id)
        target.active = False
        moment = admin.now()
        closed = db.execute(update(AuthSession).where(
            AuthSession.user_id == target_user_id, AuthSession.revoked_at.is_(None), AuthSession.expires_at > moment,
        ).values(revoked_at=moment)).rowcount or 0
        admin.record_audit(db, actor_user_id=actor_user_id, action="users.deactivate",
                           resource=f"users:{target_user_id}", scope_used="admin.users.deactivate",
                           reason=reason, result="success", request_id=request_id,
                           metadata={"closed_sessions": int(closed)})
    return {"user_id": target_user_id, "active": False, "closed_sessions": int(closed)}
