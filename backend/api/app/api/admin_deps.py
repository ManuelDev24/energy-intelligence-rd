"""FastAPI-layer admin dependencies. Deny-by-default: current_admin requires a real,
non-expired bearer session (never falls back to the pilot AUTH_ENABLED=False bypass that
app.api.auth_deps.current_user uses for household routes) and require_scope() recomputes
scopes from the DB on every request — it never trusts anything embedded in the JWT.
"""
from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.api.auth_deps import bearer
from app.database import get_db
from app.services import admin as admin_service
from app.services.auth import resolve_access, unauthorized
from app.services.errors import Forbidden
from fastapi.security import HTTPAuthorizationCredentials


def current_admin(credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
                  db: Session = Depends(get_db)):
    """Always requires a real bearer token, regardless of AUTH_ENABLED. The admin layer never
    runs in the household's no-auth pilot mode."""
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise unauthorized()
    return resolve_access(db, credentials.credentials)


def require_scope(scope: str):
    def dependency(request: Request, user=Depends(current_admin), db: Session = Depends(get_db)):
        _roles, scopes = admin_service.effective_roles_and_scopes(db, user.id)
        request_id = getattr(request.state, "request_id", None)
        resource = f"{request.method} {request.url.path}"
        if scope not in scopes:
            admin_service.record_audit(db, actor_user_id=user.id, action="scope.check", resource=resource,
                                       scope_used=scope, reason=None, result="denied", request_id=request_id)
            db.commit()
            raise Forbidden(f"Falta el scope administrativo requerido: {scope}")
        admin_service.record_audit(db, actor_user_id=user.id, action="scope.authorized", resource=resource,
                                   scope_used=scope, reason=None, result="success", request_id=request_id)
        db.commit()
        return user
    return dependency
