"""ERD-PROF-01: preferencias de notificación por usuario (alertas por correo y por push).

Una fila por usuario, creada al guardar; sin fila rigen los valores por defecto (activados). Downgrade elimina la
tabla: las preferencias guardadas vuelven al valor por defecto.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "notification_preferences",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("alerts_email", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("alerts_push", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table("notification_preferences")
