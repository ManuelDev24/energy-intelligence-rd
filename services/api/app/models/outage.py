import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, func, text
from sqlalchemy.dialects.postgresql import ExcludeConstraint, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

OUTAGE_CAUSES = ("unknown", "utility_fault", "scheduled", "weather", "home_fault")
MAX_OUTAGE_DAYS = 30


class PowerOutage(Base):
    """ERD-INT-01: interrupción del servicio eléctrico registrada a mano. `ended_at` nulo = todavía sin luz.
    Una vivienda no puede tener dos interrupciones que se solapen (ni dos abiertas)."""
    __tablename__ = "power_outages"
    __table_args__ = (
        CheckConstraint("ended_at IS NULL OR ended_at > started_at", name="ck_power_outages_order"),
        CheckConstraint(f"ended_at IS NULL OR ended_at - started_at <= interval '{MAX_OUTAGE_DAYS} days'", name="ck_power_outages_duration"),
        CheckConstraint("cause IN ('unknown', 'utility_fault', 'scheduled', 'weather', 'home_fault')", name="ck_power_outages_cause"),
        CheckConstraint("source IN ('manual')", name="ck_power_outages_source"),
        ExcludeConstraint(("home_id", "="), (text("tstzrange(started_at, coalesce(ended_at, 'infinity'::timestamptz), '[)')"), "&&"),
                          using="gist", name="ex_power_outages_overlap"),
        Index("ix_power_outages_home_started", "home_id", "started_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    home_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("homes.id", ondelete="CASCADE"), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cause: Mapped[str] = mapped_column(String(16), nullable=False, default="unknown", server_default="unknown")
    note: Mapped[str | None] = mapped_column(String(255))
    source: Mapped[str] = mapped_column(String(10), nullable=False, default="manual", server_default="manual")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
