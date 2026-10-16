"""Admin RBAC: roles, scopes, assignments and immutable audit. No FastAPI imports here
(enforced by scripts/check_architecture.py) — HTTP concerns live in app.api.*.

Security invariants this module must preserve:
- Deny by default: effective_scopes() only ever returns scopes backed by an active,
  non-expired admin_role_assignments row, recomputed from the DB on every call.
- No is_admin=true bypass: nothing here ever grants a scope outside admin_role_scopes.
- Last super_admin cannot be revoked (count active super_admin assignments before revoking).
- Every assignment/revocation is both constrained by DB checks (reason NOT NULL) and audited.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.models.admin import AdminAuditEvent, AdminRole, AdminRoleAssignment, AdminRoleScope, AdminScope
from app.models.auth import User
from app.services.errors import ApplicationError, Forbidden, InvalidInput, NotFound
from app.services.transactions import write_transaction

SUPER_ADMIN = "super_admin"


def now():
    return datetime.now(timezone.utc)


def record_audit(db: Session, *, actor_user_id, action: str, resource: str, scope_used: str | None,
                  reason: str | None, result: str, request_id: str | None, metadata: dict | None = None):
    """Caller decides sanitization; this never accepts raw request/response bodies."""
    db.add(AdminAuditEvent(actor_user_id=actor_user_id, action=action, resource=resource, scope_used=scope_used,
                           reason=reason, result=result, request_id=request_id, metadata_=metadata))


def list_roles(db: Session) -> list[dict]:
    roles = db.scalars(select(AdminRole).order_by(AdminRole.name)).all()
    out = []
    for role in roles:
        scope_names = db.scalars(
            select(AdminScope.name).join(AdminRoleScope, AdminRoleScope.scope_id == AdminScope.id)
            .where(AdminRoleScope.role_id == role.id).order_by(AdminScope.name)
        ).all()
        out.append({"id": role.id, "name": role.name, "description": role.description, "scopes": scope_names})
    return out


def list_scopes(db: Session) -> list[AdminScope]:
    return db.scalars(select(AdminScope).order_by(AdminScope.name)).all()


def _active_assignments(db: Session, user_id: uuid.UUID) -> list[AdminRoleAssignment]:
    rows = db.scalars(select(AdminRoleAssignment).where(AdminRoleAssignment.user_id == user_id,
                                                        AdminRoleAssignment.revoked_at.is_(None))).all()
    moment = now()
    return [r for r in rows if r.expires_at is None or r.expires_at > moment]


def effective_roles_and_scopes(db: Session, user_id: uuid.UUID) -> tuple[list[str], set[str]]:
    """Deny-by-default: an empty result means no admin access at all, which is the default
    for every household user. Never derive this from token claims — always re-read the DB."""
    assignments = _active_assignments(db, user_id)
    if not assignments:
        return [], set()
    role_ids = {a.role_id for a in assignments}
    roles = db.scalars(select(AdminRole).where(AdminRole.id.in_(role_ids))).all()
    role_names = sorted(r.name for r in roles)
    scope_names = set(db.scalars(
        select(AdminScope.name).join(AdminRoleScope, AdminRoleScope.scope_id == AdminScope.id)
        .where(AdminRoleScope.role_id.in_(role_ids))
    ).all())
    return role_names, scope_names


def effective_scopes(db: Session, user_id: uuid.UUID) -> set[str]:
    return effective_roles_and_scopes(db, user_id)[1]


def list_assignments(db: Session, *, user_id: uuid.UUID | None = None, role_name: str | None = None,
                      status_filter: str | None = None, limit: int = 100, offset: int = 0):
    query = select(AdminRoleAssignment).join(AdminRole, AdminRole.id == AdminRoleAssignment.role_id)
    if user_id is not None:
        query = query.where(AdminRoleAssignment.user_id == user_id)
    if role_name is not None:
        query = query.where(AdminRole.name == role_name)
    if status_filter == "active":
        query = query.where(AdminRoleAssignment.revoked_at.is_(None),
                            (AdminRoleAssignment.expires_at.is_(None) | (AdminRoleAssignment.expires_at > now())))
    elif status_filter == "expired":
        query = query.where(AdminRoleAssignment.revoked_at.is_(None), AdminRoleAssignment.expires_at <= now())
    elif status_filter == "revoked":
        query = query.where(AdminRoleAssignment.revoked_at.is_not(None))
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    rows = db.scalars(query.order_by(AdminRoleAssignment.granted_at.desc()).limit(limit).offset(offset)).all()
    return _assignment_dicts(db, rows), total


def _assignment_dicts(db: Session, rows: list[AdminRoleAssignment]) -> list[dict]:
    if not rows:
        return []
    role_names = dict(db.execute(select(AdminRole.id, AdminRole.name)
                                  .where(AdminRole.id.in_({r.role_id for r in rows}))).all())
    moment = now()
    out = []
    for r in rows:
        if r.revoked_at is not None:
            status = "revoked"
        elif r.expires_at is not None and r.expires_at <= moment:
            status = "expired"
        else:
            status = "active"
        out.append({"id": r.id, "user_id": r.user_id, "role_name": role_names[r.role_id],
                    "assigned_by_user_id": r.assigned_by_user_id, "reason": r.reason,
                    "granted_at": r.granted_at, "expires_at": r.expires_at, "revoked_at": r.revoked_at,
                    "revoked_by_user_id": r.revoked_by_user_id, "revoke_reason": r.revoke_reason, "status": status})
    return out


def assign_role(db: Session, *, target_user_id: uuid.UUID, role_name: str, assigned_by_user_id: uuid.UUID | None,
                 reason: str, expires_at: datetime | None, request_id: str | None) -> dict:
    role = db.scalar(select(AdminRole).where(AdminRole.name == role_name))
    if role is None:
        raise InvalidInput(f"Rol administrativo desconocido: {role_name}")
    target = db.get(User, target_user_id)
    if target is None:
        raise NotFound("Usuario no encontrado")
    existing = db.scalar(select(AdminRoleAssignment).where(AdminRoleAssignment.user_id == target_user_id,
                                                           AdminRoleAssignment.role_id == role.id,
                                                           AdminRoleAssignment.revoked_at.is_(None)))
    if existing is not None:
        raise ApplicationError(f"El usuario ya tiene una asignación activa del rol {role_name}")
    with write_transaction(db):
        assignment = AdminRoleAssignment(user_id=target_user_id, role_id=role.id,
                                         assigned_by_user_id=assigned_by_user_id, reason=reason,
                                         expires_at=expires_at)
        db.add(assignment)
        db.flush()
        record_audit(db, actor_user_id=assigned_by_user_id, action="role.assign",
                     resource=f"admin_role_assignments:{assignment.id}", scope_used="admin.roles.manage",
                     reason=reason, result="success", request_id=request_id,
                     metadata={"target_user_id": str(target_user_id), "role": role_name})
    return _assignment_dicts(db, [assignment])[0]


def _active_super_admin_count(db: Session, *, exclude_assignment_id: uuid.UUID | None = None) -> int:
    role = db.scalar(select(AdminRole).where(AdminRole.name == SUPER_ADMIN))
    if role is None:
        return 0
    moment = now()
    rows = db.scalars(select(AdminRoleAssignment).join(User, User.id == AdminRoleAssignment.user_id)
                      .where(AdminRoleAssignment.role_id == role.id,
                             AdminRoleAssignment.revoked_at.is_(None), User.active.is_(True))).all()
    return len([r for r in rows if (r.expires_at is None or r.expires_at > moment)
               and r.id != exclude_assignment_id])


def revoke_assignment(db: Session, *, assignment_id: uuid.UUID, revoked_by_user_id: uuid.UUID | None,
                       reason: str, request_id: str | None) -> dict:
    with write_transaction(db):
        assignment = db.get(AdminRoleAssignment, assignment_id)
        if assignment is None:
            raise NotFound("Asignación no encontrada")
        # Lock the shared role row BEFORE counting, not just the target assignment.
        # Concurrent requests revoke different rows; row-locking either target alone
        # would let both observe the other as active and leave no super_admin.
        role = db.scalar(select(AdminRole).where(AdminRole.id == assignment.role_id).with_for_update())
        db.refresh(assignment)
        if assignment.revoked_at is not None:
            raise ApplicationError("La asignación ya está revocada")
        if role.name == SUPER_ADMIN and _active_super_admin_count(db, exclude_assignment_id=assignment.id) == 0:
            raise Forbidden("No se puede revocar el último super_admin activo")
        assignment.revoked_at = now()
        assignment.revoked_by_user_id = revoked_by_user_id
        assignment.revoke_reason = reason
        record_audit(db, actor_user_id=revoked_by_user_id, action="role.revoke",
                     resource=f"admin_role_assignments:{assignment.id}", scope_used="admin.roles.manage",
                     reason=reason, result="success", request_id=request_id,
                     metadata={"target_user_id": str(assignment.user_id), "role": role.name})
    return _assignment_dicts(db, [assignment])[0]


def guard_admin_account_deletion(db: Session, user_id: uuid.UUID) -> None:
    """Prevent the account-erasure cascade from removing the last active super_admin."""
    role = db.scalar(select(AdminRole).where(AdminRole.name == SUPER_ADMIN).with_for_update())
    if role is None:
        return
    assignment = db.scalar(select(AdminRoleAssignment).where(
        AdminRoleAssignment.user_id == user_id,
        AdminRoleAssignment.role_id == role.id,
        AdminRoleAssignment.revoked_at.is_(None),
    ))
    if assignment is not None and (assignment.expires_at is None or assignment.expires_at > now()):
        if _active_super_admin_count(db, exclude_assignment_id=assignment.id) == 0:
            raise Forbidden("No se puede eliminar la cuenta del último super_admin activo")


def guard_admin_account_deactivation(db: Session, user_id: uuid.UUID) -> None:
    """Serialize deactivation against role revocation and preserve one active super_admin."""
    role = db.scalar(select(AdminRole).where(AdminRole.name == SUPER_ADMIN).with_for_update())
    if role is None:
        return
    assignment = db.scalar(select(AdminRoleAssignment).where(
        AdminRoleAssignment.user_id == user_id,
        AdminRoleAssignment.role_id == role.id,
        AdminRoleAssignment.revoked_at.is_(None),
    ))
    if assignment is not None and (assignment.expires_at is None or assignment.expires_at > now()):
        if _active_super_admin_count(db, exclude_assignment_id=assignment.id) == 0:
            raise Forbidden("No se puede desactivar la cuenta del último super_admin activo")


def list_audit_events(db: Session, *, actor_user_id: uuid.UUID | None = None, action: str | None = None,
                       result: str | None = None, limit: int = 100, offset: int = 0):
    query = select(AdminAuditEvent)
    if actor_user_id is not None:
        query = query.where(AdminAuditEvent.actor_user_id == actor_user_id)
    if action is not None:
        query = query.where(AdminAuditEvent.action == action)
    if result is not None:
        query = query.where(AdminAuditEvent.result == result)
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    rows = db.scalars(query.order_by(AdminAuditEvent.created_at.desc()).limit(limit).offset(offset)).all()
    return rows, total


def bootstrap_super_admin(db: Session, email: str, *, reason: str = "bootstrap inicial") -> dict:
    """Idempotent on purpose: safe to run on every deploy. Never exposed over HTTP — this is
    the one sanctioned way to create the first super_admin, run from a trusted operator shell."""
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        raise NotFound(f"No existe un usuario con email {email}; créalo primero por el flujo normal de registro")
    role = db.scalar(select(AdminRole).where(AdminRole.name == SUPER_ADMIN))
    if role is None:
        raise ApplicationError("El rol super_admin no existe; ejecuta las migraciones primero")
    with write_transaction(db):
        # This trusted-shell command is for the FIRST administrator only. Serialize
        # concurrent invocations on the shared role row to prevent two first admins.
        db.scalar(select(AdminRole).where(AdminRole.id == role.id).with_for_update())
        existing = db.scalar(select(AdminRoleAssignment).where(AdminRoleAssignment.user_id == user.id,
                                                               AdminRoleAssignment.role_id == role.id,
                                                               AdminRoleAssignment.revoked_at.is_(None)))
        if existing is not None and (existing.expires_at is None or existing.expires_at > now()):
            return {"created": False, "assignment_id": existing.id, "user_id": user.id}
        if _active_super_admin_count(db):
            raise Forbidden("El bootstrap solo puede crear el primer super_admin activo")
        if existing is not None:
            # Do not silently resurrect an expired, still-unrevoked grant.
            raise Forbidden("La asignación expirada requiere recuperación manual verificada")
        assignment = AdminRoleAssignment(user_id=user.id, role_id=role.id, assigned_by_user_id=None,
                                         reason=reason)
        db.add(assignment)
        db.flush()
        record_audit(db, actor_user_id=None, action="role.bootstrap", resource=f"admin_role_assignments:{assignment.id}",
                     scope_used=None, reason=reason, result="success", request_id=None,
                     metadata={"target_user_id": str(user.id), "role": SUPER_ADMIN})
    return {"created": True, "assignment_id": assignment.id, "user_id": user.id}
