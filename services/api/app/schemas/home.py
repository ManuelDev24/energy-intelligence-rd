import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool

Distributor = Literal["EDESUR", "EDENORTE", "EDEESTE", "Otra"]


class ProfileFields(BaseModel):
    province: str | None = Field(default=None, min_length=1, max_length=120)
    municipality: str | None = Field(default=None, min_length=1, max_length=120)
    sector: str | None = Field(default=None, min_length=1, max_length=120)
    # Free text until product defines a documented user-type taxonomy.
    user_type: str | None = Field(default=None, min_length=1, max_length=120)
    occupants: int | None = Field(default=None, ge=1, le=999, strict=True)
    has_ac: StrictBool | None = None
    has_water_heater: StrictBool | None = None
    has_pool: StrictBool | None = None
    has_solar: StrictBool | None = None
    has_inverter: StrictBool | None = None


class HomeCreate(ProfileFields):
    code: str | None = Field(default=None, min_length=1, max_length=32, pattern=r"^[A-Za-z0-9_-]+$")
    name: str = Field(min_length=1, max_length=120)
    address: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=120)
    distributor: Distributor


class HomeUpdate(ProfileFields):
    """Actualización parcial: solo se modifican los campos enviados."""

    name: str | None = Field(default=None, min_length=1, max_length=120)
    address: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=120)
    distributor: Distributor | None = None


class HomeOut(ProfileFields):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str | None
    name: str
    address: str | None
    city: str | None
    distributor: Distributor
    created_at: datetime
