import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, Numeric, String, UniqueConstraint, func
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
        CheckConstraint("reading_previous IS NULL OR reading_previous >= 0", name="ck_bills_reading_prev_nonneg"),
        CheckConstraint("reading_current IS NULL OR reading_current >= 0", name="ck_bills_reading_curr_nonneg"),
        CheckConstraint(
            "reading_previous IS NULL OR reading_current IS NULL OR reading_current >= reading_previous",
            name="ck_bills_readings_order",
        ),
        CheckConstraint("source IN ('manual', 'seed')", name="ck_bills_source"),
        UniqueConstraint("home_id", "period_start", "period_end", name="uq_bills_home_period"),
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
    reading_previous: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    reading_current: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    # manual = introducida por el usuario; seed = dato demo de los pilotos.
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="manual", server_default="manual")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    home = relationship("Home", back_populates="bills")
    alerts = relationship("Alert", back_populates="bill", foreign_keys="Alert.bill_id", passive_deletes=True)
