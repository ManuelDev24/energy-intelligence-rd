"""ERD-SHARE-01: invitaciones a viviendas (un solo uso, solo hash SHA-256 del token).

Una invitación activa por (vivienda, correo). Se borran con la vivienda; si el invitador borra su cuenta se pierde el
vínculo (SET NULL) pero la invitación sigue válida. Downgrade elimina la tabla: invalida las invitaciones pendientes,
sin tocar viviendas ni miembros ya aceptados.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "home_invitations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("home_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("homes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("invited_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("email", sa.String(254), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True)),
        sa.Column("accepted_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("accepted_at IS NULL OR revoked_at IS NULL", name="ck_home_invitations_final_state"),
    )
    op.create_index("ix_home_invitations_home_id", "home_invitations", ["home_id"])
    op.create_index("ix_home_invitations_invited_by", "home_invitations", ["invited_by", "created_at"])
    op.create_index("uq_home_invitations_active", "home_invitations", ["home_id", "email"], unique=True,
                    postgresql_where=sa.text("accepted_at IS NULL AND revoked_at IS NULL"))


def downgrade():
    op.drop_index("uq_home_invitations_active", table_name="home_invitations")
    op.drop_index("ix_home_invitations_invited_by", table_name="home_invitations")
    op.drop_index("ix_home_invitations_home_id", table_name="home_invitations")
    op.drop_table("home_invitations")
