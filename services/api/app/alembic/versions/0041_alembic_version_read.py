"""ERD-ADM-SYSTEM-WEB: la API (rol de mínimo privilegio) puede LEER qué revisión de migraciones está aplicada.

`alembic_version` solo guarda el identificador de la revisión (p. ej. «0040»): no contiene datos de personas ni de viviendas. Sin este permiso, la consola
de sistema no podría decir si las migraciones están al día cuando la API corre como `erd_app` (producción/staging). Solo SELECT; nada de escritura.
"""
from alembic import op

revision = "0041"
down_revision = "0040"
branch_labels = None
depends_on = None

APP, WORKER = "erd_app", "erd_worker"


def upgrade():
    op.execute(f"GRANT SELECT ON alembic_version TO {APP}, {WORKER}")


def downgrade():
    op.execute(f"REVOKE SELECT ON alembic_version FROM {APP}, {WORKER}")
