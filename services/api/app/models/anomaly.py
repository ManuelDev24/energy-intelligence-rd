import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, Numeric, String, Text, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

ANOMALY_KINDS = ("increase", "drop", "peak", "night")
ANOMALY_STATUSES = ("open", "acknowledged", "dismissed", "resolved")


class Anomaly(Base):
    """ERD-ANOM-01-COMPLETE: un hallazgo del motor de anomalías. Explicable (observado, línea base, evidencia), con
    confianza y estado. La clave de deduplicación evita repetirlo en cada escaneo; lo descartado no reaparece."""
    __tablename__ = "anomalies"
    __table_args__ = (
        CheckConstraint("kind IN ('increase', 'drop', 'peak', 'night')", name="ck_anomalies_kind"),
        CheckConstraint("source IN ('readings', 'bills')", name="ck_anomalies_source"),
        CheckConstraint("granularity IN ('day', 'month', 'billing')", name="ck_anomalies_granularity"),
        CheckConstraint("severity IN ('info', 'warning', 'critical')", name="ck_anomalies_severity"),
        CheckConstraint("confidence IN ('low', 'medium', 'high')", name="ck_anomalies_confidence"),
        CheckConstraint("status IN ('open', 'acknowledged', 'dismissed', 'resolved')", name="ck_anomalies_status"),
        CheckConstraint("period_end >= period_start", name="ck_anomalies_period"),
        CheckConstraint("observed_kwh >= 0 AND baseline_kwh >= 0 AND days > 0", name="ck_anomalies_values"),
        CheckConstraint("source <> 'bills' OR bill_id IS NOT NULL", name="ck_anomalies_bill_source"),
        CheckConstraint("octet_length(evidence::text) <= 4096", name="ck_anomalies_evidence_size"),
        UniqueConstraint("home_id", "dedupe_key", name="uq_anomalies_home_key"),
        Index("ix_anomalies_home_status", "home_id", "status", "period_end"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    home_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("homes.id", ondelete="CASCADE"), nullable=False)
    bill_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("bills.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(12), nullable=False)
    source: Mapped[str] = mapped_column(String(10), nullable=False)
    granularity: Mapped[str] = mapped_column(String(10), nullable=False)
    severity: Mapped[str] = mapped_column(String(10), nullable=False)
    confidence: Mapped[str] = mapped_column(String(8), nullable=False)
    status: Mapped[str] = mapped_column(String(14), nullable=False, default="open", server_default="open")
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    observed_kwh: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    baseline_kwh: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    delta_pct: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    days: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False)
    explanation: Mapped[str] = mapped_column(Text, nullable=False)
    evidence: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb"))
    dedupe_key: Mapped[str] = mapped_column(String(80), nullable=False)
    detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    status_changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
