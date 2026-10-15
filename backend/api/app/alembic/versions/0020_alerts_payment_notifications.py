"""ERD-ALERT-02: pago (fecha límite y pagada), cuatro severidades, alertas de anomalía/datos incompletos y envíos.

- `bills.due_date` / `bills.paid_at`: opcionales; sin fecha límite no hay alerta de pago (no se inventa).
- `alerts`: severidad `info|warning|critical|savings`, tipos nuevos, enlace opcional a la anomalía y `dedupe_key` único por
  vivienda para las alertas generadas por reglas.
- `device_tokens`: tokens de notificación push (Expo) por persona; `notifications`: bandeja de envíos (correo/push) por alerta,
  persona y canal, con estado y motivo, única por (alerta, persona, canal, severidad) para no repetir.
Downgrade elimina lo nuevo; las alertas con severidad `info`/`savings` o tipos nuevos se borran (no caben en el esquema anterior).
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None

TYPES = "('bill_variation', 'anomaly', 'payment_due', 'missing_bill', 'stale_readings')"


def upgrade():
    op.add_column("bills", sa.Column("due_date", sa.Date))
    op.add_column("bills", sa.Column("paid_at", sa.DateTime(timezone=True)))
    op.create_check_constraint("ck_bills_due_after_start", "bills", "due_date IS NULL OR due_date >= period_start")
    op.drop_constraint("ck_alerts_severity", "alerts", type_="check")
    op.create_check_constraint("ck_alerts_severity", "alerts", "severity IN ('info', 'warning', 'critical', 'savings')")
    # Alertas anteriores a este esquema: todas eran de variación de factura, cualquiera fuera su etiqueta legada.
    op.execute(f"UPDATE alerts SET type = 'bill_variation' WHERE type NOT IN {TYPES}")
    op.create_check_constraint("ck_alerts_type", "alerts", f"type IN {TYPES}")
    op.add_column("alerts", sa.Column("anomaly_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("anomalies.id", ondelete="CASCADE")))
    op.add_column("alerts", sa.Column("dedupe_key", sa.String(80)))
    op.create_index("uq_alerts_home_key", "alerts", ["home_id", "dedupe_key"], unique=True, postgresql_where=sa.text("dedupe_key IS NOT NULL"))
    op.create_table(
        "device_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token", sa.String(200), nullable=False, unique=True),
        sa.Column("platform", sa.String(10), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("platform IN ('ios', 'android')", name="ck_device_tokens_platform"),
    )
    op.create_index("ix_device_tokens_user", "device_tokens", ["user_id"])
    op.create_table(
        "notifications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("alert_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("alerts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("channel", sa.String(8), nullable=False),
        sa.Column("severity", sa.String(10), nullable=False),
        sa.Column("status", sa.String(10), nullable=False, server_default="pending"),
        sa.Column("attempts", sa.Integer, nullable=False, server_default="0"),
        sa.Column("reason", sa.String(40)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("sent_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("channel IN ('email', 'push')", name="ck_notifications_channel"),
        sa.CheckConstraint("status IN ('pending', 'sent', 'failed', 'skipped')", name="ck_notifications_status"),
        sa.CheckConstraint("severity IN ('warning', 'critical')", name="ck_notifications_severity"),
        sa.UniqueConstraint("alert_id", "user_id", "channel", "severity", name="uq_notifications_once"),
    )
    op.create_index("ix_notifications_user_sent", "notifications", ["user_id", "channel", "sent_at"])


def downgrade():
    op.drop_table("notifications")
    op.drop_table("device_tokens")
    op.drop_index("uq_alerts_home_key", table_name="alerts")
    op.drop_column("alerts", "dedupe_key")
    op.drop_column("alerts", "anomaly_id")
    op.execute("DELETE FROM alerts WHERE severity NOT IN ('warning', 'critical') OR type <> 'bill_variation'")
    op.drop_constraint("ck_alerts_type", "alerts", type_="check")
    op.drop_constraint("ck_alerts_severity", "alerts", type_="check")
    op.create_check_constraint("ck_alerts_severity", "alerts", "severity IN ('warning', 'critical')")
    op.drop_constraint("ck_bills_due_after_start", "bills", type_="check")
    op.drop_column("bills", "paid_at")
    op.drop_column("bills", "due_date")
