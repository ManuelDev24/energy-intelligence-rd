import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

MAX_HOURS_PER_DAY = 24
MAX_POWER_W = 100_000


class Equipment(Base):
    """Equipo declarado por el usuario. Su consumo es siempre una ESTIMACIÓN (W × horas), no una medición."""

    __tablename__ = "equipment"
    __table_args__ = (
        CheckConstraint(f"power_w >= 0 AND power_w <= {MAX_POWER_W}", name="ck_equipment_power_range"),
        CheckConstraint(
            f"hours_per_day >= 0 AND hours_per_day <= {MAX_HOURS_PER_DAY}", name="ck_equipment_hours_range"
        ),
        Index("ix_equipment_home", "home_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    home_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("homes.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    room: Mapped[str | None] = mapped_column(String(80))
    power_w: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    hours_per_day: Mapped[Decimal] = mapped_column(Numeric(4, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    home = relationship("Home", back_populates="equipment")


class AlertSettings(Base):
    """Umbrales de alerta por vivienda (variación % de kWh frente a la factura anterior)."""

    __tablename__ = "alert_settings"
    __table_args__ = (
        CheckConstraint("warning_pct > 0", name="ck_alert_settings_warning_pos"),
        CheckConstraint("critical_pct >= warning_pct", name="ck_alert_settings_critical_ge_warning"),
    )

    home_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("homes.id", ondelete="CASCADE"), primary_key=True
    )
    warning_pct: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False, default=Decimal("20"),
                                                 server_default="20")
    critical_pct: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False, default=Decimal("40"),
                                                  server_default="40")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    home = relationship("Home", back_populates="alert_settings")
