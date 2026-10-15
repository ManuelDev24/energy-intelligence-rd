import uuid
from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.goal import GoalIn, GoalOut, GoalProgressOut
from app.services import goals

router = APIRouter(prefix="/homes/{home_id}/goal", tags=["goals"])


@router.get("", response_model=GoalOut | None)
def get_goal(home_id: uuid.UUID, db: Session = Depends(get_db)):
    """null si la vivienda aún no tiene meta."""
    return goals.get_goal(db, home_id)


@router.put("", response_model=GoalOut)
def put_goal(home_id: uuid.UUID, payload: GoalIn, db: Session = Depends(get_db)):
    return goals.save_goal(db, home_id, payload)


@router.get("/progress", response_model=GoalProgressOut)
def get_progress(home_id: uuid.UUID, on: date | None = None, db: Session = Depends(get_db)):
    """Progreso del mes calendario que contiene `on` (por defecto, hoy en America/Santo_Domingo)."""
    return goals.build_progress(db, home_id, on)
