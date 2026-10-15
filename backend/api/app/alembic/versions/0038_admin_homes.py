"""ERD-ADM-HOMES-WEB: consulta administrativa de viviendas, sin abrir la RLS ni exponer datos de identificación.

Igual que 0033/0034: funciones `SECURITY DEFINER` con `search_path` fijo que devuelven SOLO lo mínimo para operar y dar soporte:
identificador, código, distribuidora, provincia, fechas y CONTEOS. Nunca el nombre de la vivienda, la dirección, ciudad, sector,
ni correos/identidades de sus miembros. Aceptan como máximo 100 filas por página. Solo `erd_app` y `erd_worker` pueden ejecutarlas.

Añade el scope `admin.homes.read` (data, no constante de código) a super_admin, operations_admin y support_readonly.
"""
from alembic import op

revision = "0038"
down_revision = "0037"
branch_labels = None
depends_on = None

APP, WORKER = "erd_app", "erd_worker"
SCOPE = "admin.homes.read"
ROLES = ("super_admin", "operations_admin", "support_readonly")

# Conteos compartidos por la lista y la ficha (una sola definición para que no se desfasen).
COUNTS = """
  (SELECT count(*) FROM home_members m WHERE m.home_id = h.id) AS members,
  (SELECT count(*) FROM bills b WHERE b.home_id = h.id) AS bills,
  (SELECT max(b.period_end) FROM bills b WHERE b.home_id = h.id) AS last_bill_end,
  (SELECT count(*) FROM claims c WHERE c.home_id = h.id AND c.status IN ('open', 'in_review')) AS open_claims,
  (SELECT count(*) FROM alerts a WHERE a.home_id = h.id AND a.status = 'unread') AS unread_alerts
"""


def upgrade():
    op.execute(f"""
        INSERT INTO admin_scopes (id, name, description)
        VALUES (gen_random_uuid(), '{SCOPE}', 'Scope administrativo: {SCOPE}')
    """)
    roles = ", ".join(f"'{r}'" for r in ROLES)
    op.execute(f"""
        INSERT INTO admin_role_scopes (role_id, scope_id)
        SELECT r.id, s.id FROM admin_roles r, admin_scopes s WHERE r.name IN ({roles}) AND s.name = '{SCOPE}'
    """)
    op.execute(f"""
        CREATE FUNCTION admin_homes_page(p_q text, p_distributor text, p_limit integer, p_offset integer) RETURNS jsonb
        LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
          WITH f AS (
            SELECT h.id FROM homes h
            WHERE (p_distributor IS NULL OR h.distributor = p_distributor)
              AND (p_q IS NULL OR h.id::text = lower(p_q)
                   OR lower(h.code) LIKE lower(replace(replace(replace(p_q, '\\', '\\\\'), '%', '\\%'), '_', '\\_')) || '%')
          ), page AS (
            SELECT h.id, h.code, h.distributor, h.province, h.created_at, {COUNTS}
            FROM homes h JOIN f ON f.id = h.id
            ORDER BY h.created_at DESC, h.id
            LIMIT least(greatest(p_limit, 1), 100) OFFSET greatest(p_offset, 0)
          )
          SELECT jsonb_build_object(
            'total', (SELECT count(*) FROM f),
            'items', coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY page.created_at DESC, page.id) FROM page), '[]'::jsonb))
        $$
    """)
    op.execute(f"""
        CREATE FUNCTION admin_home_detail(p_id uuid) RETURNS jsonb
        LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
          SELECT to_jsonb(d) FROM (
            SELECT h.id, h.code, h.distributor, h.province, h.user_type, h.occupants,
                   h.has_ac, h.has_water_heater, h.has_pool, h.has_solar, h.has_inverter, h.created_at,
                   {COUNTS},
                   (SELECT count(*) FROM home_members m WHERE m.home_id = h.id AND m.role = 'owner') AS owners,
                   (SELECT count(*) FROM home_invitations i WHERE i.home_id = h.id AND i.accepted_at IS NULL
                      AND i.revoked_at IS NULL AND i.expires_at > now()) AS pending_invitations,
                   (SELECT min(b.period_start) FROM bills b WHERE b.home_id = h.id) AS first_bill_start,
                   (SELECT count(*) FROM meter_readings r WHERE r.home_id = h.id) AS readings,
                   (SELECT count(*) FROM equipment e WHERE e.home_id = h.id) AS equipment,
                   (SELECT count(*) FROM documents x WHERE x.home_id = h.id) AS documents,
                   (SELECT count(*) FROM claims c WHERE c.home_id = h.id) AS claims_total,
                   (SELECT count(*) FROM power_outages o WHERE o.home_id = h.id) AS outages
            FROM homes h WHERE h.id = p_id
          ) d
        $$
    """)
    for fn in ("admin_homes_page(text, text, integer, integer)", "admin_home_detail(uuid)"):
        op.execute(f"REVOKE ALL ON FUNCTION {fn} FROM PUBLIC")
        op.execute(f"GRANT EXECUTE ON FUNCTION {fn} TO {APP}, {WORKER}")


def downgrade():
    op.execute("DROP FUNCTION IF EXISTS admin_home_detail(uuid)")
    op.execute("DROP FUNCTION IF EXISTS admin_homes_page(text, text, integer, integer)")
    op.execute(f"DELETE FROM admin_role_scopes WHERE scope_id IN (SELECT id FROM admin_scopes WHERE name = '{SCOPE}')")
    op.execute(f"DELETE FROM admin_scopes WHERE name = '{SCOPE}'")
