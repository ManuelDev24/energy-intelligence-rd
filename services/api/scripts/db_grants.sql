-- Auditoría C-01: reaplica los permisos de erd_app / erd_worker (los respaldos usan --no-acl y no los conservan).
-- Ejecutar con el rol DUEÑO tras restaurar un respaldo:  psql "$MIGRATION_DATABASE_URL" -f scripts/db_grants.sql
-- Idempotente. Las políticas RLS sí viajan en el respaldo (son parte del esquema). Debe coincidir con la migración 0027.
GRANT USAGE ON SCHEMA public TO erd_app, erd_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO erd_app, erd_worker;
REVOKE ALL ON alembic_version FROM erd_app, erd_worker;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO erd_app, erd_worker;
GRANT EXECUTE ON FUNCTION app_user(), app_home(), app_admin_ocr() TO erd_app, erd_worker;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO erd_app, erd_worker;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO erd_app, erd_worker;
