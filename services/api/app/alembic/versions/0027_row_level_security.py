"""Auditoría C-01: aislamiento por vivienda también en la base (RLS) y roles de mínimo privilegio.

Hasta aquí el aislamiento entre viviendas dependía solo de la capa de aplicación (`authorize_home` + filtrar por `home_id`) y de un único rol
que era dueño de todas las tablas. Un `home_id` olvidado en una consulta futura, o un fallo de autorización, exponía todas las viviendas.

Esta migración añade:
- Dos roles SIN inicio de sesión ni privilegios especiales (`erd_app` para el API, `erd_worker` para el worker y los scripts de operación).
  El operador les asigna LOGIN y contraseña fuera de las migraciones (ver docs/ops/DB_ROLES.md); las contraseñas nunca viven en el repositorio.
- Permisos de DML sobre las tablas (nada de DDL, TRUNCATE ni `alembic_version`) y privilegios por defecto para las tablas futuras.
- RLS activada en las tablas con datos por vivienda. `erd_app` solo ve/escribe filas de la vivienda del contexto de la petición
  (`app.home_id`, que el API fija tras comprobar la membresía) y las membresías/viviendas de su usuario (`app.user_id`). `erd_worker` ve todo
  (el worker procesa trabajos de todas las viviendas). Sin contexto no se ve ninguna fila (falla cerrado).
- Las tablas de identidad (users, sesiones, tokens…), tarifas y la cola interna no llevan RLS: el API debe leerlas antes de saber quién es
  la persona (login, refresh, recuperación), y las restringe el reparto de permisos.

No se usa FORCE ROW LEVEL SECURITY: el rol dueño (el de las migraciones) sigue pudiendo migrar y rellenar datos; la protección exige que
el API se conecte como `erd_app` (la configuración `DB_REQUIRE_RESTRICTED_ROLE` lo comprueba al arrancar). RLS no detiene una inyección SQL que
pueda ejecutar `set_config`: contiene errores de autorización de la aplicación, que es lo que esta capa añade.
Downgrade quita políticas y RLS; no borra los roles (pueden estar en uso por otras bases del mismo servidor).
"""
from alembic import op

revision = "0027"
down_revision = "0026"
branch_labels = None
depends_on = None

APP, WORKER = "erd_app", "erd_worker"
# Tablas con columna home_id: la fila pertenece a una vivienda.
HOME_TABLES = ["alert_settings", "alerts", "anomalies", "bills", "contracts", "documents", "equipment", "home_goals",
               "meter_readings", "power_outages", "recommendations"]
# Tablas hijas sin home_id propio: heredan la vivienda del padre (la subconsulta también pasa por la RLS del padre).
CHILD_TABLES = {"bill_items": ("bill_id", "bills"), "bill_snapshots": ("bill_id", "bills"), "document_ocr": ("document_id", "documents")}


def _create_roles():
    for role in (APP, WORKER):
        op.execute(f"""
            DO $$ BEGIN
              IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{role}') THEN
                CREATE ROLE {role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT;
              END IF;
            END $$;
        """)


