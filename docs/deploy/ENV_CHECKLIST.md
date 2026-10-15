# Checklist de variables de entorno — Energy RD (ERD-DEPLOY-01)

Fuente de verdad: `services/api/app/config.py` (API), `apps/web/next.config.mjs` + `apps/web/src/lib/auth/bff.ts`
+ `apps/web/src/middleware.ts` (web), `apps/mobile/src/config.ts` (móvil). Blueprint: `render.yaml`.
Comprobación automática (sin red): `python3 infrastructure/deploy/check_deploy_config.py`.

Convenciones:

- **Secreto = Sí** → nunca en git, chat ni capturas. En `render.yaml` va con `sync: false`; Render lo pide
  **solo la primera vez** que se crea el Blueprint. Para cambiarlo luego: Dashboard → servicio → *Environment*.
- **Grupo** → la variable vive en el grupo de entorno `energyrd-api-<entorno>-config` del Blueprint.
- Staging y producción **nunca** comparten secretos (clave de firma, contraseña de BD, API key de Resend).
- `<api-staging>` = `energyrd-api-staging.onrender.com`, `<web-staging>` = `energyrd-web-staging.onrender.com`,
  `<api-prod>` = `energyrd-api-prod.onrender.com`, `<web-prod>` = `energyrd-web-prod.onrender.com`.
  Son los subdominios **esperados**: si el nombre está ocupado, Render añade un sufijo (`-abcd`). Confirma la URL
  real en el Dashboard y úsala en todas las variables que la mencionan. Con dominio propio usa ese dominio.

## Cómo generar valores

| Valor | Comando |
|---|---|
| `AUTH_SIGNING_KEY` (≥43 caracteres, ≥16 distintos) | `python3 -c 'import secrets;print(secrets.token_urlsafe(48))'` (64 caracteres) |
| Contraseña de rol Neon | La genera Neon al crear el rol (Console → *Roles* → *Add role*) |
| `RESEND_API_KEY` | Resend → *API Keys* → *Create API key* → permiso **Sending access**, dominio del entorno |
| `ANTHROPIC_API_KEY` (solo si `COPILOT_PROVIDER=anthropic`) | Anthropic Console → *API keys*; una por entorno. Por defecto el Copilot está apagado (`COPILOT_PROVIDER=disabled`). Ver `docs/architecture/COPILOT.md` |
| `COPILOT_PRICE_INPUT_USD_PER_MTOK` / `COPILOT_PRICE_OUTPUT_USD_PER_MTOK` (opcionales) | Tarifa vigente del proveedor (USD por millón de tokens de entrada / salida). **Solo** sirven para el costo estimado de la consola `/ia`; sin ambos no se estima nada. No son secretos |
| `SUPPORT_EMAIL` (opcional) | Correo público de soporte que muestra el centro de ayuda. Vacío = la pantalla dice que aún no está configurado (no se inventa una vía de contacto). Ver `docs/qa/ERD-HELP-01.md` |

Genera **una clave distinta por entorno**. Pégala directamente en el Dashboard de Render; no la guardes en
archivos del repo. Cambiar `AUTH_SIGNING_KEY` cierra todas las sesiones (y reinicia los contadores anti-abuso).

## API — `energyrd-api-staging` / `energyrd-api-prod` (Docker)

