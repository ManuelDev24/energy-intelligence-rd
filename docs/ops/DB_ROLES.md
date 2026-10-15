# Roles de base de datos y aislamiento por vivienda (RLS)

Auditoría C-01. Hasta ahora un único rol —dueño de todas las tablas— migraba y servía la aplicación, y el aislamiento entre viviendas dependía
solo del código (`authorize_home` + filtrar por `home_id`). Las migraciones `0027` (RLS por vivienda) y `0031` (acceso acotado de la operación administrativa del OCR, función `app_admin_ocr()`) añaden una **segunda barrera en la base**.

## Qué hay

| Rol | Lo usa | Qué puede | Qué NO puede |
|---|---|---|---|
| **dueño** (el que ya existe: `neondb_owner`, `energy`…) | **solo las migraciones** (`MIGRATION_DATABASE_URL`) y el respaldo/restauración | Todo | — (nunca debe estar en `DATABASE_URL` de un servicio) |
| **`erd_app`** | el **API** (`DATABASE_URL` del servicio web de API) | SELECT/INSERT/UPDATE/DELETE, sujeto a RLS: solo ve y escribe filas de la vivienda del contexto de la petición y sus propias membresías | DDL, TRUNCATE, `alembic_version`, saltarse la RLS |
| **`erd_worker`** | el **worker** y los scripts de operación (`DATABASE_URL` del worker) | SELECT/INSERT/UPDATE/DELETE de todas las viviendas (procesa trabajos de todas) | DDL, TRUNCATE, `alembic_version` |

La migración crea `erd_app` y `erd_worker` **sin LOGIN ni contraseña**. Las contraseñas nunca viven en el repositorio: se asignan a mano (abajo).

## Cómo funciona la RLS

- Tablas protegidas: `homes`, `home_members`, `contracts`, `bills`, `bill_items`, `bill_snapshots`, `meter_readings`, `equipment`, `power_outages`,
  `recommendations`, `anomalies`, `alerts`, `alert_settings`, `home_goals`, `documents`, `document_ocr`.
- Por transacción el API fija `app.user_id` (tras autenticar) y `app.home_id` (tras comprobar la membresía en `authorize_home`), con
  `set_config(..., true)` (`app/rls.py`). Las políticas comparan con `app_user()` y `app_home()`. **Sin contexto no se ve ninguna fila.**
- Solo se puede insertar la **propia** membresía y en la vivienda del contexto (crear vivienda o aceptar una invitación).
- Quedan **fuera** de la RLS (con motivo): identidad (`users`, sesiones, tokens, dispositivos, notificaciones: el API debe leerlas antes de saber quién es
  la persona), tarifas públicas, cola interna (`jobs`, `storage_deletions`, `auth_abuse_buckets`), `audit_events` (no se expone por API) y
  `home_invitations` (se busca por el hash del token antes de conocer la vivienda). Siguen restringidas por el reparto de permisos.
- **Alcance honesto:** la RLS contiene *errores de autorización del código* (un `home_id` olvidado en una consulta, una ruta mal protegida). No detiene
  a quien ya ejecuta SQL arbitrario en la conexión del API (podría llamar a `set_config`): eso exige evitar la inyección SQL (hoy no hay SQL crudo con datos
  del usuario) y credenciales separadas por servicio (ya: API vs worker).
- El **modo piloto** (`AUTH_ENABLED=false`, solo desarrollo) no establece persona ni vivienda y **no es compatible** con `erd_app`: en local se usa el superusuario.
- Una tabla nueva con columna `home_id` sin RLS **rompe la prueba** `test_every_table_with_a_home_column_has_rls_and_both_policies`.

## Puesta en marcha (Neon / PostgreSQL gestionado) — una vez por rama/base

1. **Migrar** con el rol dueño (`MIGRATION_DATABASE_URL`): `alembic upgrade head`. Crea los roles, los permisos y las políticas.
2. **Dar inicio de sesión** a los roles, con contraseñas aleatorias generadas por ti (no las pegues en el chat ni en commits). Con `psql` conectado como dueño:
   ```sql
   \set app_pw   `openssl rand -base64 36 | tr -d '\n'`
   \set worker_pw `openssl rand -base64 36 | tr -d '\n'`
   ALTER ROLE erd_app    LOGIN PASSWORD :'app_pw';
   ALTER ROLE erd_worker LOGIN PASSWORD :'worker_pw';
   \echo Guarda ambas contraseñas en el gestor de secretos y construye las URL (no se vuelven a mostrar)
   ```
   Construye `DATABASE_URL` del **API** con `erd_app` y la del **worker** con `erd_worker` (`postgresql+psycopg://erd_app:…@host/db?sslmode=require`; usa la
   conexión *directa*, no la del pooler, salvo que verifiques que el pooler conserva `set_config` por transacción). `MIGRATION_DATABASE_URL` = URL del rol dueño.
3. En Render: `DATABASE_URL` (API) = `erd_app`; `DATABASE_URL` (worker) = `erd_worker`; `MIGRATION_DATABASE_URL` (solo API) = dueño; `DB_REQUIRE_RESTRICTED_ROLE=true`
   (ya está en `render.yaml`). Si el rol de la conexión ignora la RLS, **el servicio no arranca** con el mensaje que explica por qué.
4. Verificar con `uv run python -m scripts.check_db_roles` (usa `DATABASE_URL`; sale con código 1 si el rol es privilegiado o falta RLS en alguna tabla).

## Rotar contraseñas

`ALTER ROLE erd_app PASSWORD '…'` con una nueva, actualizar `DATABASE_URL` del servicio y redeplegar (las conexiones abiertas con la clave vieja siguen hasta reiniciar).

## Restaurar un respaldo

`scripts/db_backup.sh` usa `--no-owner --no-acl`: los **permisos no viajan** en el respaldo (las políticas RLS sí, son parte del esquema). Tras restaurar, ejecuta con el
rol dueño `psql "$MIGRATION_DATABASE_URL" -f backend/api/scripts/db_grants.sql` (idempotente; una prueba comprueba que coincide con la migración `0027`) y repite los pasos 2–4.
Los roles `erd_app` y `erd_worker` son del servidor, no de la base: si restauras en un servidor nuevo, créalos antes (`CREATE ROLE erd_app NOLOGIN; CREATE ROLE erd_worker NOLOGIN;`).

## Pruebas

- `tests/test_rls.py`: matriz tabla × operación × vivienda propia/ajena/sin contexto con los roles reales, worker, privilegios y ciclo de vida del contexto.
- `TEST_RLS_ROLE=1 uv run pytest`: ejecuta **toda** la suite con autenticación conectando el API como `erd_app` (el CI lo hace).
- E2E web: el arnés conecta el API como `erd_app` y el worker como `erd_worker` (ver `frontend-web/app/e2e/support/global-setup.ts`).
