"""pilot core: home code, bill readings/source, constraints

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-03
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0002'
down_revision: Union[str, None] = '0001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('homes', sa.Column('code', sa.String(length=32), nullable=True))
    op.create_unique_constraint('homes_code_key', 'homes', ['code'])

    op.add_column('bills', sa.Column('reading_previous', sa.Numeric(precision=12, scale=2), nullable=True))
    op.add_column('bills', sa.Column('reading_current', sa.Numeric(precision=12, scale=2), nullable=True))
    op.add_column('bills', sa.Column('source', sa.String(length=20), server_default='manual', nullable=False))
    op.create_check_constraint('ck_bills_reading_prev_nonneg', 'bills', 'reading_previous IS NULL OR reading_previous >= 0')
    op.create_check_constraint('ck_bills_reading_curr_nonneg', 'bills', 'reading_current IS NULL OR reading_current >= 0')
    op.create_check_constraint(
        'ck_bills_readings_order', 'bills',
        'reading_previous IS NULL OR reading_current IS NULL OR reading_current >= reading_previous',
    )
    op.create_check_constraint('ck_bills_source', 'bills', "source IN ('manual', 'seed')")
    op.create_unique_constraint('uq_bills_home_period', 'bills', ['home_id', 'period_start', 'period_end'])


def downgrade() -> None:
    op.drop_constraint('uq_bills_home_period', 'bills', type_='unique')
    op.drop_constraint('ck_bills_source', 'bills', type_='check')
    op.drop_constraint('ck_bills_readings_order', 'bills', type_='check')
    op.drop_constraint('ck_bills_reading_curr_nonneg', 'bills', type_='check')
    op.drop_constraint('ck_bills_reading_prev_nonneg', 'bills', type_='check')
    op.drop_column('bills', 'source')
    op.drop_column('bills', 'reading_current')
    op.drop_column('bills', 'reading_previous')
    op.drop_constraint('homes_code_key', 'homes', type_='unique')
    op.drop_column('homes', 'code')
