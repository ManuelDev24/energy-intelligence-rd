import uuid
from typing import Literal

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.dashboard import Metric
from app.schemas.goal import GoalIn, GoalOut
from app.schemas.recommendation import GoalProposalOut, RecommendationListOut, RecommendationRecord, RecommendationStatusIn
from app.services import goals
from app.services import recommendation_engine as engine
from app.services import recommendations
from app.services.errors import ApplicationError

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


class NoGoalProposal(ApplicationError):
    status_code = 409
    code = "no_goal_proposal"


@router.get("/goal-proposal", response_model=GoalProposalOut)
def get_goal_proposal(home_id: uuid.UUID, response: Response, db: Session = Depends(get_db)):
    """Meta mensual que propone la app (promedio real − ahorro potencial). No guarda nada."""
    response.headers["Cache-Control"] = "no-store"
    return recommendations.goal_proposal(db, home_id)


@router.post("/goal-proposal/apply", response_model=GoalOut)
def apply_goal_proposal(home_id: uuid.UUID, db: Session = Depends(get_db)):
    """«Aplicar objetivo»: el servidor recalcula la propuesta (no confía en cifras del cliente) y la guarda como meta de kWh,
    conservando la meta en RD$ si existía. 409 si hoy no hay propuesta."""
    proposal = recommendations.goal_proposal(db, home_id)
    if proposal["proposal"] is None:
        raise NoGoalProposal(proposal["reason"] or "No hay propuesta de meta")
    goal = goals.get_goal(db, home_id)
    return goals.save_goal(db, home_id, GoalIn(monthly_kwh=proposal["proposal"]["value"], monthly_amount_rd=goal.monthly_amount_rd if goal else None))
