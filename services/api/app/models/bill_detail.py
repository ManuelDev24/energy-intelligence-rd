import uuid
from decimal import Decimal
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, Numeric, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class BillSnapshot(Base):
    __tablename__ = "bill_snapshots"
    __table_args__ = (CheckConstraint("origin IN ('creation', 'migration')", name="ck_bill_snapshots_origin"),)
    bill_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("bills.id", ondelete="CASCADE"), primary_key=True)
    origin: Mapped[str] = mapped_column(String(16), nullable=False)
    data: Mapped[dict] = mapped_column(JSONB, nullable=False)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class BillItem(Base):
    __tablename__ = "bill_items"
    __table_args__ = (
        UniqueConstraint("bill_id", "position", name="uq_bill_items_position"),
        CheckConstraint("position >= 0 AND position < 100", name="ck_bill_items_position"),
        CheckConstraint("amount_dop != 'NaN'::numeric", name="ck_bill_items_finite"),
        CheckConstraint("length(trim(label)) > 0", name="ck_bill_items_label"),
        CheckConstraint("(kind = 'charge' AND amount_dop >= 0) OR (kind = 'discount' AND amount_dop <= 0)", name="ck_bill_items_sign"),
    )
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    bill_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("bills.id", ondelete="CASCADE"), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    amount_dop: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
