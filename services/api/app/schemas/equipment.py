import uuid
from datetime import datetime
from decimal import Decimal


from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.dashboard import Metric

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
