"""Auditoría C-24 (DB-08): índices de soporte para 11 claves foráneas (8 del esquema original + 3 del RBAC administrativo).

Sin ellos, borrar una factura, una anomalía, un equipo o una persona obliga a recorrer enteras estas tablas para aplicar
`ON DELETE CASCADE/SET NULL`. Migración puramente aditiva (expand): su `downgrade` solo quita índices, no datos.
"""
from alembic import op

revision = "0030"
down_revision = "0029"
branch_labels = None
depends_on = None

INDEXES = [
    ("alerts", "bill_id"), ("alerts", "basis_bill_id"), ("alerts", "anomaly_id"), ("anomalies", "bill_id"),
    ("documents", "uploaded_by"), ("home_invitations", "accepted_by"),
    ("recommendations", "equipment_id"), ("recommendations", "anomaly_id"),
    # Tablas del RBAC administrativo (migración 0024): borrar una persona/rol/scope las recorre para aplicar CASCADE/SET NULL.
    ("admin_role_scopes", "scope_id"), ("admin_role_assignments", "assigned_by_user_id"), ("admin_role_assignments", "revoked_by_user_id"),
]


def upgrade():
    for table, column in INDEXES:
        op.create_index(f"ix_{table}_{column}", table, [column])


def downgrade():
    for table, column in INDEXES:
        op.drop_index(f"ix_{table}_{column}", table_name=table)
