"""insights: equipment, alert settings, bill-variation alerts with read/dismissed states

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-04
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '0003'
down_revision: Union[str, None] = '0002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'equipment',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('home_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('homes.id', ondelete='CASCADE'),
                  nullable=False),
        sa.Column('name', sa.String(120), nullable=False),
        sa.Column('room', sa.String(80)),
        sa.Column('power_w', sa.Numeric(10, 2), nullable=False),
        sa.Column('hours_per_day', sa.Numeric(4, 2), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint('power_w >= 0 AND power_w <= 100000', name='ck_equipment_power_range'),
        sa.CheckConstraint('hours_per_day >= 0 AND hours_per_day <= 24', name='ck_equipment_hours_range'),
    )
    op.create_index('ix_equipment_home', 'equipment', ['home_id'])

    op.create_table(
        'alert_settings',
        sa.Column('home_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('homes.id', ondelete='CASCADE'),
                  primary_key=True),
        sa.Column('warning_pct', sa.Numeric(6, 2), server_default='20', nullable=False),
        sa.Column('critical_pct', sa.Numeric(6, 2), server_default='40', nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint('warning_pct > 0', name='ck_alert_settings_warning_pos'),
        sa.CheckConstraint('critical_pct >= warning_pct', name='ck_alert_settings_critical_ge_warning'),
    )

    # alerts: estados unread/read/dismissed, solo severidades warning/critical, período base.
    op.drop_constraint('ck_alerts_status', 'alerts', type_='check')
    op.drop_constraint('ck_alerts_severity', 'alerts', type_='check')
    op.execute("UPDATE alerts SET status = CASE status WHEN 'open' THEN 'unread' "
               "WHEN 'acknowledged' THEN 'read' ELSE 'dismissed' END")
    op.execute("UPDATE alerts SET severity = 'warning' WHERE severity = 'info'")
    op.alter_column('alerts', 'status', server_default='unread')
    op.alter_column('alerts', 'severity', server_default=None)
    op.create_check_constraint('ck_alerts_status', 'alerts', "status IN ('unread', 'read', 'dismissed')")
    op.create_check_constraint('ck_alerts_severity', 'alerts', "severity IN ('warning', 'critical')")

    op.drop_constraint('alerts_bill_id_fkey', 'alerts', type_='foreignkey')
    op.create_foreign_key('alerts_bill_id_fkey', 'alerts', 'bills', ['bill_id'], ['id'], ondelete='CASCADE')
    op.add_column('alerts', sa.Column('basis_bill_id', postgresql.UUID(as_uuid=True)))
    op.create_foreign_key('alerts_basis_bill_id_fkey', 'alerts', 'bills', ['basis_bill_id'], ['id'],
                          ondelete='CASCADE')
    op.add_column('alerts', sa.Column('basis_period_start', sa.Date()))
    op.add_column('alerts', sa.Column('basis_period_end', sa.Date()))
    op.add_column('alerts', sa.Column('kwh_pct', sa.Numeric(8, 2)))
    op.add_column('alerts', sa.Column('threshold_pct', sa.Numeric(6, 2)))
    op.create_unique_constraint('uq_alerts_home_bill_type', 'alerts', ['home_id', 'bill_id', 'type'])


def downgrade() -> None:
    op.drop_constraint('uq_alerts_home_bill_type', 'alerts', type_='unique')
    op.drop_column('alerts', 'threshold_pct')
    op.drop_column('alerts', 'kwh_pct')
    op.drop_column('alerts', 'basis_period_end')
    op.drop_column('alerts', 'basis_period_start')
    op.drop_constraint('alerts_basis_bill_id_fkey', 'alerts', type_='foreignkey')
    op.drop_column('alerts', 'basis_bill_id')
    op.drop_constraint('alerts_bill_id_fkey', 'alerts', type_='foreignkey')
    op.create_foreign_key('alerts_bill_id_fkey', 'alerts', 'bills', ['bill_id'], ['id'], ondelete='SET NULL')

    op.drop_constraint('ck_alerts_severity', 'alerts', type_='check')
    op.drop_constraint('ck_alerts_status', 'alerts', type_='check')
    op.execute("UPDATE alerts SET status = CASE status WHEN 'unread' THEN 'open' "
               "WHEN 'read' THEN 'acknowledged' ELSE 'resolved' END")
    op.alter_column('alerts', 'status', server_default='open')
    op.alter_column('alerts', 'severity', server_default='info')
    op.create_check_constraint('ck_alerts_status', 'alerts', "status IN ('open', 'acknowledged', 'resolved')")
    op.create_check_constraint('ck_alerts_severity', 'alerts', "severity IN ('info', 'warning', 'critical')")

    op.drop_table('alert_settings')
    op.drop_index('ix_equipment_home', table_name='equipment')
    op.drop_table('equipment')
