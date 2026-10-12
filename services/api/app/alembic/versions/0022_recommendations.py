"""ERD-SAVE-01: recomendaciones de ahorro explicables, versionadas e idempotentes.

`recommendations`: una fila por (vivienda, `dedupe_key`). Guarda la regla y su versión, la versión del conjunto de reglas,
la evidencia y los supuestos, un ahorro opcional ESTIMADO (kWh y RD$ por mes) y el estado elegido por la persona.
Downgrade elimina la tabla (son datos derivados: el motor los regenera desde equipos, facturas, meta y anomalías).
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "recommendations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("home_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("homes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("equipment_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("equipment.id", ondelete="SET NULL")),
        sa.Column("anomaly_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("anomalies.id", ondelete="SET NULL")),
        sa.Column("rule_id", sa.String(40), nullable=False),
        sa.Column("rule_version", sa.Integer, nullable=False),
        sa.Column("ruleset_version", sa.Integer, nullable=False),
        sa.Column("category", sa.String(10), nullable=False),
        sa.Column("title", sa.String(140), nullable=False),
        sa.Column("summary", sa.Text, nullable=False),
        sa.Column("action", sa.Text, nullable=False),
        sa.Column("savings_kwh_month", sa.Numeric(12, 2)),
        sa.Column("savings_dop_month", sa.Numeric(12, 2)),
        sa.Column("confidence", sa.String(8), nullable=False),
        sa.Column("status", sa.String(10), nullable=False, server_default="active"),
        sa.Column("assumptions", postgresql.JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("evidence", postgresql.JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("dedupe_key", sa.String(80), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("status_changed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("category IN ('equipment', 'goal', 'anomaly', 'data')", name="ck_recommendations_category"),
        sa.CheckConstraint("confidence IN ('low', 'medium', 'high')", name="ck_recommendations_confidence"),
        sa.CheckConstraint("status IN ('active', 'applied', 'dismissed', 'resolved')", name="ck_recommendations_status"),
        sa.CheckConstraint("rule_version >= 1 AND ruleset_version >= 1", name="ck_recommendations_versions"),
        sa.CheckConstraint("savings_kwh_month IS NULL OR savings_kwh_month >= 0", name="ck_recommendations_kwh"),
        sa.CheckConstraint("savings_dop_month IS NULL OR (savings_kwh_month IS NOT NULL AND savings_dop_month >= 0)",
                           name="ck_recommendations_dop"),
        sa.CheckConstraint("octet_length(evidence::text) <= 4096", name="ck_recommendations_evidence_size"),
        sa.CheckConstraint("octet_length(assumptions::text) <= 2048", name="ck_recommendations_assumptions_size"),
        sa.UniqueConstraint("home_id", "dedupe_key", name="uq_recommendations_home_key"),
    )
    op.create_index("ix_recommendations_home_status", "recommendations", ["home_id", "status"])


def downgrade():
    op.drop_index("ix_recommendations_home_status", table_name="recommendations")
    op.drop_table("recommendations")
