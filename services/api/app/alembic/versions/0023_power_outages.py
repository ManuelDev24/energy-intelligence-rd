"""ERD-INT-01: registro manual de interrupciones del servicio eléctrico.

`power_outages`: inicio, fin (nulo = todavía sin luz), causa de un catálogo cerrado y nota. La base garantiza que el fin
sea posterior al inicio, que una interrupción no dure más de 30 días y que en una vivienda no haya dos que se solapen
(ni dos abiertas), con una restricción de exclusión sobre `tstzrange` (btree_gist ya existe desde 0005).
Downgrade elimina la tabla: son datos escritos por la persona, así que el downgrade los pierde (como el de cualquier tabla).
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist")
    op.create_table(
        "power_outages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("home_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("homes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True)),
        sa.Column("cause", sa.String(16), nullable=False, server_default="unknown"),
        sa.Column("note", sa.String(255)),
        sa.Column("source", sa.String(10), nullable=False, server_default="manual"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("ended_at IS NULL OR ended_at > started_at", name="ck_power_outages_order"),
        sa.CheckConstraint("ended_at IS NULL OR ended_at - started_at <= interval '30 days'", name="ck_power_outages_duration"),
        sa.CheckConstraint("cause IN ('unknown', 'utility_fault', 'scheduled', 'weather', 'home_fault')", name="ck_power_outages_cause"),
        sa.CheckConstraint("source IN ('manual')", name="ck_power_outages_source"),
    )
    op.execute("ALTER TABLE power_outages ADD CONSTRAINT ex_power_outages_overlap EXCLUDE USING gist "
               "(home_id WITH =, tstzrange(started_at, coalesce(ended_at, 'infinity'::timestamptz), '[)') WITH &&)")
    op.create_index("ix_power_outages_home_started", "power_outages", ["home_id", "started_at"])


def downgrade():
    op.drop_index("ix_power_outages_home_started", table_name="power_outages")
    op.drop_table("power_outages")
