"""Auditoría C-15 (DB-04): la auditoría dice QUIÉN actuó y deja de copiar datos personales.

- `audit_events.actor_user_id` (FK a users, ON DELETE SET NULL): hasta ahora `actor` era siempre la etiqueta 'pilot' y no se sabía quién cambió un dato.
- Las filas existentes pierden los valores de los campos personales (`account_number`, dirección…): el `before/after` guardaba la fila completa.
  Solo se reemplaza el valor por «[redacted]»; la fila, la entidad y el resto de campos se conservan.
- Índice por fecha para la purga de retención (`maintenance.retention`).
Downgrade quita la columna y los índices; los valores redactados NO se restauran (no hay de dónde).
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0028"
down_revision = "0027"
branch_labels = None
depends_on = None

# Debe coincidir con app.services.audit.SENSITIVE_FIELDS.
SENSITIVE_FIELDS = ("account_number", "address", "city", "sector", "province", "municipality")


def upgrade():
    op.add_column("audit_events", sa.Column("actor_user_id", postgresql.UUID(as_uuid=True),
                                            sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True))
    op.create_index("ix_audit_actor_user", "audit_events", ["actor_user_id"], postgresql_where=sa.text("actor_user_id IS NOT NULL"))
    op.create_index("ix_audit_created", "audit_events", ["created_at"])
    for column in ("before", "after"):
        for field in SENSITIVE_FIELDS:
            op.execute(f"UPDATE audit_events SET {column} = jsonb_set({column}, ARRAY['{field}'], '\"[redacted]\"'::jsonb) "
                       f"WHERE {column} IS NOT NULL AND jsonb_typeof({column}) = 'object' AND jsonb_exists({column}, '{field}') "
                       f"AND jsonb_typeof({column} -> '{field}') = 'string'")


def downgrade():
    op.drop_index("ix_audit_created", table_name="audit_events")
    op.drop_index("ix_audit_actor_user", table_name="audit_events")
    op.drop_column("audit_events", "actor_user_id")
