"""ERD-ADM-USERS-WEB: consulta administrativa de personas. SOLO LECTURA.

Nunca devuelve contraseñas, hashes, tokens, cookies ni documentos. El término de búsqueda NO se guarda en la auditoría (es un dato personal);
sí queda quién buscó y cuándo, y cada ficha abierta (`users.view`, recurso `users:<id>`)."""
from datetime import datetime, timezone

from sqlalchemy import and_, func, or_, select, text
from sqlalchemy.orm import Session

from app.models import AdminRole, AdminRoleAssignment, User
from app.models.auth import AuthSession
from app.services import admin
from app.services.errors import InvalidInput, NotFound

MIN_QUERY = 3


def _like(term: str) -> str:
    return "%" + term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"


def _enrich(db: Session, users: list[User]) -> list[dict]:
    ids = [u.id for u in users]
    if not ids:
        return []
    now = datetime.now(timezone.utc)
    homes = db.execute(text("SELECT admin_user_home_counts(CAST(:ids AS uuid[]))"), {"ids": ids}).scalar_one()
    sessions = dict(db.execute(select(AuthSession.user_id, func.count()).where(
        AuthSession.user_id.in_(ids), AuthSession.revoked_at.is_(None), AuthSession.expires_at > now).group_by(AuthSession.user_id)).all())
    roles: dict = {}
    for user_id, name in db.execute(select(AdminRoleAssignment.user_id, AdminRole.name).join(AdminRole, AdminRole.id == AdminRoleAssignment.role_id)
                                    .where(AdminRoleAssignment.user_id.in_(ids), AdminRoleAssignment.revoked_at.is_(None),
                                           or_(AdminRoleAssignment.expires_at.is_(None), AdminRoleAssignment.expires_at > now))
                                    .order_by(AdminRole.name)):
        roles.setdefault(user_id, []).append(name)
    return [{"id": u.id, "email": u.email, "email_verified": u.email_verified_at is not None, "active": u.active, "created_at": u.created_at,
             "active_sessions": int(sessions.get(u.id, 0)), "homes": int(homes.get(str(u.id), 0)), "admin_roles": roles.get(u.id, [])}
            for u in users]


def list_users(db: Session, *, actor_user_id, request_id, q: str | None, verified: bool | None, limit: int, offset: int):
    term = (q or "").strip()
    if term and len(term) < MIN_QUERY:
        raise InvalidInput(f"Escribe al menos {MIN_QUERY} caracteres para buscar")
    conditions = []
    if term:
        conditions.append(User.email.ilike(_like(term.lower()), escape="\\"))
    if verified is not None:
        conditions.append(User.email_verified_at.is_not(None) if verified else User.email_verified_at.is_(None))
    where = and_(*conditions) if conditions else True
    total = db.scalar(select(func.count()).select_from(User).where(where))
    rows = list(db.scalars(select(User).where(where).order_by(User.created_at.desc(), User.id).limit(limit).offset(offset)))
    admin.record_audit(db, actor_user_id=actor_user_id, action="users.search", resource="users", scope_used="admin.users.read", reason=None,
                       result="success", request_id=request_id, metadata={"with_query": bool(term), "verified_filter": verified, "returned": len(rows)})
    db.commit()
    return _enrich(db, rows), total


def get_user(db: Session, user_id, *, actor_user_id, request_id) -> dict:
    user = db.get(User, user_id)
    if user is None:
        raise NotFound("Persona no encontrada")
    out = _enrich(db, [user])[0]
    out.update(role=user.role, terms_version=user.terms_version, terms_accepted_at=user.terms_accepted_at)
    admin.record_audit(db, actor_user_id=actor_user_id, action="users.view", resource=f"users:{user.id}", scope_used="admin.users.read",
                       reason=None, result="success", request_id=request_id, metadata=None)
    db.commit()
    return out
