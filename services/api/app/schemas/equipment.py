import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.dashboard import Metric

AlertStatus = Literal["unread", "read", "dismissed"]


class EquipmentIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    room: str | None = Field(default=None, max_length=80)
    power_w: Decimal = Field(ge=0, le=100_000, max_digits=10, decimal_places=2)
    hours_per_day: Decimal = Field(ge=0, le=24, max_digits=4, decimal_places=2)


class EquipmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    home_id: uuid.UUID
    name: str
    room: str | None
    power_w: Decimal
    hours_per_day: Decimal
    created_at: datetime


class EquipmentEstimateItem(BaseModel):
    equipment_id: uuid.UUID
    name: str
    room: str | None
    daily_kwh: Metric      # ESTIMATED
    monthly_kwh: Metric    # ESTIMATED


class EquipmentEstimateOut(BaseModel):
    home_id: uuid.UUID
    equipment_count: int
    items: list[EquipmentEstimateItem]
    total_daily_kwh: Metric
    total_monthly_kwh: Metric
    days_per_month: int
    latest_bill_kwh: Metric | None     # REAL (de la factura)
    bill_coverage_pct: Metric | None   # ESTIMATED: % de la factura que explican los equipos
    note: str


class AlertOut(BaseModel):
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
