import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Numeric, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class HomeGoal(Base):
    """Meta mensual de una vivienda: RD$ y/o kWh (al menos una)."""
    __tablename__ = "home_goals"
    __table_args__ = (
        CheckConstraint("monthly_amount_rd IS NOT NULL OR monthly_kwh IS NOT NULL", name="ck_home_goals_any"),
        CheckConstraint("monthly_amount_rd IS NULL OR monthly_amount_rd > 0", name="ck_home_goals_amount_pos"),
        CheckConstraint("monthly_kwh IS NULL OR monthly_kwh > 0", name="ck_home_goals_kwh_pos"),
    )

    home_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("homes.id", ondelete="CASCADE"),
                                               primary_key=True)
    monthly_amount_rd: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    monthly_kwh: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(),
                                                 onupdate=func.now(), nullable=False)
