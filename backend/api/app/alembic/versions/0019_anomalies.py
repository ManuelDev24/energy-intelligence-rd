"""ERD-ANOM-01-COMPLETE: anomalías persistidas (una fila por hallazgo) con confianza, estado y deduplicación.

Clave natural `(home_id, dedupe_key)`: volver a escanear actualiza el hallazgo, no lo duplica. Las descartadas no
reaparecen; las que dejan de detectarse (p. ej. se corrigió una factura) pasan a `resolved`. Cae en cascada con la vivienda
y con la factura que las originó. Downgrade elimina la tabla (se regeneran con el siguiente escaneo, salvo el estado
«descartada»/«revisada» que se pierde).
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "anomalies",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("home_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("homes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("bill_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("bills.id", ondelete="CASCADE")),
        sa.Column("kind", sa.String(12), nullable=False),
        sa.Column("source", sa.String(10), nullable=False),
        sa.Column("granularity", sa.String(10), nullable=False),
        sa.Column("severity", sa.String(10), nullable=False),
        sa.Column("confidence", sa.String(8), nullable=False),
        sa.Column("status", sa.String(14), nullable=False, server_default="open"),
        sa.Column("period_start", sa.Date, nullable=False),
        sa.Column("period_end", sa.Date, nullable=False),
        sa.Column("observed_kwh", sa.Numeric(12, 2), nullable=False),
        sa.Column("baseline_kwh", sa.Numeric(12, 2), nullable=False),
        sa.Column("delta_pct", sa.Numeric(10, 2)),
        sa.Column("days", sa.Numeric(8, 2), nullable=False),
        sa.Column("explanation", sa.Text, nullable=False),
        sa.Column("evidence", postgresql.JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("dedupe_key", sa.String(80), nullable=False),
        sa.Column("detected_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("status_changed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("kind IN ('increase', 'drop', 'peak', 'night')", name="ck_anomalies_kind"),
        sa.CheckConstraint("source IN ('readings', 'bills')", name="ck_anomalies_source"),
        sa.CheckConstraint("granularity IN ('day', 'month', 'billing')", name="ck_anomalies_granularity"),
        sa.CheckConstraint("severity IN ('info', 'warning', 'critical')", name="ck_anomalies_severity"),
        sa.CheckConstraint("confidence IN ('low', 'medium', 'high')", name="ck_anomalies_confidence"),
        sa.CheckConstraint("status IN ('open', 'acknowledged', 'dismissed', 'resolved')", name="ck_anomalies_status"),
        sa.CheckConstraint("period_end >= period_start", name="ck_anomalies_period"),
        sa.CheckConstraint("observed_kwh >= 0 AND baseline_kwh >= 0 AND days > 0", name="ck_anomalies_values"),
        sa.CheckConstraint("source <> 'bills' OR bill_id IS NOT NULL", name="ck_anomalies_bill_source"),
        sa.CheckConstraint("octet_length(evidence::text) <= 4096", name="ck_anomalies_evidence_size"),
        sa.UniqueConstraint("home_id", "dedupe_key", name="uq_anomalies_home_key"),
    )
    op.create_index("ix_anomalies_home_status", "anomalies", ["home_id", "status", "period_end"])


def downgrade():
    op.drop_table("anomalies")
