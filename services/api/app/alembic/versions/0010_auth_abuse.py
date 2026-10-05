"""Persistent auth attempt budgets; no account or pilot data changes."""
from alembic import op
import sqlalchemy as sa

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("auth_abuse_buckets",
        sa.Column("key", sa.String(64), primary_key=True),
        sa.Column("window_started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.CheckConstraint("attempts >= 0", name="ck_auth_abuse_attempts"))


def downgrade():
    op.drop_table("auth_abuse_buckets")
