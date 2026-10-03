import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

MAX_PERIOD_DAYS = 366
Source = Literal["manual", "seed"]

# Decimal(12, 2) en base de datos: max_digits/decimal_places evitan 500 por overflow.
_Money = Field(ge=0, max_digits=12, decimal_places=2)


class _BillFields(BaseModel):
    period_start: date
    period_end: date
    kwh: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    amount_dop: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    days: int = Field(ge=0, le=MAX_PERIOD_DAYS)
    reading_previous: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    reading_current: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)

    @model_validator(mode="after")
    def _check_consistency(self) -> Self:
        if self.period_end < self.period_start:
            raise ValueError("period_end must be on or after period_start")
        if (self.period_end - self.period_start).days > MAX_PERIOD_DAYS:
            raise ValueError(f"billing period cannot exceed {MAX_PERIOD_DAYS} days")
        if (
            self.reading_previous is not None
            and self.reading_current is not None
            and self.reading_current < self.reading_previous
        ):
            raise ValueError("reading_current must be >= reading_previous")
        return self


class BillCreate(_BillFields):
    # La API solo crea facturas manuales; "seed" es exclusivo del script de datos demo.
    source: Literal["manual"] = "manual"


class BillUpdate(_BillFields):
    """Reemplazo completo (PUT) de una factura manual."""


class BillOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    home_id: uuid.UUID
    period_start: date
    period_end: date
    kwh: Decimal
    amount_dop: Decimal
    days: int
    reading_previous: Decimal | None
    reading_current: Decimal | None
    source: Source
    created_at: datetime