| Variable | Secreto | Staging | Production | Notas / validación en `config.py` |
|---|---|---|---|---|
| `DATABASE_URL` | **Sí** | Neon rama `staging`, rol `erd_staging` | Neon rama `production` (principal), rol `erd_prod` | Formato `postgresql+psycopg://ROL:CLAVE@ep-….us-east-1.aws.neon.tech/energyrd?sslmode=require&channel_binding=require`. **Cambiar el prefijo `postgresql://` que da Neon por `postgresql+psycopg://`.** Usar la conexión *directa* (sin `-pooler`). Fuera de development se rechaza host local o sin contraseña. |
| `AUTH_SIGNING_KEY` | **Sí** | generar | generar (otra) | ≥43 caracteres, ≥16 caracteres distintos, sin `secret/password/change_me`. También es la clave HMAC de los contadores anti-abuso. |
| `MIGRATION_DATABASE_URL` | **Sí** | rol **dueño** de la rama `staging` | rol **dueño** de producción | Solo servicio de **API** (no worker): lo usa `alembic upgrade head` (pre-deploy). El API sirve con `DATABASE_URL` = `erd_app`; el worker con `erd_worker`. Ver `docs/ops/DB_ROLES.md`. |
| `DB_REQUIRE_RESTRICTED_ROLE` | No (grupo) | `true` | `true` | Obligatorio en staging/production: el servicio no arranca si su rol de BD ignora la RLS (superusuario, BYPASSRLS o dueño de tablas). |
| `CORS_ORIGINS` | No | `https://<web-staging>` | `https://<web-prod>` (o dominio propio) | Lista separada por comas; **solo `https://`**, nunca `*`. La app móvil nativa no necesita CORS. |
| `ENVIRONMENT` | No (grupo) | `staging` | `production` | Activa los validadores de producción. **Obligatoria** en una plataforma o con base no local: si falta, el arranque falla (nunca se asume `development`). Solo `development`, `staging`, `production`. |
| `AUTH_ENABLED` | No (grupo) | `true` | `true` | Valor por defecto `true`; `false` (modo piloto local) solo en development y hay que pedirlo expresamente. |
| `MIGRATE_ON_START` | No (grupo) | `false` | `false` | `true` está **prohibido** en staging/production: la migración es un paso de release. |
| `SEED_PILOT` | No (grupo) | `false` | `false` | `true` está **prohibido** en staging/production (datos demo). |
| `DB_STATEMENT_TIMEOUT_MS` / `DB_LOCK_TIMEOUT_MS` / `DB_IDLE_IN_TRANSACTION_TIMEOUT_MS` | No | `30000` / `5000` / `60000` (por defecto) | igual | Tiempos de espera de la sesión de PostgreSQL (auditoría C-08): una consulta lenta o un bloqueo de vivienda colgado falla en segundos con 503 + `Retry-After` en vez de retener una conexión del pool sin límite. No aplican a las migraciones. Se fijan con `SET` al abrir cada conexión (compatible con poolers). `0` = sin límite. |
| `MAX_REQUEST_BODY_BYTES` / `UPLOAD_BODY_OVERHEAD_BYTES` | No | `262144` / `262144` (por defecto) | igual | Tope del cuerpo de cada petición (413 sin leerlo). Las rutas de subida de facturas admiten el archivo máximo (`DOCUMENT_MAX_PDF_BYTES`) más el sobre multipart. |
| `AUTH_HASH_CONCURRENCY` / `AUTH_HASH_WAIT_SECONDS` | No | `4` / `5` (por defecto) | igual | Cálculos Argon2 simultáneos (64 MiB cada uno); si no hay turno en el plazo, 503 + `Retry-After`. Con 512 MB de RAM, no subir de 4–6. |
| `DB_POOL_SIZE` | No (grupo) | `5` | `5` | Conexiones máximas por proceso = `DB_POOL_SIZE + DB_MAX_OVERFLOW`. |
| `DB_MAX_OVERFLOW` | No (grupo) | `5` | `5` | |
| `DB_POOL_TIMEOUT` | No (grupo) | `10` | `10` | Segundos. |
| `EMAIL_BACKEND` | No (grupo) | `resend` | `resend` | `console` solo en desarrollo local (guarda el mensaje en memoria/archivo de desarrollo, nunca en logs; la API lo rechaza fuera de development). La lee la recuperación de contraseña (ERD-AUTH-05, ya implementada). |
| `RESEND_API_KEY` | **Sí** | key de staging | key de producción | Obligatoria fuera de development (la API no arranca sin ella). Una key por entorno, solo *Sending access*. |
| `EMAIL_FROM` | No | `Energy RD <no-reply@staging.TU-DOMINIO>` | `Energy RD <no-reply@TU-DOMINIO>` | Obligatoria fuera de development. El dominio debe estar *Verified* en Resend. |
| `PASSWORD_RESET_URL` | No | `https://<web-staging>/<ruta-de-restablecer>` | `https://<web-prod>/<ruta-de-restablecer>` | La web sirve `/restablecer-contrasena` (ERD-AUTH-05); la API exige HTTPS y rechaza `?`/`#` en la URL (el token se añade como `#token=`). |
| `PORT` | No | (Render) | (Render) | La inyecta Render; **no** definirla. El contenedor escucha en `${PORT:-8000}`. |

