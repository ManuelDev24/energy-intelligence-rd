"""Auditoría C-16: el correo de `users` es único sin distinguir mayúsculas, garantizado por la base.

El servicio normaliza a minúsculas (`schemas/auth.py`), pero el `UNIQUE (email)` distinguía mayúsculas: cualquier ruta que escribiera
sin normalizar (un script de soporte, una importación) podía crear `Ana@x.com` junto a `ana@x.com` (cuentas duplicadas, bloqueos
o suplantación por homónimo). Ahora la base exige `email = lower(email)` y tiene un índice único sobre `lower(email)`.

Los correos existentes se pasan a minúsculas. Si dos cuentas solo difieren en mayúsculas la migración se detiene SIN modificar
nada: resolverlo es una decisión humana (cuál conserva el acceso) y no se borra ni fusiona ninguna cuenta.
Downgrade quita ambas restricciones (no devuelve las mayúsculas originales).
"""
from alembic import op
import sqlalchemy as sa

revision = "0026"
down_revision = "0025"
branch_labels = None
depends_on = None


def upgrade():
    duplicate = op.get_bind().execute(
        sa.text("SELECT lower(email) FROM users GROUP BY lower(email) HAVING count(*) > 1 LIMIT 1")).first()
    if duplicate:
        raise RuntimeError("Hay cuentas cuyo correo solo difiere en mayúsculas; resuélvelo a mano antes de migrar (no se modificó nada)")
    op.execute("UPDATE users SET email = lower(email) WHERE email <> lower(email)")
    op.create_check_constraint("ck_users_email_lowercase", "users", "email = lower(email)")
    op.execute("CREATE UNIQUE INDEX uq_users_email_lower ON users (lower(email))")


def downgrade():
    op.execute("DROP INDEX IF EXISTS uq_users_email_lower")
    op.drop_constraint("ck_users_email_lowercase", "users", type_="check")
