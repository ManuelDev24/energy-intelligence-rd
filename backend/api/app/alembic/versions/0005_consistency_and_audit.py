"""Enforce non-overlapping bills and retain pilot mutation history."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade():
    # Existing conflicts fail migration atomically; no silent deletion or rewriting.
    op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist")
    op.execute("ALTER TABLE bills ADD CONSTRAINT ex_bills_home_period_overlap "
               "EXCLUDE USING gist (home_id WITH =, daterange(period_start, period_end, '[]') WITH &&)")
    op.add_column("bills", sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))
    op.create_index("ix_bills_home_recent", "bills", ["home_id", "period_end", "id"])
    op.create_table("audit_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("home_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("entity", sa.String(32), nullable=False),
        sa.Column("operation", sa.String(16), nullable=False),
        sa.Column("actor", sa.String(32), nullable=False),
        sa.Column("before", postgresql.JSONB()), sa.Column("after", postgresql.JSONB()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))
    op.create_index("ix_audit_home_created", "audit_events", ["home_id", "created_at"])


def downgrade():
    op.drop_table("audit_events")
    op.drop_index("ix_bills_home_recent", "bills")
    op.drop_column("bills", "updated_at")
    op.drop_constraint("ex_bills_home_period_overlap", "bills")
    # Leave btree_gist installed: it may be used by other objects.