**Almacenamiento y worker** (API **y** worker, mismos valores por entorno; ver `DEPLOY_GUIDE.md` §4b):

| Variable | Secreto | Notas |
|---|---|---|
| `STORAGE_BACKEND` | No (grupo) | `s3` en staging/production (`local` está prohibido; `disabled` apaga documentos y OCR) |
| `STORAGE_S3_BUCKET` | No (sync: false) | bucket **privado** del entorno |
| `STORAGE_S3_ENDPOINT_URL` | No (sync: false) | vacío = AWS; Cloudflare R2: `https://<cuenta>.r2.cloudflarestorage.com` |
| `STORAGE_S3_ACCESS_KEY_ID` / `STORAGE_S3_SECRET_ACCESS_KEY` | **Sí** | clave limitada a ese bucket |
| `STORAGE_ENCRYPTION_KEYS` | **Sí** | `id:clave` (base64url de 32 bytes). Perderla = perder los originales |
| `STORAGE_URL_SIGNING_KEY` | **Sí** | ≥ 43 caracteres aleatorios; firma enlaces de 60 s |
| `EXPO_ACCESS_TOKEN` | **Sí** (opcional) | solo el worker; avisos push |

Opcionales (tienen default seguro en `config.py`; solo definirlas si se decide cambiarlas):
`AUTH_ACCESS_TTL_SECONDS` (900, 60–900), `AUTH_REFRESH_TTL_DAYS` (30, 1–90), `AUTH_REGISTER_LIMIT` (10),
`AUTH_LOGIN_LIMIT` (20), `AUTH_REFRESH_LIMIT` (60), `AUTH_ABUSE_WINDOW_SECONDS` (60), `AUTH_ISSUER`,
`AUTH_AUDIENCE`, `PROJECT_NAME`, `VERSION`, `PASSWORD_RESET_TTL_MINUTES` (30), `PASSWORD_RESET_ACCOUNT_LIMIT` (3),
`DOCUMENT_UNCONFIRMED_RETENTION_DAYS` (7: originales de factura sin confirmar; propuesta pendiente de ERD-LEGAL-FINAL),
`DOCUMENT_MAX_PHOTO_BYTES` (10 MiB), `DOCUMENT_MAX_PDF_BYTES` (20 MiB), `SENTRY_DSN` (vacío = sin telemetría; `https://`; ver
`docs/ops/OBSERVABILITY.md`), `SENTRY_TRACES_SAMPLE_RATE` (0.05), `WORKER_POLL_SECONDS` (2), `JOB_*` (reintentos, backoff y retención de la cola), `OCR_*` (páginas, tiempo y trabajos activos), `ANOMALY_*` (umbrales de detección, **sin calibrar con datos reales**), `NOTIFY_DAILY_CAP` (10 avisos por persona y día), `MAX_DEVICES_PER_USER` (10).

> ⚠️ Límites anti-abuso detrás de Render: la API cuenta intentos **por IP de transporte** y arranca con
> `--no-proxy-headers` (decisión documentada en `services/api/AUTH_ABUSE_PROTECTION.md`). Detrás del proxy de
> Render todos los clientes comparten ese presupuesto (y toda la web llega desde el BFF). Antes de abrir
> producción a usuarios reales hay que decidir: subir `AUTH_*_LIMIT` (mitigación inmediata, sin código) o
> implementar en la API una IP de cliente confiable (tarea de código aparte). No se activó `--proxy-headers`
> porque con `*` Uvicorn toma la IP más a la izquierda de `X-Forwarded-For`, que el cliente puede falsificar.

