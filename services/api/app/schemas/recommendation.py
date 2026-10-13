import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict

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
