"""Auditoría C-10: verificación de correo.

Hasta aquí cualquiera podía registrar un correo ajeno y la plataforma le enviaba avisos (squatting de cuentas y correo no solicitado).
- `users.email_verified_at`: NULL hasta que la persona abre el enlace enviado a ese correo. Las cuentas existentes quedan SIN verificar
  (ninguna prueba de propiedad existía): verán el aviso y podrán reenviar el enlace.
- `email_verification_tokens`: un solo uso, solo el SHA-256 del token (como la recuperación de contraseña), ligado al correo verificado.
Los avisos por correo se omiten para cuentas sin verificar.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0029"
down_revision = "0028"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True))
    op.create_table(
        "email_verification_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("email", sa.String(254), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_email_verification_tokens_user_id", "email_verification_tokens", ["user_id"])
    op.create_index("ix_email_verification_tokens_expires_at", "email_verification_tokens", ["expires_at"])
    # Mismos permisos que el resto (los privilegios por defecto de 0025 ya cubren la tabla nueva; se repite por claridad).
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON email_verification_tokens TO erd_app, erd_worker")


def downgrade():
    op.drop_table("email_verification_tokens")
    op.drop_column("users", "email_verified_at")
