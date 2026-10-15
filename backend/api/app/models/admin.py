import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AdminRole(Base):
    __tablename__ = "admin_roles"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    description: Mapped[str] = mapped_column(String(256), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class AdminScope(Base):
    __tablename__ = "admin_scopes"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    description: Mapped[str] = mapped_column(String(256), nullable=False)


class AdminRoleScope(Base):
    __tablename__ = "admin_role_scopes"
    role_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("admin_roles.id", ondelete="CASCADE"), primary_key=True)
    scope_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("admin_scopes.id", ondelete="CASCADE"), primary_key=True, index=True)


class AdminRoleAssignment(Base):
    """Grant of one admin_role to one user. Revocation is a column flip, never a delete:
    history must survive so audit queries can reconstruct who had what access, when."""
    __tablename__ = "admin_role_assignments"
    __table_args__ = (
        CheckConstraint("length(trim(reason)) > 0", name="ck_admin_role_assignments_reason"),
        CheckConstraint("(revoked_at IS NULL) = (revoke_reason IS NULL)", name="ck_admin_role_assignments_revoke_pair"),
        CheckConstraint("(revoked_at IS NULL) = (revoked_by_user_id IS NULL)", name="ck_admin_role_assignments_revoked_by_pair"),
        Index("ix_admin_role_assignments_user", "user_id"),
        Index("ix_admin_role_assignments_role", "role_id"),
        # Mirrors the partial unique index created by migration 0014 so autogenerate (and
        # test_models_match_migration) see the model and the DB schema agree.
        Index("uq_admin_role_assignments_active", "user_id", "role_id", unique=True,
              postgresql_where=text("revoked_at IS NULL")),
    )
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("admin_roles.id", ondelete="RESTRICT"), nullable=False)
    assigned_by_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True)
    reason: Mapped[str] = mapped_column(String(500), nullable=False)
    granted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_by_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True)
    revoke_reason: Mapped[str | None] = mapped_column(String(500))


class AdminAuditEvent(Base):
    """Immutable (DB triggers reject UPDATE/DELETE/TRUNCATE, see migration 0014).
    Never store passwords, tokens, cookies, full documents/images or unnecessary PII here —
    `metadata` must only carry small sanitized identifiers (ids, role/scope names, counts)."""
    __tablename__ = "admin_audit_events"
    __table_args__ = (
        CheckConstraint("result IN ('success', 'denied', 'error')", name="ck_admin_audit_events_result"),
        Index("ix_admin_audit_events_created", "created_at"),
        Index("ix_admin_audit_events_actor", "actor_user_id"),
    )
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    resource: Mapped[str] = mapped_column(String(128), nullable=False)
    scope_used: Mapped[str | None] = mapped_column(String(64))
    reason: Mapped[str | None] = mapped_column(String(500))
    result: Mapped[str] = mapped_column(String(16), nullable=False)
    request_id: Mapped[str | None] = mapped_column(String(64))
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
