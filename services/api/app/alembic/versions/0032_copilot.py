"""ERD-AI-CHAT: Energy Copilot — conversaciones, mensajes y uso diario.

- `copilot_conversations`: de una vivienda Y de una persona. La RLS exige ambas: otro miembro de la misma vivienda no ve las conversaciones
  ajenas (`user_id IS NOT DISTINCT FROM app_user()`; en el piloto sin autenticación no hay contexto ni RLS efectiva, como en el resto).
- `copilot_messages`: hereda la visibilidad de su conversación (subconsulta que pasa por la RLS del padre). Solo texto visible y metadatos:
  ni razonamiento interno, ni prompt del sistema, ni resultados crudos de herramientas.
- `copilot_usage`: contador por persona y día para los límites; sin RLS (como las tablas de identidad), protegido por permisos.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0032"
down_revision = "0031"
branch_labels = None
depends_on = None

APP, WORKER = "erd_app", "erd_worker"


def upgrade():
    op.create_table(
        "copilot_conversations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("home_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("homes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE")),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("char_length(title) BETWEEN 1 AND 120", name="ck_copilot_conversations_title"),
    )
    op.create_index("ix_copilot_conversations_owner", "copilot_conversations", ["home_id", "user_id", "updated_at"])
    op.create_index("ix_copilot_conversations_user_id", "copilot_conversations", ["user_id"])
    op.create_table(
        "copilot_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("copilot_conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(12), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("status", sa.String(12), nullable=False),
        sa.Column("sources", postgresql.JSONB()),
        sa.Column("tools", postgresql.JSONB()),
        sa.Column("model", sa.String(64)),
        sa.Column("input_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("output_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("latency_ms", sa.Integer()),
        sa.Column("feedback", sa.SmallInteger()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("role IN ('user', 'assistant')", name="ck_copilot_messages_role"),
        sa.CheckConstraint("status IN ('complete', 'cancelled', 'error', 'refused', 'limited')", name="ck_copilot_messages_status"),
        sa.CheckConstraint("char_length(content) <= 32000", name="ck_copilot_messages_content"),
        sa.CheckConstraint("feedback IS NULL OR feedback IN (-1, 1)", name="ck_copilot_messages_feedback"),
        sa.CheckConstraint("sources IS NULL OR octet_length(sources::text) <= 32768", name="ck_copilot_messages_sources_size"),
    )
    op.create_index("ix_copilot_messages_conversation", "copilot_messages", ["conversation_id", "created_at"])
    op.create_table(
        "copilot_usage",
        sa.Column("subject", sa.String(64), primary_key=True),
        sa.Column("day", sa.Date(), primary_key=True),
        sa.Column("messages", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.CheckConstraint("messages >= 0 AND tokens >= 0", name="ck_copilot_usage_positive"),
    )
    for table in ("copilot_conversations", "copilot_messages", "copilot_usage"):
        op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO {APP}, {WORKER}")

    op.execute("ALTER TABLE copilot_conversations ENABLE ROW LEVEL SECURITY")
    owner = "home_id = app_home() AND user_id IS NOT DISTINCT FROM app_user()"
    op.execute(f"CREATE POLICY tenant_isolation ON copilot_conversations TO {APP} USING ({owner}) WITH CHECK ({owner})")
    op.execute(f"CREATE POLICY worker_access ON copilot_conversations TO {WORKER} USING (true) WITH CHECK (true)")
    op.execute("ALTER TABLE copilot_messages ENABLE ROW LEVEL SECURITY")
    exists = "EXISTS (SELECT 1 FROM copilot_conversations c WHERE c.id = copilot_messages.conversation_id)"
    op.execute(f"CREATE POLICY tenant_isolation ON copilot_messages TO {APP} USING ({exists}) WITH CHECK ({exists})")
    op.execute(f"CREATE POLICY worker_access ON copilot_messages TO {WORKER} USING (true) WITH CHECK (true)")


def downgrade():
    op.drop_table("copilot_messages")
    op.drop_table("copilot_conversations")
    op.drop_table("copilot_usage")