def upgrade():
    _create_roles()
    # Contexto de la petición. `current_setting(..., true)` devuelve NULL si no está definido: sin contexto no coincide ninguna fila.
    op.execute("""CREATE FUNCTION app_user() RETURNS uuid LANGUAGE sql STABLE PARALLEL SAFE
                  AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$""")
    op.execute("""CREATE FUNCTION app_home() RETURNS uuid LANGUAGE sql STABLE PARALLEL SAFE
                  AS $$ SELECT nullif(current_setting('app.home_id', true), '')::uuid $$""")
    op.execute(f"GRANT EXECUTE ON FUNCTION app_user(), app_home() TO {APP}, {WORKER}")

    op.execute(f"GRANT USAGE ON SCHEMA public TO {APP}, {WORKER}")
    op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {APP}, {WORKER}")
    op.execute(f"REVOKE ALL ON alembic_version FROM {APP}, {WORKER}")
    op.execute(f"GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO {APP}, {WORKER}")
    op.execute(f"ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO {APP}, {WORKER}")
    op.execute(f"ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO {APP}, {WORKER}")

    for table in HOME_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"CREATE POLICY tenant_isolation ON {table} TO {APP} USING (home_id = app_home()) WITH CHECK (home_id = app_home())")
        op.execute(f"CREATE POLICY worker_access ON {table} TO {WORKER} USING (true) WITH CHECK (true)")
    for table, (column, parent) in CHILD_TABLES.items():
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        exists = f"EXISTS (SELECT 1 FROM {parent} p WHERE p.id = {table}.{column})"
        op.execute(f"CREATE POLICY tenant_isolation ON {table} TO {APP} USING ({exists}) WITH CHECK ({exists})")
        op.execute(f"CREATE POLICY worker_access ON {table} TO {WORKER} USING (true) WITH CHECK (true)")

    # Membresías: cada persona ve las suyas y, dentro de una vivienda ya autorizada, las de las demás. Solo se puede INSERTAR la propia
    # (crear una vivienda o aceptar una invitación, siempre en el contexto de esa vivienda): sin esto cualquiera podría unirse a otra.
    op.execute("ALTER TABLE home_members ENABLE ROW LEVEL SECURITY")
    op.execute(f"CREATE POLICY members_select ON home_members FOR SELECT TO {APP} USING (user_id = app_user() OR home_id = app_home())")
    op.execute(f"CREATE POLICY members_insert ON home_members FOR INSERT TO {APP} WITH CHECK (user_id = app_user() AND home_id = app_home())")
    # USING incluye la fila propia: `authorize_home` la bloquea (SELECT … FOR UPDATE) ANTES de fijar la vivienda del contexto.
    op.execute(f"CREATE POLICY members_update ON home_members FOR UPDATE TO {APP} "
               f"USING (user_id = app_user() OR home_id = app_home()) WITH CHECK (home_id = app_home())")
    op.execute(f"CREATE POLICY members_delete ON home_members FOR DELETE TO {APP} USING (user_id = app_user() OR home_id = app_home())")
    op.execute(f"CREATE POLICY worker_access ON home_members TO {WORKER} USING (true) WITH CHECK (true)")

    # Viviendas: se ven las de la vivienda del contexto y las propias por membresía; cualquiera con sesión puede crear una
    # (la primera lectura del INSERT … RETURNING exige fijar antes `app.home_id`, ver services/homes.create_home).
    op.execute("ALTER TABLE homes ENABLE ROW LEVEL SECURITY")
    visible = "id = app_home() OR id IN (SELECT home_id FROM home_members WHERE user_id = app_user())"
    op.execute(f"CREATE POLICY homes_select ON homes FOR SELECT TO {APP} USING ({visible})")
    op.execute(f"CREATE POLICY homes_update ON homes FOR UPDATE TO {APP} USING ({visible}) WITH CHECK ({visible})")
    op.execute(f"CREATE POLICY homes_delete ON homes FOR DELETE TO {APP} USING ({visible})")
    op.execute(f"CREATE POLICY homes_insert ON homes FOR INSERT TO {APP} WITH CHECK (app_user() IS NOT NULL)")
    op.execute(f"CREATE POLICY worker_access ON homes TO {WORKER} USING (true) WITH CHECK (true)")


def downgrade():
    for table in ["homes", "home_members", *HOME_TABLES, *CHILD_TABLES]:
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
        for policy in ("tenant_isolation", "worker_access", "homes_select", "homes_update", "homes_delete", "homes_insert",
                       "members_select", "members_insert", "members_update", "members_delete"):
            op.execute(f"DROP POLICY IF EXISTS {policy} ON {table}")
    op.execute("DROP FUNCTION IF EXISTS app_home()")
    op.execute("DROP FUNCTION IF EXISTS app_user()")
    op.execute(f"ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM {APP}, {WORKER}")
    op.execute(f"ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE USAGE, SELECT ON SEQUENCES FROM {APP}, {WORKER}")
    op.execute(f"REVOKE ALL ON ALL TABLES IN SCHEMA public FROM {APP}, {WORKER}")
    op.execute(f"REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM {APP}, {WORKER}")
    op.execute(f"REVOKE USAGE ON SCHEMA public FROM {APP}, {WORKER}")
