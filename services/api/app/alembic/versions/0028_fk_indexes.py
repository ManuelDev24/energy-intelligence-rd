"""Auditoría C-24 (DB-08): índices de soporte para 8 claves foráneas.

Sin ellos, borrar una factura, una anomalía, un equipo o una persona obliga a recorrer enteras estas tablas para aplicar
`ON DELETE CASCADE/SET NULL`. Migración puramente aditiva (expand): su `downgrade` solo quita índices, no datos.
"""
from alembic import op

revision = "0028"
down_revision = "0027"
branch_labels = None
depends_on = None

INDEXES = [
    ("alerts", "bill_id"), ("alerts", "basis_bill_id"), ("alerts", "anomaly_id"), ("anomalies", "bill_id"),
    ("documents", "uploaded_by"), ("home_invitations", "accepted_by"),
    ("recommendations", "equipment_id"), ("recommendations", "anomaly_id"),
]


def upgrade():
    for table, column in INDEXES:
        op.create_index(f"ix_{table}_{column}", table, [column])


def downgrade():
    for table, column in INDEXES:
        op.drop_index(f"ix_{table}_{column}", table_name=table)
