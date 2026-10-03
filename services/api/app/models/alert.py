import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

SEVERITIES = ("info", "warning", "critical")
STATUSES = ("open", "acknowledged", "resolved")


def _in(col: str, vals) -> str:
    return f"{col} IN ({', '.join(repr(v) for v in vals)})"


class Alert(Base):
    __tablename__ = "alerts"
    __table_args__ = (
        CheckConstraint(_in("severity", SEVERITIES), name="ck_alerts_severity"),
        CheckConstraint(_in("status", STATUSES), name="ck_alerts_status"),
        Index("ix_alerts_home_status", "home_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    home_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("homes.id", ondelete="CASCADE"), nullable=False
    )
    bill_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("bills.id", ondelete="SET NULL")
    )
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False, default="info", server_default="info")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open", server_default="open")
    message: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    home = relationship("Home", back_populates="alerts")
    bill = relationship("Bill", back_populates="alerts")
