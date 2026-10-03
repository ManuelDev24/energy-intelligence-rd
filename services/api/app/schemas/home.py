import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Distributor = Literal["EDESUR", "EDENORTE", "EDEESTE", "Otra"]


class HomeCreate(BaseModel):
    code: str | None = Field(default=None, min_length=1, max_length=32, pattern=r"^[A-Za-z0-9_-]+$")
    name: str = Field(min_length=1, max_length=120)
    address: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=120)
    distributor: Distributor


class HomeUpdate(BaseModel):
    """Actualización parcial: solo se modifican los campos enviados."""

    name: str | None = Field(default=None, min_length=1, max_length=120)
    address: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=120)
    distributor: Distributor | None = None


class HomeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str | None
    name: str
    address: str | None
    city: str | None
    distributor: Distributor
    created_at: datetime
