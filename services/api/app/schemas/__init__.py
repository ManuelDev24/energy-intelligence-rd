from datetime import date
from decimal import Decimal
from typing import Literal, Self

from pydantic import BaseModel, Field, model_validator

Distributor = Literal["EDESUR", "EDENORTE", "EDEESTE", "Otra"]


class HomeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    address: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=120)
    distributor: Distributor


class BillCreate(BaseModel):
    home_id: str
    period_start: date
    period_end: date
    kwh: Decimal = Field(ge=0)
    amount_dop: Decimal = Field(ge=0)
    days: int = Field(ge=0)

    @model_validator(mode="after")
    def _check_period(self) -> Self:
        if self.period_end < self.period_start:
            raise ValueError("period_end must be on or after period_start")
        return self
