import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.dashboard import Metric

ClaimKind = Literal["billing_error", "consumption_dispute", "outage_damage", "service_quality", "other"]
ClaimStatus = Literal["open", "in_review", "resolved", "closed"]


class ClaimIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: ClaimKind
    bill_id: uuid.UUID | None = None
    subject: str = Field(min_length=3, max_length=120)
    description: str = Field(min_length=10, max_length=2000)
    disputed_amount_dop: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    reference_number: str | None = Field(default=None, max_length=60)

    @field_validator("subject", "description", "reference_number")
    @classmethod
    def _strip(cls, value):
        return value.strip() if isinstance(value, str) else value


class ClaimNoteIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    note: str = Field(min_length=3, max_length=2000)

    @field_validator("note")
    @classmethod
    def _strip(cls, value: str) -> str:
        return value.strip()


class ClaimCloseIn(BaseModel):
    """Cierre del caso; la nota es opcional (el cuerpo puede ir vacío: `{}`)."""
    model_config = ConfigDict(extra="forbid")
    note: str | None = Field(default=None, min_length=3, max_length=2000)

    @field_validator("note")
    @classmethod
    def _strip(cls, value: str | None) -> str | None:
        return value.strip() if value else value


class ClaimReferenceIn(BaseModel):
    """Número que la distribuidora le dio a la persona al presentar la reclamación formal."""
    model_config = ConfigDict(extra="forbid")
    reference_number: str = Field(min_length=1, max_length=60)

    @field_validator("reference_number")
    @classmethod
    def _strip(cls, value: str) -> str:
        return value.strip()


class EvidenceBill(BaseModel):
    period_start: date
    period_end: date
    days: int
    kwh: Metric                       # REAL
    amount_dop: Metric                # REAL
    avg_price_per_kwh: Metric | None  # ESTIMATED


class EvidencePrevious(EvidenceBill):
    kwh_pct: Metric | None            # ESTIMATED: variación frente a la factura anterior (null si la base es 0)
    amount_pct: Metric | None


class ClaimEvidence(BaseModel):
    """Resumen congelado al crear el caso, con datos de la propia persona. No prueba por sí solo un error de la distribuidora."""
    bill: EvidenceBill
    previous: EvidencePrevious | None
    readings_in_period: int
    document_id: uuid.UUID | None     # original de la factura (descargable con el endpoint de documentos)
    captured_at: datetime
    note: str


class ClaimEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    kind: Literal["created", "note", "status"]
    actor: Literal["user", "support"]
    note: str | None
    status_to: ClaimStatus | None
    created_at: datetime


class ClaimOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    home_id: uuid.UUID
    bill_id: uuid.UUID | None
    kind: ClaimKind
    status: ClaimStatus
    subject: str
    description: str
    disputed_amount_dop: Decimal | None
    reference_number: str | None
    created_at: datetime
    updated_at: datetime
    closed_at: datetime | None
    disclaimer: str = "Este caso es un registro tuyo: no afirma que la distribuidora haya cometido un error. La reclamación formal la presentas tú ante tu distribuidora."


class ClaimDetailOut(ClaimOut):
    evidence: ClaimEvidence | None
    events: list[ClaimEventOut]
