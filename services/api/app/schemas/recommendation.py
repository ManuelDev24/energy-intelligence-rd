import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, computed_field

from app.schemas.dashboard import Metric


class RecommendationRecord(BaseModel):
    """Una recomendación explicable. El ahorro (si existe) es ESTIMADO y sus supuestos viajan con él. `rule_id` y
    `rule_version` identifican la regla; `ruleset_version`, el conjunto de reglas con el que se calculó."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    home_id: uuid.UUID
    equipment_id: uuid.UUID | None
    anomaly_id: uuid.UUID | None
    rule_id: str
    rule_version: int
    ruleset_version: int
    category: Literal["equipment", "goal", "anomaly", "data"]
    title: str
    summary: str
    action: str
    confidence: Literal["low", "medium", "high"]
    status: Literal["active", "applied", "dismissed", "resolved"]
    savings_kwh_month: Decimal | None
    savings_dop_month: Decimal | None
    assumptions: list[str]
    evidence: dict[str, str]
    created_at: datetime
    last_seen_at: datetime
    status_changed_at: datetime

    @computed_field  # type: ignore[prop-decorator]
    @property
    def difficulty(self) -> Literal["easy", "medium", "hard"]:
        """Esfuerzo para la persona (regla fija por `rule_id`, ver `recommendation_engine.DIFFICULTY`)."""
        from app.services import recommendation_engine as engine
        return engine.difficulty_for(self.rule_id)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def impact(self) -> Literal["low", "medium", "high"] | None:
        """Tamaño del ahorro estimado en kWh/mes (umbrales en `recommendation_engine`); null si la recomendación no promete ahorro."""
        from app.services import recommendation_engine as engine
        return engine.impact_for(self.savings_kwh_month)


class RecommendationStatusIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["active", "applied", "dismissed"]


class RecommendationListOut(BaseModel):
    home_id: uuid.UUID
    ruleset_version: int
    items: list[RecommendationRecord]
    total_savings_kwh_month: Metric | None   # ESTIMATED: suma de las vigentes con ahorro
    total_savings_dop_month: Metric | None   # ESTIMATED: usa el precio medio de las últimas facturas
    note: str


class GoalProposalOut(BaseModel):
    """Propuesta de meta mensual en kWh. Nada se guarda hasta que la persona la aplica (`POST …/goal-proposal/apply`)."""
    home_id: uuid.UUID
    proposal: Metric | None                      # ESTIMATED: promedio real − ahorro potencial vigente; null si no se puede proponer
    baseline: Metric | None                      # REAL: promedio de kWh de las últimas facturas
    potential_savings: Metric | None             # ESTIMATED: suma de las recomendaciones de equipos vigentes
    bills_used: int
    current_goal_kwh: Decimal | None
    reason: str | None                           # por qué no hay propuesta
    assumptions: list[str]
