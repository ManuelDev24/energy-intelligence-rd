import uuid
from typing import Literal

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.dashboard import Metric
from app.schemas.recommendation import RecommendationListOut, RecommendationRecord, RecommendationStatusIn
from app.services import recommendation_engine as engine
from app.services import recommendations

router = APIRouter(prefix="/homes/{home_id}/recommendations", tags=["recommendations"])


def _out(home_id, rows) -> RecommendationListOut:
    kwh, dop = recommendations.summary_totals(rows)
    return RecommendationListOut(
        home_id=home_id, ruleset_version=engine.RULESET_VERSION, items=rows,
        total_savings_kwh_month=Metric(value=kwh, unit="kWh/mes", quality="ESTIMATED") if kwh is not None else None,
        total_savings_dop_month=Metric(value=dop, unit="RD$/mes", quality="ESTIMATED") if dop is not None else None,
        note=engine.SAVINGS_NOTE,
    )


@router.get("", response_model=RecommendationListOut)
def get_recommendations(
    home_id: uuid.UUID,
    status: Literal["active", "applied", "dismissed", "resolved", "all"] = Query("active"),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Recomendaciones guardadas (por defecto las vigentes). Solo lectura: las crea `POST /refresh` o el sistema."""
    return _out(home_id, recommendations.list_recommendations(db, home_id, status=status, limit=limit))


@router.post("/refresh", response_model=RecommendationListOut)
def refresh(home_id: uuid.UUID, response: Response, db: Session = Depends(get_db)):
    """Recalcula con los datos actuales (idempotente: repetirlo sin cambios no cambia nada) y devuelve las vigentes."""
    recommendations.refresh_home(db, home_id)
    response.headers["Cache-Control"] = "no-store"
    return _out(home_id, recommendations.list_recommendations(db, home_id, status="active"))


@router.patch("/{recommendation_id}", response_model=RecommendationRecord)
def update_recommendation(home_id: uuid.UUID, recommendation_id: uuid.UUID, payload: RecommendationStatusIn,
                          db: Session = Depends(get_db)):
    """Marcar como aplicada, descartarla o volver a activarla."""
    return recommendations.set_status(db, home_id, recommendation_id, payload.status)
