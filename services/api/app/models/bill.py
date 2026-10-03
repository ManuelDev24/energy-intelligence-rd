import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, Numeric, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Bill(Base):
    __tablename__ = "bills"
    __table_args__ = (
        CheckConstraint("kwh >= 0", name="ck_bills_kwh_nonneg"),
        CheckConstraint("amount_dop >= 0", name="ck_bills_amount_nonneg"),
        CheckConstraint("days >= 0", name="ck_bills_days_nonneg"),
        CheckConstraint("period_end >= period_start", name="ck_bills_period_valid"),
        Index("ix_bills_home_period", "home_id", "period_start"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    home_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("homes.id", ondelete="CASCADE"), nullable=False
    )
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    kwh: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    amount_dop: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    days: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    home = relationship("Home", back_populates="bills")
    alerts = relationship("Alert", back_populates="bill")
