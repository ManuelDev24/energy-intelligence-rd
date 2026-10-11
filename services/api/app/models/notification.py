import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class DeviceToken(Base):
    """Token de notificaciones push (Expo) de un dispositivo de una persona. Único: si el mismo dispositivo inicia sesión con
    otra cuenta, el token pasa a esa cuenta."""
    __tablename__ = "device_tokens"
    __table_args__ = (CheckConstraint("platform IN ('ios', 'android')", name="ck_device_tokens_platform"),
                      Index("ix_device_tokens_user", "user_id"))

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    platform: Mapped[str] = mapped_column(String(10), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class Notification(Base):
    """Un envío (correo o push) de una alerta a una persona. Única por (alerta, persona, canal, severidad): una escalada de
    severidad avisa otra vez, pero reevaluar no repite."""
    __tablename__ = "notifications"
    __table_args__ = (
        CheckConstraint("channel IN ('email', 'push')", name="ck_notifications_channel"),
        CheckConstraint("status IN ('pending', 'sent', 'failed', 'skipped')", name="ck_notifications_status"),
        CheckConstraint("severity IN ('warning', 'critical')", name="ck_notifications_severity"),
        UniqueConstraint("alert_id", "user_id", "channel", "severity", name="uq_notifications_once"),
        Index("ix_notifications_user_sent", "user_id", "channel", "sent_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    alert_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("alerts.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    channel: Mapped[str] = mapped_column(String(8), nullable=False)
    severity: Mapped[str] = mapped_column(String(10), nullable=False)
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="pending", server_default="pending")
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    reason: Mapped[str | None] = mapped_column(String(40))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
