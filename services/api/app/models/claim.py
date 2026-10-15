import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Numeric, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

CLAIM_KINDS = ("billing_error", "consumption_dispute", "outage_damage", "service_quality", "other")
CLAIM_STATUSES = ("open", "in_review", "resolved", "closed")


class Claim(Base):
    """ERD-CLAIM-01: caso de reclamación de una vivienda. La app NO afirma que haya un error de la distribuidora: guarda lo que la persona
    cuenta, un resumen congelado de sus propios datos (`evidence`) y el seguimiento. La reclamación formal la presenta la persona ante su
    distribuidora y aquí registra el número de referencia. Migración 0036; RLS por vivienda."""
    __tablename__ = "claims"
    __table_args__ = (
        CheckConstraint("kind IN ('billing_error', 'consumption_dispute', 'outage_damage', 'service_quality', 'other')", name="ck_claims_kind"),
        CheckConstraint("status IN ('open', 'in_review', 'resolved', 'closed')", name="ck_claims_status"),
        CheckConstraint("char_length(subject) BETWEEN 3 AND 120", name="ck_claims_subject"),
        CheckConstraint("char_length(description) BETWEEN 10 AND 2000", name="ck_claims_description"),
        CheckConstraint("disputed_amount_dop IS NULL OR disputed_amount_dop > 0", name="ck_claims_amount_positive"),
        CheckConstraint("evidence IS NULL OR octet_length(evidence::text) <= 16384", name="ck_claims_evidence_size"),
        Index("ix_claims_home", "home_id", "created_at"),
        Index("ix_claims_bill", "bill_id"),
        Index("uq_claims_open_per_bill_kind", "home_id", "bill_id", "kind", unique=True,
              postgresql_where=text("status IN ('open', 'in_review') AND bill_id IS NOT NULL")),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    home_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("homes.id", ondelete="CASCADE"), nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True)
    bill_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("bills.id", ondelete="SET NULL"))
    kind: Mapped[str] = mapped_column(String(24), nullable=False)
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="open")
    subject: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    disputed_amount_dop: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    reference_number: Mapped[str | None] = mapped_column(String(60))
    evidence: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ClaimEvent(Base):
    """Historial del caso (solo se agrega). `actor` distingue a la persona del soporte (cuando exista panel de soporte)."""
    __tablename__ = "claim_events"
    __table_args__ = (
        CheckConstraint("kind IN ('created', 'note', 'status')", name="ck_claim_events_kind"),
        CheckConstraint("actor IN ('user', 'support')", name="ck_claim_events_actor"),
        CheckConstraint("note IS NULL OR char_length(note) <= 2000", name="ck_claim_events_note"),
        Index("ix_claim_events_claim", "claim_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    claim_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("claims.id", ondelete="CASCADE"), nullable=False)
    kind: Mapped[str] = mapped_column(String(8), nullable=False)
    actor: Mapped[str] = mapped_column(String(8), nullable=False, default="user")
    note: Mapped[str | None] = mapped_column(Text)
    status_to: Mapped[str | None] = mapped_column(String(12))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
