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

Genera **una clave distinta por entorno**. Pégala directamente en el Dashboard de Render; no la guardes en
archivos del repo. Cambiar `AUTH_SIGNING_KEY` cierra todas las sesiones (y reinicia los contadores anti-abuso).

## API — `energyrd-api-staging` / `energyrd-api-prod` (Docker)

| Variable | Secreto | Staging | Production | Notas / validación en `config.py` |
|---|---|---|---|---|
| `DATABASE_URL` | **Sí** | Neon rama `staging`, rol `erd_staging` | Neon rama `production` (principal), rol `erd_prod` | Formato `postgresql+psycopg://ROL:CLAVE@ep-….us-east-1.aws.neon.tech/energyrd?sslmode=require&channel_binding=require`. **Cambiar el prefijo `postgresql://` que da Neon por `postgresql+psycopg://`.** Usar la conexión *directa* (sin `-pooler`). Fuera de development se rechaza host local o sin contraseña. |
| `AUTH_SIGNING_KEY` | **Sí** | generar | generar (otra) | ≥43 caracteres, ≥16 caracteres distintos, sin `secret/password/change_me`. También es la clave HMAC de los contadores anti-abuso. |
| `CORS_ORIGINS` | No | `https://<web-staging>` | `https://<web-prod>` (o dominio propio) | Lista separada por comas; **solo `https://`**, nunca `*`. La app móvil nativa no necesita CORS. |
| `ENVIRONMENT` | No (grupo) | `staging` | `production` | Activa los validadores de producción. |
| `AUTH_ENABLED` | No (grupo) | `true` | `true` | Obligatorio fuera de development. |
| `MIGRATE_ON_START` | No (grupo) | `false` | `false` | `true` está **prohibido** en staging/production: la migración es un paso de release. |
| `SEED_PILOT` | No (grupo) | `false` | `false` | `true` está **prohibido** en staging/production (datos demo). |
| `DB_POOL_SIZE` | No (grupo) | `5` | `5` | Conexiones máximas por proceso = `DB_POOL_SIZE + DB_MAX_OVERFLOW`. |
| `DB_MAX_OVERFLOW` | No (grupo) | `5` | `5` | |
| `DB_POOL_TIMEOUT` | No (grupo) | `10` | `10` | Segundos. |
| `EMAIL_BACKEND` | No (grupo) | `resend` | `resend` | `console` solo en desarrollo local (imprimiría enlaces de recuperación en los logs). **Pendiente**: la lee la recuperación de contraseña en curso. |
| `RESEND_API_KEY` | **Sí** | key de staging | key de producción | **Pendiente** (recuperación de contraseña). Una key por entorno, solo *Sending access*. |
| `EMAIL_FROM` | No | `Energy RD <no-reply@staging.TU-DOMINIO>` | `Energy RD <no-reply@TU-DOMINIO>` | **Pendiente**. El dominio debe estar *Verified* en Resend. |
| `PASSWORD_RESET_URL` | No | `https://<web-staging>/<ruta-de-restablecer>` | `https://<web-prod>/<ruta-de-restablecer>` | **Pendiente**: la ruta exacta la define el trabajo de recuperación; confirmarla en su documentación antes de crear el Blueprint. |
| `PORT` | No | (Render) | (Render) | La inyecta Render; **no** definirla. El contenedor escucha en `${PORT:-8000}`. |

Opcionales (tienen default seguro en `config.py`; solo definirlas si se decide cambiarlas):
`AUTH_ACCESS_TTL_SECONDS` (900, 60–900), `AUTH_REFRESH_TTL_DAYS` (30, 1–90), `AUTH_REGISTER_LIMIT` (10),
`AUTH_LOGIN_LIMIT` (20), `AUTH_REFRESH_LIMIT` (60), `AUTH_ABUSE_WINDOW_SECONDS` (60), `AUTH_ISSUER`,
`AUTH_AUDIENCE`, `PROJECT_NAME`, `VERSION`.

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

## Sentry (más adelante, solo documentado)

Plan Free. Cuando se integre: `SENTRY_DSN` (API), `NEXT_PUBLIC_SENTRY_DSN` (web), `EXPO_PUBLIC_SENTRY_DSN`
(móvil), `SENTRY_AUTH_TOKEN` (**secreto**, solo build para subir sourcemaps), `SENTRY_ENVIRONMENT`
(`staging`/`production`). Hoy **ninguna** existe en el código: no definirlas todavía.
