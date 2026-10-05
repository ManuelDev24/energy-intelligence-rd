from fastapi import Depends, Request
from sqlalchemy.orm import Session
from app.api.auth_deps import auth_required
from app.config import settings
from app.database import get_db
from app.services.auth_abuse import enforce


def budget(operation):
    def dependency(request: Request, db: Session = Depends(get_db), _=Depends(auth_required)):
        peer = request.client.host if request.client else "unknown-peer"
        enforce(db.get_bind(), operation, peer, getattr(settings, f"AUTH_{operation.upper()}_LIMIT"))
    return dependency


login_budget = budget("login")
register_budget = budget("register")
refresh_budget = budget("refresh")
