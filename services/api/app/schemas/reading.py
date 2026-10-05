import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator

# Margen por relojes desfasados; lecturas futuras se rechazan (no se inventan datos).
FUTURE_TOLERANCE = timedelta(minutes=5)


class ReadingCreate(BaseModel):
    read_at: AwareDatetime
    # Valor acumulado del medidor (no el consumo del período).
    reading_kwh: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    note: str | None = Field(default=None, max_length=255)
    source: Literal["manual"] = "manual"

    @field_validator("read_at")
    @classmethod
    def _not_future(cls, value: datetime) -> datetime:
        if value > datetime.now(timezone.utc) + FUTURE_TOLERANCE:
            raise ValueError("read_at cannot be in the future")
        return value


class ReadingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    home_id: uuid.UUID
    read_at: datetime
    reading_kwh: Decimal
    source: Literal["manual"]
    note: str | None
    created_at: datetime

    @field_validator("read_at")
    @classmethod
    def _utc(cls, value: datetime) -> datetime:
        # Salida estable en UTC sin depender de la zona de la sesión PostgreSQL ni del cliente.
        return value.astimezone(timezone.utc)