## Web — `energyrd-web-staging` / `energyrd-web-prod` (Node, monorepo)

| Variable | Secreto | Staging | Production | Notas |
|---|---|---|---|---|
| `NEXT_PUBLIC_AUTH_ENABLED` | No | `true` | `true` | Se incrusta en el build: cambiarla exige redeploy. Sin `true` el build de producción falla a propósito. |
| `API_BASE_URL` | No | `https://<api-staging>` | `https://<api-prod>` | Solo origen (sin ruta, sin `/` extra, sin credenciales); `https` obligatorio. La valida `next.config.mjs` **en build** y el BFF en ejecución. |
| `WEB_ORIGIN` | No | `https://<web-staging>` | `https://<web-prod>` | Origen público de la propia web (cookies `__Host-` y control de `Origin`). Debe coincidir con `CORS_ORIGINS` de la API. |
| `NODE_VERSION` | No | `24` | `24` | Render; el repo exige Node `>=24 <25`. |
| `NEXT_TELEMETRY_DISABLED` | No | `1` | `1` | Plataforma. |
| `NODE_ENV` | — | **no definir** | **no definir** | Si vale `production` durante el build, `npm ci` omite devDependencies (Tailwind/TypeScript) y el build falla. `next build/start` la fijan solos. |
| `PORT` | — | (Render) | (Render) | `next start` la lee automáticamente. |

`NEXT_PUBLIC_API_URL` (`apps/web/src/lib/env.ts`) solo se usa en el modo piloto sin auth; con auth activa la web
habla con la API únicamente a través del BFF (`API_BASE_URL`). No definirla.

## Móvil — `apps/mobile/eas.json` (EAS Build)

| Variable | Secreto | development | preview | production | Notas |
|---|---|---|---|---|---|
| `EXPO_PUBLIC_API_URL` | No (va dentro de la app) | `https://<api-staging>` | `https://<api-staging>` | `https://<api-prod>` | En builds release se exige origen HTTPS exacto; si no, la app muestra error de configuración y no hace peticiones. |
| `EXPO_PUBLIC_AUTH_ENABLED` | No | `true` | `true` | `true` | Solo `false` en desarrollo local desactiva auth; en release se ignora. |

Nada secreto debe ir en `EXPO_PUBLIC_*`: queda embebido en el binario. Si cambia la URL real de Render (sufijo)
o se usa dominio propio, editar `eas.json` antes de compilar.

## Sentry

Plan Free. Un proyecto por entorno y por plataforma. `docs/ops/OBSERVABILITY.md` explica qué se envía y qué no.

| Variable | Dónde | Secreto | Estado |
|---|---|---|---|
| `SENTRY_DSN` | API y worker | No fuerte (no se imprime) | **ya en el código** (inactivo sin valor); HTTPS obligatorio |
| `NEXT_PUBLIC_SENTRY_DSN` | web (se incrusta al compilar) | No (va dentro del JS público) | **ya en el código** (inactivo sin valor); redeploy tras cambiarla |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` / `NEXT_PUBLIC_SENTRY_RELEASE` | web | No | opcionales |
| `EXPO_PUBLIC_SENTRY_DSN` | móvil | No | **aún no existe** en el código (módulo nativo; requiere nuevo build) |
| `SENTRY_AUTH_TOKEN` | solo el build (sourcemaps) | **Sí** | no se usa todavía |

## Textos legales (re-auditoría C-04)
En `production` el API **no arranca** mientras `services/legal.py` tenga `LEGAL_STATUS = "draft"`. Se resuelve aprobando los textos
(revisión legal → `LEGAL_STATUS = "final"` y nuevas versiones) o, bajo la responsabilidad expresa de quien decide, con la variable
`ALLOW_DRAFT_LEGAL=true` en el panel del proveedor. `check_deploy_config.py` rechaza que esa variable se fije en `render.yaml`.
