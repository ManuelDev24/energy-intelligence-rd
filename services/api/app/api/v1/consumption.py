import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.consumption import ConsumptionOut, Granularity
from app.services.consumption import build_consumption

router = APIRouter(prefix="/homes/{home_id}/consumption", tags=["consumption"])


@router.get("", response_model=ConsumptionOut)
def get_consumption(home_id: uuid.UUID, granularity: Granularity = Query(...),
                    from_date: date = Query(..., alias="from"), to_date: date = Query(..., alias="to"),
                    db: Session = Depends(get_db)):
    """Consumo por día/semana/mes (calendario America/Santo_Domingo) desde lecturas del medidor; máx. 366 días."""
    return build_consumption(db, home_id, granularity, from_date, to_date)
