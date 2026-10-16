# Plan de despliegue — piloto gratuito (Neon + Render Free + Vercel Hobby)

Estado: **configuración del piloto; despliegue remoto pendiente**. Publicar código no crea los servicios ni valida sus cuotas. La URL `https://energyrd-api.onrender.com` es propuesta, no reservada ni verificada como servicio propio.

## Topología

| Pieza | Dónde (gratis) | Región | Notas |
|---|---|---|---|
| PostgreSQL | **Neon Free**, proyecto `Energy RD` (`wandering-dust-03587813`) | AWS us-east-2 (Ohio) | Rama `production` hoy *archived*; se reactiva al conectarse. Límites de espacio y cómputo del plan Free. |
| API + worker (`backend/api`) | **Render Free**, servicio `energyrd-api` (Docker) — `render.yaml` | `ohio` | El worker corre dentro del mismo contenedor (`RUN_WORKER_IN_WEB=true`). Duerme tras 15 min sin tráfico. |
| Web (`frontend-web/app`) | **Vercel Hobby**, proyecto `energyrd-web` | funciones en `cle1` (Cleveland) | Next.js 15 + BFF de sesión. |
| Admin (`frontend-web/admin`) | **Vercel Hobby**, proyecto `energyrd-admin` | `cle1` | Proyecto y dominio separados. |
| Originales de factura | **Backblaze B2** (10 GB gratis, compatible S3) o `STORAGE_BACKEND=disabled` | us-east | Con `disabled`: registro manual, sin OCR. |
| Correo | **Resend Free** | — | Envía por HTTPS (Render Free bloquea SMTP, no afecta). |
| Móvil | **EAS Free** | — | `eas.json` apunta a `https://energyrd-api.onrender.com`. |

Todo en Ohio/Cleveland para que las consultas BFF → API → Neon no crucen el país.
Los documentos antiguos decían Neon us-east-1: es **us-east-2**.

## Limitaciones aceptadas del modo gratuito

- **Arranque en frío:** Render Free duerme a los 15 min y tarda ~1 min en despertar; el BFF espera 10 s (admin 8 s), así que la
  primera petición puede fallar. Se acepta el arranque en frío para demostraciones; esperar y reintentar manualmente.
  No configurar pings para mantenerlo despierto: el worker consulta PostgreSQL periódicamente e impide su suspensión.
  Neon Free incluye actualmente 100 CU-h por proyecto al mes; mantener el worker todo el mes puede agotar la cuota.
  Medir consumo y memoria antes de abrir el piloto; no se promete operación gratuita continua.
- **512 MB / 0,1 CPU** para API + worker + Tesseract: el OCR será lento; varias subidas a la vez se encolan.
- **Límites de abuso por IP compartidos:** sin Cloudflare delante (`CLIENT_IP_SOURCE=socket`), la API ve la IP del proxy, no la del
  navegador; los límites pueden compartirse. Validar la topología antes de abrir el piloto. No activar
  `cf-connecting-ip` sin asegurar que el origen no acepta tráfico que eluda Cloudflare ni cabeceras falsificadas.
- **Vercel Hobby es solo para uso no comercial.** Si el piloto cobra o pasa a ser comercial, plan Pro.
- **`ENVIRONMENT=staging`:** los textos legales siguen en borrador y la API en `production` no arranca con ellos (C-04).
- **Sin CI:** los workflows de GitHub se eliminaron. Antes de cada push a `Dev` (que despliega Render y Vercel): typecheck,
  `npm test`, lint, builds, suite API y E2E web/admin en local.

## Pasos (los hace la persona dueña, con sus cuentas)

1. **Neon** — antes de escribir, verificar la base objetivo, respaldo y autorización de migraciones; preferir una rama aislada de piloto. En esa rama crear los roles `erd_app` y `erd_worker` según `docs/ops/DB_ROLES.md` y anotar sus URLs con
   el endpoint **pooler** (`…-pooler…neon.tech`, `sslmode=require`). Ejecutar las migraciones desde tu máquina con el rol dueño:
   `cd backend/api && MIGRATION_DATABASE_URL=… uv run alembic upgrade head`. El rol dueño no se carga en ningún servicio.
2. **Backblaze B2** (opcional) — bucket **privado** y clave de aplicación limitada a ese bucket. Generar `STORAGE_ENCRYPTION_KEYS`
   y `STORAGE_URL_SIGNING_KEY` según `backend/api/STORAGE.md`.
3. **Resend** — verificar un dominio propio para destinatarios reales; el remitente de pruebas tiene restricciones.
   Un dominio puede tener coste: no comprarlo sin autorización. Mantener Copilot deshabilitado para no gastar en APIs de IA.
4. **Render** — *New → Blueprint* sobre el repo, rama `Dev`. Rellenar las variables `sync: false` (lista en `render.yaml`).
   Comprobar `https://energyrd-api.onrender.com/health` → 200. Si Render asigna otro subdominio, actualizar `eas.json`.
5. **Vercel** — importar el repo dos veces:
   - Root Directory `frontend-web/app` y `frontend-web/admin`; activar *Include source files outside of the Root Directory*
     (usan `packages/*` y el `package-lock.json` de la raíz).
   - Node.js 24.x; región de funciones `cle1`; *Production Branch* `Dev` mientras sea piloto.
   - Web: `API_BASE_URL=https://energyrd-api.onrender.com`, `WEB_ORIGIN=https://<web>.vercel.app`, `NEXT_PUBLIC_AUTH_ENABLED=true`.
   - Admin: `ADMIN_API_BASE_URL=https://energyrd-api.onrender.com`, `ADMIN_ORIGIN=https://<admin>.vercel.app`.
6. **Volver a Render** — `CORS_ORIGINS=https://<web>.vercel.app,https://<admin>.vercel.app` y
   `PASSWORD_RESET_URL=https://<web>.vercel.app/restablecer-contrasena`; redeploy.
7. **Cuotas y arranque en frío** — verificar el despertar manual y consumo real de Neon/Render; sin keep-alive artificial.
8. **Primer admin** — `python -m app.cli_bootstrap_admin <correo>` contra Neon con una cuenta ya registrada (ver `docs/ops/ADMIN_USERS.md`).
9. **Humo** — registro → vivienda → factura → consumo → alertas en la web; login y `/sistema` en el admin; build `preview` de EAS.
10. Desactivar GitHub Pages si no se usa (publica el README del repositorio público).

## Verificación local hecha

- `RUN_WORKER_IN_WEB` / `WORKER_DATABASE_URL`: validación de configuración y prueba de `docker-entrypoint.sh` con binarios
  simulados (`backend/api/tests/test_worker_in_web.py`): el worker arranca con el rol `erd_worker` sin heredar
  `MIGRATION_DATABASE_URL`, y sin la bandera solo arranca la API.
- `python3 infrastructure/deploy/check_deploy_config.py`: valida `render.yaml` (Free, `ohio`, secretos `sync: false`, variables
  existentes en Settings, sin rol dueño, `ENVIRONMENT=staging`) y `eas.json`.
- No verificado: nada contra Render, Vercel, Neon, B2 ni Resend reales.

## Cuando deje de ser gratuito

Render Starter con un servicio worker aparte (`RUN_WORKER_IN_WEB=false`), Vercel Pro, plan de pago de Neon, `ENVIRONMENT=production`
con textos legales aprobados, dominio propio y Cloudflare delante.
