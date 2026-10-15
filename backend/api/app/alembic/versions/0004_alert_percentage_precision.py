"""Preserve valid extreme bill variations without overflowing alerts.

Revision ID: 0004
Revises: 0003
"""
from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("alerts", "kwh_pct", existing_type=sa.Numeric(8, 2), type_=sa.Numeric(18, 2))


def downgrade() -> None:
    # PostgreSQL refuses narrowing if existing values cannot fit; never truncate.
    op.alter_column("alerts", "kwh_pct", existing_type=sa.Numeric(18, 2), type_=sa.Numeric(8, 2))
