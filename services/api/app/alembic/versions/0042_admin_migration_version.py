"""ERD-ADM-SYSTEM-WEB: la consola de sistema lee la revisión de migraciones por una función, no por un permiso directo.

0041 dio SELECT sobre `alembic_version` a `erd_app`/`erd_worker`, pero `tests/test_rls.py` fija a propósito lo contrario (mínimo privilegio: la API no puede
leer esa tabla). Esta migración restablece esa garantía (REVOKE) y expone SOLO el identificador de la revisión mediante `admin_migration_version()`
(SECURITY DEFINER, search_path fijo; mismo patrón que 0033/0034/0038–0040). Ninguna tabla nueva queda legible por la API.
"""
from alembic import op

revision = "0042"
down_revision = "0041"
branch_labels = None
depends_on = None

APP, WORKER = "erd_app", "erd_worker"


def upgrade():
    op.execute(f"REVOKE SELECT ON alembic_version FROM {APP}, {WORKER}")
    op.execute("""
        CREATE FUNCTION admin_migration_version() RETURNS text
        LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
          SELECT version_num FROM alembic_version LIMIT 1
        $$
    """)
    op.execute("REVOKE ALL ON FUNCTION admin_migration_version() FROM PUBLIC")
    op.execute(f"GRANT EXECUTE ON FUNCTION admin_migration_version() TO {APP}, {WORKER}")


def downgrade():
    op.execute("DROP FUNCTION IF EXISTS admin_migration_version()")
    op.execute(f"GRANT SELECT ON alembic_version TO {APP}, {WORKER}")
