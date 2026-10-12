import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint, Date, DateTime, ForeignKey, Index, Numeric, String, Text, UniqueConstraint, func, text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

SEVERITIES = ("info", "warning", "critical", "savings")
ALERT_TYPES = ("bill_variation", "anomaly", "payment_due", "missing_bill", "stale_readings")
STATUSES = ("unread", "read", "dismissed")
ALERT_TYPE_BILL_VARIATION = "bill_variation"
ALERT_TYPE_ANOMALY = "anomaly"
ALERT_TYPE_PAYMENT = "payment_due"
ALERT_TYPE_MISSING_BILL = "missing_bill"
ALERT_TYPE_STALE_READINGS = "stale_readings"


def _in(col: str, vals) -> str:
    return f"{col} IN ({', '.join(repr(v) for v in vals)})"


class Alert(Base):
    """Alerta por reglas: variación de kWh de una factura frente a la anterior (período base)."""

    __tablename__ = "alerts"
    __table_args__ = (
        CheckConstraint(_in("severity", SEVERITIES), name="ck_alerts_severity"),
        CheckConstraint(_in("type", ALERT_TYPES), name="ck_alerts_type"),
        CheckConstraint(_in("status", STATUSES), name="ck_alerts_status"),
        UniqueConstraint("home_id", "bill_id", "type", name="uq_alerts_home_bill_type"),
        Index("ix_alerts_home_status", "home_id", "status"),
        Index("uq_alerts_home_key", "home_id", "dedupe_key", unique=True, postgresql_where=text("dedupe_key IS NOT NULL")),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    home_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("homes.id", ondelete="CASCADE"), nullable=False
    )
    # Factura que dispara la alerta y factura del período base con la que se compara.
    bill_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("bills.id", ondelete="CASCADE"), index=True
    )
    basis_bill_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("bills.id", ondelete="CASCADE"), index=True
    )
    basis_period_start: Mapped[date | None] = mapped_column(Date)
    basis_period_end: Mapped[date | None] = mapped_column(Date)
    # Valid bill values can produce 14 integer digits when the baseline is 0.01.
    kwh_pct: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    threshold_pct: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    # Alertas de anomalía: la anomalía que las origina; las de reglas (pago, datos incompletos) llevan clave de deduplicación.
    anomaly_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("anomalies.id", ondelete="CASCADE"), index=True)
    dedupe_key: Mapped[str | None] = mapped_column(String(80))
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="unread", server_default="unread")
    message: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    home = relationship("Home", back_populates="alerts")
    bill = relationship("Bill", back_populates="alerts", foreign_keys=[bill_id])
