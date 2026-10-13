"""ERD-WORKER-01: cola de trabajos en segundo plano respaldada por PostgreSQL.

Una fila por trabajo: reintentos con espera creciente, concesión (lease) que vence si el proceso muere, clave de
idempotencia única por tipo y estado `dead` como cola de mensajes muertos. Downgrade elimina la tabla (se pierden los
trabajos pendientes; los programados se vuelven a encolar solos).
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "jobs",
        sa.Column("id", sa.BigInteger, sa.Identity(), primary_key=True),
        sa.Column("kind", sa.String(64), nullable=False),
        sa.Column("payload", postgresql.JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("idempotency_key", sa.String(128)),
        sa.Column("status", sa.String(12), nullable=False, server_default="queued"),
        sa.Column("attempts", sa.Integer, nullable=False, server_default="0"),
        sa.Column("max_attempts", sa.Integer, nullable=False, server_default="5"),
        sa.Column("run_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("locked_by", sa.String(96)),
        sa.Column("locked_until", sa.DateTime(timezone=True)),
        sa.Column("last_error", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("status IN ('queued', 'running', 'succeeded', 'dead')", name="ck_jobs_status"),
        sa.CheckConstraint("max_attempts BETWEEN 1 AND 20", name="ck_jobs_max_attempts"),
        sa.CheckConstraint("attempts >= 0 AND attempts <= max_attempts", name="ck_jobs_attempts"),
        sa.CheckConstraint("kind ~ '^[a-z][a-z0-9_.-]{0,63}$'", name="ck_jobs_kind"),
        sa.CheckConstraint("jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 8192", name="ck_jobs_payload"),
        sa.CheckConstraint("status <> 'running' OR (locked_by IS NOT NULL AND locked_until IS NOT NULL)", name="ck_jobs_running_lease"),
        sa.CheckConstraint("(status IN ('succeeded', 'dead')) = (finished_at IS NOT NULL)", name="ck_jobs_finished"),
    )
    op.create_index("uq_jobs_idempotency", "jobs", ["kind", "idempotency_key"], unique=True,
                    postgresql_where=sa.text("idempotency_key IS NOT NULL"))
    op.create_index("ix_jobs_due", "jobs", ["run_at", "id"], postgresql_where=sa.text("status = 'queued'"))
    op.create_index("ix_jobs_leases", "jobs", ["locked_until"], postgresql_where=sa.text("status = 'running'"))
    op.create_index("ix_jobs_finished", "jobs", ["status", "finished_at"], postgresql_where=sa.text("finished_at IS NOT NULL"))


def downgrade():
    op.drop_table("jobs")
