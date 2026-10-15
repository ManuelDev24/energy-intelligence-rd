"""ERD-ONB-ACCEPTANCE: idempotencia de POST /homes.

Si la respuesta de «crear vivienda» se pierde (red móvil), el cliente no sabe si la vivienda existe. Con `Idempotency-Key` repite la misma
petición sin duplicarla: la clave es de la persona (no hay forma de adivinar la de otra), guarda una huella de la solicitud y la vivienda creada.
Misma clave + mismo contenido → la misma vivienda; misma clave + contenido distinto → 409. Sin RLS (como `copilot_usage`): siempre se consulta
por `user_id` y solo `erd_app`/`erd_worker` tienen permisos. Se borra con la vivienda o con la cuenta.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0035"
down_revision = "0034"
branch_labels = None
depends_on = None

APP, WORKER = "erd_app", "erd_worker"


def upgrade():
    op.create_table(
        "home_create_requests",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("key", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.Column("home_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("homes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_home_create_requests_home_id", "home_create_requests", ["home_id"])
    op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON home_create_requests TO {APP}, {WORKER}")


def downgrade():
    op.drop_table("home_create_requests")
