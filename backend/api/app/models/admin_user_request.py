import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Index, String, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AdminUserRequest(Base):
    """A scoped, auditable administrative request; it never exports or deletes data itself.

    User IDs and actor IDs are pseudonymous UUIDs without foreign keys so an account deletion
    does not erase the request history. Retention policy remains an owner/legal decision.
    """
    __tablename__ = "admin_user_requests"
    __table_args__ = (
        CheckConstraint("kind IN ('export', 'deletion')", name="ck_admin_user_requests_kind"),
        CheckConstraint("status IN ('pending', 'in_progress', 'completed', 'rejected')",
                        name="ck_admin_user_requests_status"),
        CheckConstraint("length(trim(reason)) > 0", name="ck_admin_user_requests_reason"),
        CheckConstraint("((status IN ('completed', 'rejected')) = (resolved_at IS NOT NULL))",
                        name="ck_admin_user_requests_resolved_at"),
        CheckConstraint("((status IN ('completed', 'rejected')) = (resolution_reason IS NOT NULL))",
                        name="ck_admin_user_requests_resolution_reason"),
        Index("ix_admin_user_requests_created", "created_at"),
        Index("ix_admin_user_requests_target", "target_user_id", "created_at"),
        Index("uq_admin_user_requests_open", "target_user_id", "kind", unique=True,
              postgresql_where=text("status IN ('pending', 'in_progress')")),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    target_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    updated_by_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending", server_default="pending")
    reason: Mapped[str] = mapped_column(String(500), nullable=False)
    resolution_reason: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
