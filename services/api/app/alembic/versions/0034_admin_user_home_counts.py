"""ERD-ADM-USERS-WEB: cuántas viviendas tiene cada persona, sin abrir la RLS de `home_members`.

Igual que `admin_overview_counts` (0033): función SECURITY DEFINER con `search_path` fijo que devuelve SOLO números ({id de la persona: cantidad}),
nunca qué viviendas son ni cómo se llaman. Acepta como máximo 200 ids por llamada.
"""
from alembic import op

revision = "0034"
down_revision = "0033"
branch_labels = None
depends_on = None

APP, WORKER = "erd_app", "erd_worker"


def upgrade():
    op.execute("""
        CREATE FUNCTION admin_user_home_counts(ids uuid[]) RETURNS jsonb
        LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
          SELECT coalesce(jsonb_object_agg(user_id::text, n), '{}'::jsonb)
          FROM (SELECT user_id, count(*) AS n FROM home_members
                WHERE user_id = ANY(ids[1:200]) GROUP BY user_id) s
        $$
    """)
    op.execute("REVOKE ALL ON FUNCTION admin_user_home_counts(uuid[]) FROM PUBLIC")
    op.execute(f"GRANT EXECUTE ON FUNCTION admin_user_home_counts(uuid[]) TO {APP}, {WORKER}")


def downgrade():
    op.execute("DROP FUNCTION IF EXISTS admin_user_home_counts(uuid[])")
