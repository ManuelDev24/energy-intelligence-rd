import uuid

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import Home


def get_home_or_404(db: Session, home_id: uuid.UUID) -> Home:
    home = db.get(Home, home_id)
    if home is None:
        raise HTTPException(status_code=404, detail="Vivienda no encontrada")
    return home
