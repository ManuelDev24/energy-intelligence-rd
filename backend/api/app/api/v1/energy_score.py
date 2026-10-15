import uuid

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.energy_score import EnergyScoreOut
from app.services import energy_score

router = APIRouter(prefix="/homes/{home_id}/energy-score", tags=["energy-score"])


@router.get("", response_model=EnergyScoreOut)
def get_energy_score(home_id: uuid.UUID, response: Response, db: Session = Depends(get_db)):
    """Energy Score 0–100 de la vivienda con sus cuatro componentes. Solo lectura: se deriva de los datos actuales."""
    response.headers["Cache-Control"] = "no-store"
    return energy_score.build_score(db, home_id)
