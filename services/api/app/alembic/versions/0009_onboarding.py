"""Optional onboarding profile and one service contract per home; no pilot backfill."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = '0009'
down_revision = '0008'
branch_labels = None
depends_on = None

FIELDS = ('province', 'municipality', 'sector', 'user_type')
FLAGS = ('has_ac', 'has_water_heater', 'has_pool', 'has_solar', 'has_inverter')


def upgrade():
    for field in FIELDS:
        op.add_column('homes', sa.Column(field, sa.String(120), nullable=True))
    op.add_column('homes', sa.Column('occupants', sa.Integer(), nullable=True))
    for field in FLAGS:
        op.add_column('homes', sa.Column(field, sa.Boolean(), nullable=True))
    op.create_check_constraint('ck_homes_occupants_positive', 'homes', 'occupants IS NULL OR occupants BETWEEN 1 AND 999')
    op.create_table('contracts',
        sa.Column('home_id', UUID(as_uuid=True), sa.ForeignKey('homes.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('account_number', sa.String(120), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("length(trim(account_number)) > 0", name='ck_contracts_account_number_nonempty'))


def downgrade():
    op.drop_table('contracts')
    op.drop_constraint('ck_homes_occupants_positive', 'homes', type_='check')
    for field in reversed(FLAGS):
        op.drop_column('homes', field)
    op.drop_column('homes', 'occupants')
    for field in reversed(FIELDS):
        op.drop_column('homes', field)
