"""ERD-ADM-USERS-WRITE: scoped request queue and sensitive user operations.

Requests are durable metadata only; creating one never exports or deletes an account. The
retention period for the pseudonymous identifiers must be approved before deployment.
"""
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0043"
down_revision = "0042"
branch_labels = None
depends_on = None

SCOPES = {
    "admin.users.requests.read": "Consultar solicitudes de exportación o borrado",
    "admin.users.requests.manage": "Registrar y tramitar solicitudes de datos",
    "admin.users.sessions.close": "Cerrar sesiones de una cuenta",
    "admin.users.deactivate": "Desactivar cuentas y revocar sus sesiones",
}


def upgrade():
    op.create_table(
        "admin_user_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        # Pseudonymous identifiers deliberately have no FK: a later account erasure must not
        # delete the operational request history via ON DELETE CASCADE.
        sa.Column("target_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("updated_by_user_id", postgresql.UUID(as_uuid=True)),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("reason", sa.String(500), nullable=False),
        sa.Column("resolution_reason", sa.String(500)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("resolved_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("kind IN ('export', 'deletion')", name="ck_admin_user_requests_kind"),
        sa.CheckConstraint("status IN ('pending', 'in_progress', 'completed', 'rejected')",
                           name="ck_admin_user_requests_status"),
        sa.CheckConstraint("length(trim(reason)) > 0", name="ck_admin_user_requests_reason"),
        sa.CheckConstraint("((status IN ('completed', 'rejected')) = (resolved_at IS NOT NULL))",
                           name="ck_admin_user_requests_resolved_at"),
        sa.CheckConstraint("((status IN ('completed', 'rejected')) = (resolution_reason IS NOT NULL))",
                           name="ck_admin_user_requests_resolution_reason"),
    )
    op.create_index("ix_admin_user_requests_created", "admin_user_requests", ["created_at"])
    op.create_index("ix_admin_user_requests_target", "admin_user_requests", ["target_user_id", "created_at"])
    op.create_index("uq_admin_user_requests_open", "admin_user_requests", ["target_user_id", "kind"], unique=True,
                    postgresql_where=sa.text("status IN ('pending', 'in_progress')"))
    op.execute("REVOKE ALL ON admin_user_requests FROM PUBLIC")
    op.execute("GRANT SELECT, INSERT, UPDATE ON admin_user_requests TO erd_app")

    scopes_table = sa.table("admin_scopes", sa.column("id"), sa.column("name"), sa.column("description"))
    role_scopes_table = sa.table("admin_role_scopes", sa.column("role_id"), sa.column("scope_id"))
    scope_ids = {name: uuid.uuid4() for name in SCOPES}
    op.bulk_insert(scopes_table, [
        {"id": scope_ids[name], "name": name, "description": description}
        for name, description in SCOPES.items()
    ])
    super_admin_id = op.get_bind().execute(
        sa.text("SELECT id FROM admin_roles WHERE name = 'super_admin'")
    ).scalar_one()
    op.bulk_insert(role_scopes_table, [
        {"role_id": super_admin_id, "scope_id": scope_ids[name]} for name in SCOPES
    ])


def downgrade():
    # Preserve request history: rollback is refused after the new feature has written records.
    has_requests = op.get_bind().execute(
        sa.text("SELECT EXISTS (SELECT 1 FROM admin_user_requests)")
    ).scalar_one()
    if has_requests:
        raise RuntimeError("0038 cannot be downgraded while admin user requests exist")
    connection = op.get_bind()
    connection.execute(
        sa.text("DELETE FROM admin_role_scopes WHERE scope_id IN "
                "(SELECT id FROM admin_scopes WHERE name = ANY(:names))"),
        {"names": list(SCOPES)},
    )
    connection.execute(sa.text("DELETE FROM admin_scopes WHERE name = ANY(:names)"), {"names": list(SCOPES)})
    op.drop_table("admin_user_requests")
