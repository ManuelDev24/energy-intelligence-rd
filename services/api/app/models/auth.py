import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = (CheckConstraint("role IN ('user', 'admin', 'support')", name="ck_users_role"),
                      CheckConstraint("(terms_version IS NULL) = (terms_accepted_at IS NULL)",
                                      name="ck_users_terms_consent"))
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(254), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False, default="user", server_default="user")
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    # NULL = usuario legado anterior al consentimiento (migración 0012).
    terms_version: Mapped[str | None] = mapped_column(String(32))
    terms_accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class HomeMember(Base):
    __tablename__ = "home_members"
    __table_args__ = (CheckConstraint("role IN ('owner', 'member')", name="ck_home_members_role"),)
    home_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("homes.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True)
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class AuthSession(Base):
    __tablename__ = "auth_sessions"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    session_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("auth_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PasswordResetToken(Base):
    """ERD-AUTH-05: un solo uso; solo se guarda el SHA-256 del token (nunca el token)."""
    __tablename__ = "password_reset_tokens"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
                                               nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # HMAC del peer que lo pidió (seudónimo, igual que auth_abuse_buckets); nunca IP en claro.
    requested_peer_hash: Mapped[str | None] = mapped_column(String(64))
