import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

RECOMMENDATION_CATEGORIES = ("equipment", "goal", "anomaly", "data")
RECOMMENDATION_STATUSES = ("active", "applied", "dismissed", "resolved")


class Recommendation(Base):
    """ERD-SAVE-01: recomendación de ahorro explicable. Cada fila nombra la regla y su versión, lo que la motivó
    (`evidence`), lo que se supuso (`assumptions`) y, si aplica, un ahorro ESTIMADO. La clave de deduplicación hace que
    recalcular sea idempotente; lo aplicado o descartado por la persona no vuelve a cambiar ni a aparecer."""
    __tablename__ = "recommendations"
    __table_args__ = (
        CheckConstraint("category IN ('equipment', 'goal', 'anomaly', 'data')", name="ck_recommendations_category"),
        CheckConstraint("confidence IN ('low', 'medium', 'high')", name="ck_recommendations_confidence"),
        CheckConstraint("status IN ('active', 'applied', 'dismissed', 'resolved')", name="ck_recommendations_status"),
        CheckConstraint("rule_version >= 1 AND ruleset_version >= 1", name="ck_recommendations_versions"),
        CheckConstraint("savings_kwh_month IS NULL OR savings_kwh_month >= 0", name="ck_recommendations_kwh"),
        CheckConstraint("savings_dop_month IS NULL OR (savings_kwh_month IS NOT NULL AND savings_dop_month >= 0)",
                        name="ck_recommendations_dop"),
        CheckConstraint("octet_length(evidence::text) <= 4096", name="ck_recommendations_evidence_size"),
        CheckConstraint("octet_length(assumptions::text) <= 2048", name="ck_recommendations_assumptions_size"),
        UniqueConstraint("home_id", "dedupe_key", name="uq_recommendations_home_key"),
        Index("ix_recommendations_home_status", "home_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    home_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("homes.id", ondelete="CASCADE"), nullable=False)
    equipment_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("equipment.id", ondelete="SET NULL"), index=True)
    anomaly_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("anomalies.id", ondelete="SET NULL"), index=True)
    rule_id: Mapped[str] = mapped_column(String(40), nullable=False)
    rule_version: Mapped[int] = mapped_column(Integer, nullable=False)
    ruleset_version: Mapped[int] = mapped_column(Integer, nullable=False)
    category: Mapped[str] = mapped_column(String(10), nullable=False)
    title: Mapped[str] = mapped_column(String(140), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    action: Mapped[str] = mapped_column(Text, nullable=False)
    savings_kwh_month: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    savings_dop_month: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    confidence: Mapped[str] = mapped_column(String(8), nullable=False)
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="active", server_default="active")
    assumptions: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb"))
    evidence: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb"))
    dedupe_key: Mapped[str] = mapped_column(String(80), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    status_changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
