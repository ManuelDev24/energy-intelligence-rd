import uuid
from decimal import Decimal
from datetime import datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class BillItemIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    label: str = Field(strict=True, min_length=1, max_length=200)
    kind: Literal["charge", "discount"]
    amount_dop: Decimal = Field(max_digits=12, decimal_places=2, allow_inf_nan=False)

    @field_validator("label")
    @classmethod
    def nonblank_label(cls, value):
        if not value.strip() or "\x00" in value:
            raise ValueError("label must be nonblank and contain no NUL")
        return value

    @model_validator(mode="after")
    def coherent_sign(self):
        if (self.kind == "charge" and self.amount_dop < 0) or (self.kind == "discount" and self.amount_dop > 0):
            raise ValueError("charge must be nonnegative; discount must be nonpositive")
        return self


class BillItemsReplace(BaseModel):
    model_config = ConfigDict(extra="forbid")
    items: list[BillItemIn] = Field(max_length=100)


class BillItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    position: int
    label: str
    kind: Literal["charge", "discount"]
    amount_dop: Decimal


class BillValidationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")


class BillCheck(BaseModel):
    code: str
    status: Literal["pass", "warning", "unavailable"]
    observed: dict


class BillProvenance(BaseModel):
    origin: Literal["creation", "migration", "unknown"]
    original_available: bool
    data: dict | None
    captured_at: datetime | None


class BillCorrection(BaseModel):
    entity: Literal["bills", "bill_items"]
    operation: str
    before: dict | None
    after: dict | None
    created_at: datetime


class BillAssessment(BaseModel):
    home_id: uuid.UUID
    bill_id: uuid.UUID
    read_only: Literal[True] = True
    approval: Literal["not_performed"] = "not_performed"
    status: Literal["consistent", "warnings", "incomplete"]
    checks: list[BillCheck]
    warnings: list[str]
    provenance: BillProvenance
    corrections: list[BillCorrection]
    corrections_has_more: bool
    detail: "BillItemsOut"


class BillItemsOut(BaseModel):
    home_id: uuid.UUID
    bill_id: uuid.UUID
    items: list[BillItemOut]
    items_total_dop: Decimal | None
    bill_amount_dop: Decimal
    difference_dop: Decimal | None
