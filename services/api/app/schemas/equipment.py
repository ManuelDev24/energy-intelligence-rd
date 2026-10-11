import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.equipment import EQUIPMENT_ICONS, EQUIPMENT_KINDS
from app.schemas.dashboard import Metric

EquipmentKind = Literal[*EQUIPMENT_KINDS]
EquipmentIcon = Literal[*EQUIPMENT_ICONS]


class EquipmentIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    room: str | None = Field(default=None, max_length=80)
    kind: EquipmentKind = "other"
    brand: str | None = Field(default=None, max_length=60)
    model: str | None = Field(default=None, max_length=60)
    icon: EquipmentIcon | None = None  # None = el icono por defecto del tipo
    power_w: Decimal = Field(ge=0, le=100_000, max_digits=10, decimal_places=2)
    hours_per_day: Decimal = Field(ge=0, le=24, max_digits=4, decimal_places=2)

    @field_validator("brand", "model", mode="before")
    @classmethod
    def _blank_is_none(cls, value):
        # Un campo opcional vacío o con solo espacios no se guarda como texto en blanco.
        if isinstance(value, str):
            value = value.strip()
            return value or None
        return value


class EquipmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    home_id: uuid.UUID
    name: str
    room: str | None
    kind: EquipmentKind
    brand: str | None
    model: str | None
    icon: EquipmentIcon | None
    power_w: Decimal
    hours_per_day: Decimal
    created_at: datetime


class EquipmentEstimateItem(BaseModel):
    equipment_id: uuid.UUID
    name: str
    room: str | None
    kind: EquipmentKind
    brand: str | None
    model: str | None
    icon: EquipmentIcon | None
    daily_kwh: Metric      # ESTIMATED
    monthly_kwh: Metric    # ESTIMATED
    share_pct: Metric      # ESTIMATED: % del total estimado de los equipos declarados (suman 100,00 si hay consumo)


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
