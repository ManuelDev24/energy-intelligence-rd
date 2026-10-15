"""ERD-ADM-BILLS-WEB: calidad de los datos de facturas y línea de tiempo de una vivienda, sin abrir la RLS.

Dos funciones `SECURITY DEFINER` con `search_path` fijo (patrón de 0033/0034/0038):
- `admin_bills_summary(days)`: SOLO conteos agregados de todas las viviendas (completitud: con original, con lecturas, con fecha límite, pagadas…).
- `admin_home_bills(home, limit, offset)`: las facturas de UNA vivienda indicada por su identificador exacto (no hay listado global de importes):
  periodo, kWh, monto, origen y banderas de completitud. Nunca el nombre/dirección de la vivienda, quién la posee, ni el contenido de los documentos.

Añade el scope `admin.bills.read` a super_admin, operations_admin y support_readonly.
"""
from alembic import op

revision = "0039"
down_revision = "0038"
branch_labels = None
depends_on = None

APP, WORKER = "erd_app", "erd_worker"
SCOPE = "admin.bills.read"
ROLES = ("super_admin", "operations_admin", "support_readonly")


def upgrade():
    op.execute(f"""
        INSERT INTO admin_scopes (id, name, description) VALUES (gen_random_uuid(), '{SCOPE}', 'Scope administrativo: {SCOPE}')
    """)
    roles = ", ".join(f"'{r}'" for r in ROLES)
    op.execute(f"""
        INSERT INTO admin_role_scopes (role_id, scope_id)
        SELECT r.id, s.id FROM admin_roles r, admin_scopes s WHERE r.name IN ({roles}) AND s.name = '{SCOPE}'
    """)
    op.execute("""
        CREATE FUNCTION admin_bills_summary(p_days integer) RETURNS jsonb
        LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
          SELECT jsonb_build_object(
            'total', (SELECT count(*) FROM bills),
            'recent', (SELECT count(*) FROM bills WHERE created_at >= now() - make_interval(days => least(greatest(p_days, 1), 365))),
            'homes_with_bills', (SELECT count(DISTINCT home_id) FROM bills),
            'manual', (SELECT count(*) FROM bills WHERE source = 'manual'),
            'seed', (SELECT count(*) FROM bills WHERE source = 'seed'),
            'with_document', (SELECT count(*) FROM bills b WHERE EXISTS (SELECT 1 FROM documents d WHERE d.bill_id = b.id)),
            'with_readings', (SELECT count(*) FROM bills WHERE reading_previous IS NOT NULL AND reading_current IS NOT NULL),
            'with_due_date', (SELECT count(*) FROM bills WHERE due_date IS NOT NULL),
            'paid', (SELECT count(*) FROM bills WHERE paid_at IS NOT NULL),
            'zero_kwh', (SELECT count(*) FROM bills WHERE kwh = 0),
            'zero_amount', (SELECT count(*) FROM bills WHERE amount_dop = 0),
            'ocr_pending', (SELECT count(*) FROM document_ocr WHERE status IN ('pending', 'processing')),
            'ocr_failed', (SELECT count(*) FROM document_ocr WHERE status = 'failed'),
            'ocr_done', (SELECT count(*) FROM document_ocr WHERE status = 'done'),
            'days', least(greatest(p_days, 1), 365)
          )
        $$
    """)
    op.execute("""
        CREATE FUNCTION admin_home_bills(p_home uuid, p_limit integer, p_offset integer) RETURNS jsonb
        LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
          SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM homes WHERE id = p_home) THEN NULL ELSE jsonb_build_object(
            'total', (SELECT count(*) FROM bills WHERE home_id = p_home),
            'items', coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.period_end DESC, r.id) FROM (
                SELECT b.id, b.period_start, b.period_end, b.days, b.kwh::text AS kwh, b.amount_dop::text AS amount_dop, b.source, b.due_date,
                       (b.paid_at IS NOT NULL) AS paid, (b.reading_previous IS NOT NULL AND b.reading_current IS NOT NULL) AS has_readings,
                       EXISTS (SELECT 1 FROM documents d WHERE d.bill_id = b.id) AS has_document,
                       (SELECT o.status FROM documents d JOIN document_ocr o ON o.document_id = d.id WHERE d.bill_id = b.id
                          ORDER BY d.created_at DESC LIMIT 1) AS ocr_status,
                       b.created_at
                FROM bills b WHERE b.home_id = p_home
                ORDER BY b.period_end DESC, b.id
                LIMIT least(greatest(p_limit, 1), 100) OFFSET greatest(p_offset, 0)) r), '[]'::jsonb)) END
        $$
    """)
    for fn in ("admin_bills_summary(integer)", "admin_home_bills(uuid, integer, integer)"):
        op.execute(f"REVOKE ALL ON FUNCTION {fn} FROM PUBLIC")
        op.execute(f"GRANT EXECUTE ON FUNCTION {fn} TO {APP}, {WORKER}")


def downgrade():
    op.execute("DROP FUNCTION IF EXISTS admin_home_bills(uuid, integer, integer)")
    op.execute("DROP FUNCTION IF EXISTS admin_bills_summary(integer)")
    op.execute(f"DELETE FROM admin_role_scopes WHERE scope_id IN (SELECT id FROM admin_scopes WHERE name = '{SCOPE}')")
    op.execute(f"DELETE FROM admin_scopes WHERE name = '{SCOPE}'")
