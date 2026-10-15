"""ERD-AI-ADMIN-WEB: supervisión del Copilot sin abrir la RLS ni exponer conversaciones.

`copilot_messages` está bajo RLS por vivienda y persona; esta función `SECURITY DEFINER` (search_path fijo, patrón 0033/0034/0038/0039) devuelve SOLO
agregados: mensajes por estado, tokens, latencia (p50/p95), modelos, herramientas invocadas (nombres), valoraciones y uso diario/por persona.
Nunca el texto de una conversación, ni títulos, ni fuentes, ni la vivienda. Las personas se identifican solo por su identificador (seudónimo).

Añade el scope `admin.ai.read` a super_admin y operations_admin.
"""
from alembic import op

revision = "0040"
down_revision = "0039"
branch_labels = None
depends_on = None

APP, WORKER = "erd_app", "erd_worker"
SCOPE = "admin.ai.read"
ROLES = ("super_admin", "operations_admin")


def upgrade():
    op.execute(f"INSERT INTO admin_scopes (id, name, description) VALUES (gen_random_uuid(), '{SCOPE}', 'Scope administrativo: {SCOPE}')")
    roles = ", ".join(f"'{r}'" for r in ROLES)
    op.execute(f"""
        INSERT INTO admin_role_scopes (role_id, scope_id)
        SELECT r.id, s.id FROM admin_roles r, admin_scopes s WHERE r.name IN ({roles}) AND s.name = '{SCOPE}'
    """)
    op.execute("""
        CREATE FUNCTION admin_copilot_stats(p_days integer) RETURNS jsonb
        LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
          WITH w AS (SELECT least(greatest(p_days, 1), 90) AS days,
                            (now() AT TIME ZONE 'America/Santo_Domingo')::date AS today),
          m AS (SELECT * FROM copilot_messages, w
                WHERE role = 'assistant' AND created_at >= now() - make_interval(days => w.days)),
          u AS (SELECT cu.* FROM copilot_usage cu, w WHERE cu.day > w.today - w.days)
          SELECT jsonb_build_object(
            'days', (SELECT days FROM w),
            'assistant_messages', (SELECT count(*) FROM m),
            'by_status', coalesce((SELECT jsonb_object_agg(status, n) FROM (SELECT status, count(*) AS n FROM m GROUP BY status) s), '{}'::jsonb),
            'input_tokens', (SELECT coalesce(sum(input_tokens), 0) FROM m),
            'output_tokens', (SELECT coalesce(sum(output_tokens), 0) FROM m),
            'latency_p50_ms', (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms))::int FROM m WHERE status = 'complete' AND latency_ms IS NOT NULL),
            'latency_p95_ms', (SELECT round(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms))::int FROM m WHERE status = 'complete' AND latency_ms IS NOT NULL),
            'feedback_up', (SELECT count(*) FROM m WHERE feedback = 1),
            'feedback_down', (SELECT count(*) FROM m WHERE feedback = -1),
            'conversations', (SELECT count(*) FROM copilot_conversations c, w WHERE c.created_at >= now() - make_interval(days => w.days)),
            'by_model', coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.messages DESC, s.model) FROM (
                SELECT coalesce(model, 'desconocido') AS model, count(*) AS messages, sum(input_tokens) AS input_tokens, sum(output_tokens) AS output_tokens
                FROM m GROUP BY 1) s), '[]'::jsonb),
            'tools', coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.count DESC, s.name) FROM (
                SELECT t AS name, count(*) AS count FROM m, jsonb_array_elements_text(coalesce(m.tools, '[]'::jsonb)) AS t GROUP BY t LIMIT 30) s), '[]'::jsonb),
            'by_day', coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.day) FROM (
                SELECT day::text AS day, sum(messages) AS messages, sum(tokens) AS tokens, count(*) AS people FROM u GROUP BY day) s), '[]'::jsonb),
            'top_people', coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.tokens DESC, s.subject) FROM (
                SELECT subject, sum(messages) AS messages, sum(tokens) AS tokens, count(*) AS days_active FROM u GROUP BY subject
                ORDER BY sum(tokens) DESC, subject LIMIT 20) s), '[]'::jsonb)
          )
        $$
    """)
    op.execute("REVOKE ALL ON FUNCTION admin_copilot_stats(integer) FROM PUBLIC")
    op.execute(f"GRANT EXECUTE ON FUNCTION admin_copilot_stats(integer) TO {APP}, {WORKER}")


def downgrade():
    op.execute("DROP FUNCTION IF EXISTS admin_copilot_stats(integer)")
    op.execute(f"DELETE FROM admin_role_scopes WHERE scope_id IN (SELECT id FROM admin_scopes WHERE name = '{SCOPE}')")
    op.execute(f"DELETE FROM admin_scopes WHERE name = '{SCOPE}'")
