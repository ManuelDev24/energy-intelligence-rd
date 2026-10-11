import uuid

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.outage import OutageIn, OutageOut, OutageSummaryOut
from app.services import outages

router = APIRouter(prefix="/homes/{home_id}/outages", tags=["outages"])


@router.get("", response_model=list[OutageOut])
def list_outages(home_id: uuid.UUID, limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0), db: Session = Depends(get_db)):
    """Historial de interrupciones, de la más reciente a la más antigua."""
    return outages.list_outages(db, home_id, limit=limit, offset=offset)


@router.get("/summary", response_model=OutageSummaryOut)
def get_summary(home_id: uuid.UUID, response: Response, months: int = Query(12, ge=1, le=24), db: Session = Depends(get_db)):
    """Totales por mes calendario (America/Santo_Domingo) de los últimos `months` meses, incluidos los meses sin apagones."""
    response.headers["Cache-Control"] = "no-store"
    return outages.build_summary(db, home_id, months=months)


@router.post("", response_model=OutageOut, status_code=status.HTTP_201_CREATED)
def create_outage(home_id: uuid.UUID, payload: OutageIn, db: Session = Depends(get_db)):
    return outages.create_outage(db, home_id, payload)


@router.get("/{outage_id}", response_model=OutageOut)
def get_outage(home_id: uuid.UUID, outage_id: uuid.UUID, db: Session = Depends(get_db)):
    return outages.get_outage(db, home_id, outage_id)


@router.put("/{outage_id}", response_model=OutageOut)
def update_outage(home_id: uuid.UUID, outage_id: uuid.UUID, payload: OutageIn, db: Session = Depends(get_db)):
    """Reemplazo completo: sirve para corregir datos o cerrar una interrupción abierta (poniendo `ended_at`)."""
    return outages.update_outage(db, home_id, outage_id, payload)


@router.delete("/{outage_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_outage(home_id: uuid.UUID, outage_id: uuid.UUID, db: Session = Depends(get_db)):
    outages.delete_outage(db, home_id, outage_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
