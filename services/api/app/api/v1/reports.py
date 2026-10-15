import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.report import EnergyReportOut
from app.services import reports
from app.services.transactions import require_home

router = APIRouter(prefix="/homes/{home_id}/reports", tags=["reports"])


@router.get("/energy", response_model=EnergyReportOut)
def energy_report(home_id: uuid.UUID, response: Response, period_from: date | None = Query(None, alias="from"),
                  period_to: date | None = Query(None, alias="to"), db: Session = Depends(get_db)):
    """Informe energético del período (por defecto, los últimos 365 días hasta hoy en America/Santo_Domingo). Solo lectura."""
    response.headers["Cache-Control"] = "no-store"
    return reports.build_energy_report(db, require_home(db, home_id), period_from, period_to)
