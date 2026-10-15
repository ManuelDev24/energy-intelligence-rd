"""ERD-ADM-DASH-WEB: agregados para el resumen administrativo, sin abrir la RLS.

El API conecta como `erd_app` (sujeto a la RLS por vivienda), así que no puede contar viviendas, facturas, alertas ni apagones de TODOS los
hogares. En lugar de añadir una política amplia sobre esas tablas, esta función `SECURITY DEFINER` (se ejecuta con los privilegios del dueño
de la migración, que no está sujeto a la RLS) devuelve SOLO números: conteos y series diarias. Nunca filas, identificadores ni texto de un hogar.
`search_path` fijo para que no se pueda suplantar ninguna tabla; solo `erd_app` y `erd_worker` pueden ejecutarla.
"""
from alembic import op

revision = "0033"
down_revision = "0032"
branch_labels = None
depends_on = None

APP, WORKER = "erd_app", "erd_worker"


def upgrade():
    op.execute("""
        CREATE FUNCTION admin_overview_counts(days integer) RETURNS jsonb
        LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
          SELECT jsonb_build_object(
            'homes_total', (SELECT count(*) FROM homes),
            'bills_total', (SELECT count(*) FROM bills),
            'bills_recent', (SELECT count(*) FROM bills WHERE created_at >= now() - make_interval(days => days)),
            'alerts_unread', (SELECT count(*) FROM alerts WHERE status = 'unread'),
            'outages_recent', (SELECT count(*) FROM power_outages WHERE created_at >= now() - make_interval(days => days)),
            'bills_by_day', coalesce((SELECT jsonb_object_agg(d::text, n) FROM (
                SELECT date_trunc('day', created_at AT TIME ZONE 'America/Santo_Domingo')::date AS d, count(*) AS n
                FROM bills WHERE created_at >= now() - make_interval(days => days) GROUP BY 1) s), '{}'::jsonb)
          )
        $$
    """)
    op.execute("REVOKE ALL ON FUNCTION admin_overview_counts(integer) FROM PUBLIC")
    op.execute(f"GRANT EXECUTE ON FUNCTION admin_overview_counts(integer) TO {APP}, {WORKER}")


def downgrade():
    op.execute("DROP FUNCTION IF EXISTS admin_overview_counts(integer)")
