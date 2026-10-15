"""OCR cancellation and retry generation fence; reversible without deleting jobs or drafts."""
from alembic import op
import sqlalchemy as sa

revision = '0025'
down_revision = '0024'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('jobs', sa.Column('generation', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('document_ocr', sa.Column('generation', sa.Integer(), nullable=False, server_default='0'))
    op.drop_constraint('ck_document_ocr_status', 'document_ocr', type_='check')
    op.create_check_constraint('ck_document_ocr_status', 'document_ocr',
                               "status IN ('pending', 'processing', 'done', 'failed', 'cancelled')")
    op.drop_constraint('ck_jobs_status', 'jobs', type_='check')
    op.create_check_constraint('ck_jobs_status', 'jobs', "status IN ('queued', 'running', 'succeeded', 'dead', 'cancelled')")
    op.drop_constraint('ck_jobs_finished', 'jobs', type_='check')
    op.create_check_constraint('ck_jobs_finished', 'jobs',
                               "(status IN ('succeeded', 'dead', 'cancelled')) = (finished_at IS NOT NULL)")


def downgrade():
    # Preserve job history; map cancellation to terminal dead and OCR cancellation to failed.
    op.execute("UPDATE jobs SET status='dead' WHERE status='cancelled'")
    op.execute("UPDATE document_ocr SET status='failed', error_code='engine_error' WHERE status='cancelled'")
    op.drop_constraint('ck_jobs_finished', 'jobs', type_='check')
    op.create_check_constraint('ck_jobs_finished', 'jobs', "(status IN ('succeeded', 'dead')) = (finished_at IS NOT NULL)")
    op.drop_constraint('ck_jobs_status', 'jobs', type_='check')
    op.create_check_constraint('ck_jobs_status', 'jobs', "status IN ('queued', 'running', 'succeeded', 'dead')")
    op.drop_constraint('ck_document_ocr_status', 'document_ocr', type_='check')
    op.create_check_constraint('ck_document_ocr_status', 'document_ocr', "status IN ('pending', 'processing', 'done', 'failed')")
    op.drop_column('document_ocr', 'generation')
    op.drop_column('jobs', 'generation')
