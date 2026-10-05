import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.dashboard import Metric
from app.schemas.tariff import TariffRef

GoalStatus = Literal["on_track", "at_risk", "exceeded", "insufficient_data"]


class GoalIn(BaseModel):
    """Reemplazo completo (PUT): al menos una meta; un campo null elimina esa meta."""
    monthly_amount_rd: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    monthly_kwh: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)

    @model_validator(mode="after")
    def _any(self) -> Self:
        if self.monthly_amount_rd is None and self.monthly_kwh is None:
            raise ValueError("Defina monthly_amount_rd, monthly_kwh o ambos")
        return self


class GoalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    home_id: uuid.UUID
    monthly_amount_rd: Decimal | None
    monthly_kwh: Decimal | None
    updated_at: datetime


class GoalMetricProgress(BaseModel):
    target: Decimal
    unit: str
    so_far: Metric | None             # REAL/ESTIMATED: lo observado en el mes hasta as_of
    projected: Metric | None          # PROJECTED: cierre de mes estimado
    percent_so_far: Decimal | None
    percent_projected: Decimal | None
    status: GoalStatus
    basis: Literal["readings", "bills_prorated", "tariff", "bill_average_price"] | None
    projection_method: Literal["run_rate_readings", "linear_least_squares"] | None
    tariff: TariffRef | None          # presente cuando RD$ se estimó con un pliego tarifario
    reasons: list[str]


class GoalProgressOut(BaseModel):
    home_id: uuid.UUID
    month_start: date
    month_end: date
    as_of: date
    timezone: str
    goal: GoalOut | None
    status: GoalStatus
    data_source: Literal["readings", "bills", "none"]
    kwh: GoalMetricProgress | None    # None si no hay meta de kWh
    amount: GoalMetricProgress | None # None si no hay meta de RD$
    reasons: list[str]
    quality_legend: dict[str, str]
