import uuid

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import rls
from app.config import settings
from app.database import get_db
from app.models.auth import HomeMember
from app.services.transactions import require_home
from app.services.auth import resolve_access, resolve_access_session, unauthorized
from app.services.errors import NotFound

bearer = HTTPBearer(auto_error=False)


def auth_required():
    if not settings.AUTH_ENABLED:
        raise HTTPException(404, "Autenticación deshabilitada en modo piloto local")


def current_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
                 db: Session = Depends(get_db)):
    if not settings.AUTH_ENABLED:
        return None
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise unauthorized()
    user = resolve_access(db, credentials.credentials)
    rls.set_context(db, user_id=user.id)  # auditoría C-01: desde aquí la base solo ve lo de esta persona
    return user


def current_session(credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
                    db: Session = Depends(get_db)):
    """(usuario, sesión) del access token; para rutas que necesitan saber cuál es «esta sesión»."""
    if not settings.AUTH_ENABLED:
        return None
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise unauthorized()
    resolved = resolve_access_session(db, credentials.credentials)
    rls.set_context(db, user_id=resolved[0].id)
    return resolved


def authorize_home(request: Request, user=Depends(current_user), db: Session = Depends(get_db)):
    if user is None:
        return
    raw_id = request.path_params.get("home_id")
    if raw_id is None:
        return
    try:
        home_id = uuid.UUID(str(raw_id))
    except ValueError:
        raise HTTPException(422, "home_id inválido") from None
    query = select(HomeMember).where(HomeMember.home_id == home_id, HomeMember.user_id == user.id)
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        require_home(db, home_id, lock=True)
        query = query.with_for_update()
    member = db.scalar(query)
    if member is None:
        raise NotFound("Vivienda no encontrada")
    rls.set_context(db, home_id=home_id)  # membresía comprobada: la base ya puede mostrar los datos de esta vivienda
    return member


def require_home_owner(member=Depends(authorize_home)):
    if member is not None and member.role != "owner":
        raise HTTPException(403, "Se requiere propietario")
