import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AuditEvent(Base):
    """Pilot mutations; references intentionally survive deletion of source records.

    actor=pilot is a context label, not an authenticated identity.
    """
    __tablename__ = "audit_events"
    __table_args__ = (Index("ix_audit_home_created", "home_id", "created_at"), Index("ix_audit_created", "created_at"),
                      Index("ix_audit_actor_user", "actor_user_id", postgresql_where=text("actor_user_id IS NOT NULL")))
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    home_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    entity: Mapped[str] = mapped_column(String(32), nullable=False)
    operation: Mapped[str] = mapped_column(String(16), nullable=False)
    actor: Mapped[str] = mapped_column(String(32), nullable=False, default="pilot")
    # Auditoría C-15 (migración 0028): quién actuó, cuando hubo sesión. SET NULL al borrar la cuenta (además se seudonimiza `actor`).
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    before: Mapped[dict | None] = mapped_column(JSONB)
    after: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
