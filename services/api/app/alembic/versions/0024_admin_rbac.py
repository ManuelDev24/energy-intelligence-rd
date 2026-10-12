"""ERD-ADM-RBAC: administrative roles, scopes, assignments and immutable audit trail.

Deny-by-default admin layer, fully separate from household (home_members) permissions.
Seeds the minimum fixed roles/scopes required by the spec as data, not as application
constants, so the DB stays the single source of truth for what a role can do.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "0024"
down_revision = "0023"
branch_labels = None
depends_on = None

ROLES = ["super_admin", "operations_admin", "ocr_reviewer", "support_readonly", "auditor"]

SCOPES = [
    "admin.roles.read", "admin.roles.manage", "admin.ocr.read", "admin.ocr.retry",
    "admin.ocr.review", "admin.audit.read", "admin.users.read", "admin.system.read",
]

ROLE_SCOPES = {
    "super_admin": SCOPES,
    "operations_admin": ["admin.ocr.read", "admin.ocr.retry", "admin.ocr.review",
                          "admin.users.read", "admin.system.read"],
    "ocr_reviewer": ["admin.ocr.read", "admin.ocr.review"],
    "support_readonly": ["admin.users.read"],
    "auditor": ["admin.audit.read", "admin.roles.read"],
}


def upgrade():
    op.create_table(
        "admin_roles",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(32), nullable=False, unique=True),
        sa.Column("description", sa.String(256), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        "admin_scopes",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(64), nullable=False, unique=True),
        sa.Column("description", sa.String(256), nullable=False),
    )
    op.create_table(
        "admin_role_scopes",
        sa.Column("role_id", UUID(as_uuid=True), sa.ForeignKey("admin_roles.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("scope_id", UUID(as_uuid=True), sa.ForeignKey("admin_scopes.id", ondelete="CASCADE"), primary_key=True),
    )
    op.create_table(
        "admin_role_assignments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role_id", UUID(as_uuid=True), sa.ForeignKey("admin_roles.id", ondelete="RESTRICT"), nullable=False),
        # NULL = asignado por el bootstrap de arranque (no hay actor humano todavía).
        sa.Column("assigned_by_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("reason", sa.String(500), nullable=False),
        sa.Column("granted_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(timezone=True)),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column("revoked_by_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("revoke_reason", sa.String(500)),
        sa.CheckConstraint("length(trim(reason)) > 0", name="ck_admin_role_assignments_reason"),
        sa.CheckConstraint("(revoked_at IS NULL) = (revoke_reason IS NULL)", name="ck_admin_role_assignments_revoke_pair"),
        sa.CheckConstraint("(revoked_at IS NULL) = (revoked_by_user_id IS NULL)", name="ck_admin_role_assignments_revoked_by_pair"),
    )
    op.create_index("ix_admin_role_assignments_user", "admin_role_assignments", ["user_id"])
    op.create_index("ix_admin_role_assignments_role", "admin_role_assignments", ["role_id"])
    # Only one *active* (non-revoked) assignment of a given role per user: blocks duplicate grants.
    op.execute(
        "CREATE UNIQUE INDEX uq_admin_role_assignments_active ON admin_role_assignments (user_id, role_id) "
        "WHERE revoked_at IS NULL"
    )
    op.create_table(
        "admin_audit_events",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        # NULL only for the bootstrap command, which runs outside any authenticated session.
        # Stable pseudonymous actor ID; deliberately no user FK: ON DELETE SET NULL
        # would UPDATE an immutable audit row when an administrator erases their account.
        sa.Column("actor_user_id", UUID(as_uuid=True)),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("resource", sa.String(128), nullable=False),
        sa.Column("scope_used", sa.String(64)),
        sa.Column("reason", sa.String(500)),
        sa.Column("result", sa.String(16), nullable=False),
        sa.Column("request_id", sa.String(64)),
        sa.Column("metadata", JSONB()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("result IN ('success', 'denied', 'error')", name="ck_admin_audit_events_result"),
    )
    op.create_index("ix_admin_audit_events_created", "admin_audit_events", ["created_at"])
    op.create_index("ix_admin_audit_events_actor", "admin_audit_events", ["actor_user_id"])
    # Same immutability pattern as bill_snapshots (0011): no UPDATE/DELETE/TRUNCATE, ever, from any
    # API role. This table has no "admin API to edit audit" by design.
    op.execute("""CREATE FUNCTION prevent_admin_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
                  BEGIN
                    RAISE EXCEPTION 'Admin audit events are immutable' USING ERRCODE='23514';
                  END; $$""")
    op.execute("""CREATE TRIGGER admin_audit_events_no_update_delete BEFORE UPDATE OR DELETE ON admin_audit_events
                  FOR EACH ROW EXECUTE FUNCTION prevent_admin_audit_mutation()""")
    op.execute("""CREATE TRIGGER admin_audit_events_no_truncate BEFORE TRUNCATE ON admin_audit_events
                  FOR EACH STATEMENT EXECUTE FUNCTION prevent_admin_audit_mutation()""")

    roles_table = sa.table("admin_roles", sa.column("id"), sa.column("name"), sa.column("description"))
    scopes_table = sa.table("admin_scopes", sa.column("id"), sa.column("name"), sa.column("description"))
    role_scopes_table = sa.table("admin_role_scopes", sa.column("role_id"), sa.column("scope_id"))

    import uuid as _uuid
    role_ids = {name: _uuid.uuid4() for name in ROLES}
    scope_ids = {name: _uuid.uuid4() for name in SCOPES}
    op.bulk_insert(roles_table, [
        {"id": role_ids[name], "name": name, "description": f"Rol administrativo: {name}"} for name in ROLES
    ])
    op.bulk_insert(scopes_table, [
        {"id": scope_ids[name], "name": name, "description": f"Scope administrativo: {name}"} for name in SCOPES
    ])
    op.bulk_insert(role_scopes_table, [
        {"role_id": role_ids[role], "scope_id": scope_ids[scope]}
        for role, scopes in ROLE_SCOPES.items() for scope in scopes
    ])


def downgrade():
    op.execute("DROP TRIGGER admin_audit_events_no_truncate ON admin_audit_events")
    op.execute("DROP TRIGGER admin_audit_events_no_update_delete ON admin_audit_events")
    op.execute("DROP FUNCTION prevent_admin_audit_mutation()")
    op.drop_table("admin_audit_events")
    op.drop_index("uq_admin_role_assignments_active", table_name="admin_role_assignments")
    op.drop_index("ix_admin_role_assignments_role", table_name="admin_role_assignments")
    op.drop_index("ix_admin_role_assignments_user", table_name="admin_role_assignments")
    op.drop_table("admin_role_assignments")
    op.drop_table("admin_role_scopes")
    op.drop_table("admin_scopes")
    op.drop_table("admin_roles")
