import uuid
from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, SmallInteger, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

MESSAGE_ROLES = ("user", "assistant")
MESSAGE_STATUSES = ("complete", "cancelled", "error", "refused", "limited")


class CopilotConversation(Base):
    """ERD-AI-CHAT: conversación del Energy Copilot. Pertenece a una vivienda Y a una persona: otros miembros de la misma vivienda no
    la ven (RLS, migración 0032). `user_id` solo es NULL en el modo piloto local sin autenticación."""
    __tablename__ = "copilot_conversations"
    __table_args__ = (
        CheckConstraint("char_length(title) BETWEEN 1 AND 120", name="ck_copilot_conversations_title"),
        Index("ix_copilot_conversations_owner", "home_id", "user_id", "updated_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    home_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("homes.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class CopilotMessage(Base):
    """Un turno. Solo se guarda el texto visible y metadatos (fuentes, herramientas, tokens): nunca el razonamiento interno, el prompt
    del sistema ni los resultados crudos de las herramientas."""
    __tablename__ = "copilot_messages"
    __table_args__ = (
        CheckConstraint("role IN ('user', 'assistant')", name="ck_copilot_messages_role"),
        CheckConstraint("status IN ('complete', 'cancelled', 'error', 'refused', 'limited')", name="ck_copilot_messages_status"),
        CheckConstraint("char_length(content) <= 32000", name="ck_copilot_messages_content"),
        CheckConstraint("feedback IS NULL OR feedback IN (-1, 1)", name="ck_copilot_messages_feedback"),
        CheckConstraint("sources IS NULL OR octet_length(sources::text) <= 32768", name="ck_copilot_messages_sources_size"),
        Index("ix_copilot_messages_conversation", "conversation_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("copilot_conversations.id", ondelete="CASCADE"),
                                                       nullable=False)
    role: Mapped[str] = mapped_column(String(12), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="complete")
    sources: Mapped[list | None] = mapped_column(JSONB(none_as_null=True))
    tools: Mapped[list | None] = mapped_column(JSONB(none_as_null=True))
    model: Mapped[str | None] = mapped_column(String(64))
    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    feedback: Mapped[int | None] = mapped_column(SmallInteger)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class CopilotUsage(Base):
    """Contador diario por persona (día de República Dominicana) para los límites de uso. Sin RLS, como las tablas de identidad: se
    consulta antes de saber en qué vivienda está la conversación y la cuota es de la persona, no de la vivienda."""
    __tablename__ = "copilot_usage"
    __table_args__ = (CheckConstraint("messages >= 0 AND tokens >= 0", name="ck_copilot_usage_positive"),)

    subject: Mapped[str] = mapped_column(String(64), primary_key=True)  # id de la persona, o «pilot» sin autenticación
    day: Mapped[date] = mapped_column(Date, primary_key=True)
    messages: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
