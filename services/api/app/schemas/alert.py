import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal, Self
from pydantic import BaseModel, ConfigDict, Field, model_validator

AlertStatus = Literal["unread", "read", "dismissed"]

class AlertRecord(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    home_id: uuid.UUID
    bill_id: uuid.UUID | None
    type: str
    severity: Literal["warning", "critical"]
    status: AlertStatus
    message: str
    kwh_pct: Decimal | None
    threshold_pct: Decimal | None
    basis_bill_id: uuid.UUID | None
    basis_period_start: date | None
    basis_period_end: date | None
    created_at: datetime


class AlertStatusUpdate(BaseModel):
    status: AlertStatus


class AlertSettingsIn(BaseModel):
    warning_pct: Decimal = Field(gt=0, le=1000, max_digits=6, decimal_places=2)
    critical_pct: Decimal = Field(gt=0, le=1000, max_digits=6, decimal_places=2)

    @model_validator(mode="after")
    def _order(self) -> Self:
        if self.critical_pct < self.warning_pct:
            raise ValueError("critical_pct must be >= warning_pct")
        return self


class AlertSettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    home_id: uuid.UUID
    warning_pct: Decimal
    critical_pct: Decimal
