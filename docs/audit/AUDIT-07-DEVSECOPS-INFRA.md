# AUDIT-07 — DevSecOps, CI/CD, contenedores e infraestructura

Modo: solo lectura. Rama `Dev` @ `5e761c6`. Alcance: `.github/workflows/*`, `backend/api/Dockerfile` + `docker-entrypoint.sh`, `docker-compose.yml`, `render.yaml`, `frontend-mobile/app/eas.json`, `scripts/`, `infrastructure/`, `docs/{deploy,ops,security}`.
No se desplegó nada, no se tocaron cuentas externas, no se leyeron secretos reales.

## 1. Estado de la entrega continua (CI)

| Elemento | Estado | Evidencia |
|---|---|---|
| Disparadores | PR y push a `Dev`, `QA`, `main`; `concurrency` con cancelación por rama | `ci.yml:3-11` |
| Jobs | `api` (contratos, arquitectura, migraciones up/down/up, seed doble, pytest), `web-mobile` (typecheck, lint web, tests, build con `AUTH=true`), `e2e-web` (Playwright), `mobile-e2e` (recorridos contra API real) | `ci.yml:14-191` |
| Dependencias reproducibles | `uv sync --frozen`, `npm ci`, `uv.lock` + `package-lock.json` versionados | `ci.yml` |
| Monitor de dependencias | `deps-monitor.yml`: semanal + en PR que toque lockfiles; `npm run audit:monitor` (avisos aceptados con caducidad) y `pip-audit` sobre `uv.lock`; `permissions: contents: read` | `deps-monitor.yml:1-38`, `docs/security/accepted-advisories.json` |
| Comprobación de despliegue | `infrastructure/deploy/check_deploy_config.py`: **0 errores, 0 avisos** (ejecutada en esta auditoría); valida secretos `sync:false`, rama/auto-deploy de prod, regla HTTPS de móvil | salida local |
| Higiene de artefactos E2E | Depuración (`scrub_e2e_artifacts.py`) antes de subir diagnósticos, solo si falla, retención 7 días | `ci.yml:108-122` |
| **Verificación real en GitHub Actions del job `e2e-web`** | **No confirmada**: el job nunca llegó a ejecutarse hasta el final en el PR #22 (declarado, no verificado en la nube) | historial del PR |

### Hallazgos de CI

| ID | Sev. | Hallazgo | Evidencia | Corrección sugerida |
|---|---|---|---|---|
| F07-01 | **Media** | `ci.yml` **no declara `permissions:`** → el `GITHUB_TOKEN` hereda el valor por defecto del repositorio/organización (puede ser lectura+escritura). Solo `deps-monitor.yml` lo restringe | `ci.yml` (sin bloque), `deps-monitor.yml:13-14` | `permissions: contents: read` a nivel de workflow |
| F07-02 | Media | Acciones de terceros fijadas por **etiqueta**, no por SHA (`actions/checkout@v4`, `setup-node@v4`, `upload-artifact@v4`, `astral-sh/setup-uv@v6`). Una etiqueta movida compromete la cadena de suministro del CI | `ci.yml:32-33,54,93,113,138-140`; `deps-monitor.yml` | Fijar SHAs completos + Dependabot para actualizarlos |
| F07-03 | Media | **Sin análisis estático de seguridad ni escaneo de secretos ni de imagen en CI**: no hay CodeQL/Semgrep, gitleaks/trufflehog, Trivy/Grype ni SBOM. (Esta auditoría hizo un barrido local de patrones de secretos sobre 1109 archivos versionados: 0 coincidencias; no sustituye un control continuo) | `.github/workflows/` (solo 2 archivos) | Añadir CodeQL (python, javascript-typescript), gitleaks y Trivy sobre la imagen; generar SBOM (CycloneDX) |
| F07-04 | Media | **Sin `ruff`/`mypy`/`pytest-cov` para Python** y solo `lint` del web (no del móvil/paquetes) | `ci.yml`, `pyproject.toml` (ver F06-06) | Linter y tipado gradual + cobertura con umbral |
| F07-05 | Baja | Jobs `api`, `web-mobile`, `mobile-e2e` sin `timeout-minutes` (por defecto 360 min) | `ci.yml:14,50,124` | `timeout-minutes` (15–30) |
| F07-06 | Baja | Sin `dependabot.yml`, `CODEOWNERS`, `SECURITY.md` ni plantilla de PR | `ls .github` | Añadirlos (aviso de vulnerabilidades, revisión obligatoria por propietarios) |
| F07-07 | Baja | Versiones de Node dispersas: 24 en CI/`engines`/Render/EAS, **22** en `deps-monitor.yml` | `deps-monitor.yml:23`, `package.json:47-49` | Unificar en 24 |
| F07-08 | Baja | `package.json` declara el workspace `mcp/*` que no existe en el repo; `.agents/skills/**` (material de agentes) versionado en el repositorio de producto | `package.json:28`, `git ls-files .agents` | Quitar el workspace huérfano; decidir si `.agents/` pertenece al repo |
| F07-09 | Info | Protección de ramas (revisiones obligatorias, checks requeridos, bloqueo de push a `main`/`QA`) **no verificable desde el repositorio**; es regla de proceso acordada, no un control técnico comprobado | — | Verificarlo en Settings → Branches (lo hace Manuel) |
| F07-10 | Info | El escaneo de secretos de GitHub (push protection) tampoco es verificable aquí | — | Activarlo en Settings → Code security |

## 2. Contenedor (API / worker)

Bien hecho:
- **Usuario sin privilegios** (`useradd --system --uid 10001`, `USER app`) — `Dockerfile:21-25`.
- Dependencias fijadas por `uv.lock` con `--frozen --no-dev` (sin dependencias de desarrollo en la imagen), compilación de bytecode, capas ordenadas para caché.
- `.dockerignore` presente (`.venv`, `tests`, `.env*`, `__pycache__`).
- **Entrypoint valida la configuración antes de nada** (`from app.config import settings`) y falla cerrado; migraciones solo bajo `MIGRATE_ON_START` (apagado en Render) o como `preDeployCommand` en producción; seed solo con `SEED_PILOT`.
- `uvicorn --no-proxy-headers` deliberado (la IP real del navegador llega firmada por el BFF); sin `--reload`.
- El mismo `Dockerfile` sirve API y worker (`dockerCommand: python -m app.worker`), con comprobación de configuración idéntica.

Hallazgos:

| ID | Sev. | Hallazgo | Evidencia | Corrección sugerida |
|---|---|---|---|---|
| F07-11 | Media | Imagen base **sin fijar por digest** (`python:3.12-slim`, `ghcr.io/astral-sh/uv:0.9`): un rebuild puede traer una base distinta; sin escaneo de vulnerabilidades de la imagen | `Dockerfile:1-3` | Fijar `@sha256:…`, reconstruir periódicamente, Trivy en CI |
| F07-12 | Baja | Sin `HEALTHCHECK` en la imagen (compose y Render sí definen sondeo externo) | `Dockerfile` | Opcional: `HEALTHCHECK` con `python -c urllib…/health/live` |
| F07-13 | Baja | Paquetes `apt` de Tesseract sin versión fijada; un único proceso uvicorn sin `--workers` ni límites (`--timeout-keep-alive`, `--limit-concurrency`) | `Dockerfile:10-12`, `docker-entrypoint.sh:17` | Documentar; ajustar tras pruebas de carga reales |
| F07-14 | Baja | Registro de acceso de uvicorn por defecto (incluye ruta con `?query`): hoy las rutas no llevan datos personales en query, pero cualquier token futuro en query se registraría | `docker-entrypoint.sh:17` | `--no-access-log` (el middleware propio ya registra ruta+estado) o filtro de query |

## 3. Docker Compose (desarrollo local)

- PostgreSQL enlazado a `127.0.0.1:5433` (no expuesto a la red); API a `127.0.0.1:8000` por defecto; contraseña por defecto `change_me_local_only` (solo local; en CI es efímera). Perfiles `ops`/`jobs` para migración y worker.
- `ENVIRONMENT=development` por defecto → `AUTH_ENABLED=false` permitido; los guards de `config.py:131-201` impiden arrancar así en `staging`/`production`.
- Servicio `redis` documentado como **sin uso** (perfil `jobs`): código muerto de infraestructura (F07-15, Info; retirarlo o no usarlo).
- Nota: la propia cabecera de compose reconoce que `docker compose` **no se pudo levantar** en el entorno de desarrollo (sin daemon); la sintaxis se validó con `compose config`. En esta auditoría tampoco hay Docker.

## 4. Render (staging / producción)

Bien hecho (por `render.yaml`, comprobado con el script del repo):
- Secretos siempre `sync: false` (nunca valores en el Blueprint); URLs públicas también.
- **Producción:** rama `main`, `autoDeployTrigger: "off"` (despliegue manual), migración como `preDeployCommand: alembic upgrade head` en instancia aparte (si falla, no se enruta tráfico), `AUTH_ENABLED=true`, `MIGRATE_ON_START=false`, `SEED_PILOT=false`.
- **Staging:** rama `Dev`, `previews.generation: "off"` (sin entornos de previsualización con secretos). Mismo conjunto de variables que producción (paridad).
- `STORAGE_BACKEND=s3` con originales de factura **cifrados** (claves con rotación `id:clave`) y descarga por token firmado de un solo uso.
- Región única (`virginia`), almacenamiento en bucket privado.

Riesgos / hallazgos:

| ID | Sev. | Hallazgo | Evidencia | Corrección sugerida |
|---|---|---|---|---|
| F07-16 | Media | **Staging usa planes Free (web/API duermen tras 15 min) y el worker es de pago**; sin entorno de staging real con OCR continuo hasta que se pague. La migración de staging es manual (Render no ofrece `preDeployCommand` en Free): riesgo de despliegue con esquema desfasado | `render.yaml:1-9, 60-70`, `DEPLOY_GUIDE.md` | Documentado; decidir plan antes de QA de staging |
| F07-17 | Media | **Instancia única** por servicio (sin réplicas/HA) y pool de BD pequeño (5+5); un reinicio del worker o de Neon interrumpe OCR/alertas (la cola está en PostgreSQL, así que no se pierde trabajo, pero se retrasa) | `render.yaml` | Aceptable para piloto; documentar RTO/RPO reales |
| F07-18 | Media | **Observabilidad sin conectar:** `docs/ops/OBSERVABILITY.md` y `app/telemetry.py` existen, pero el DSN/proyecto real no está configurado (tarea ERD-OBS-01 abierta). Sin alertas de error 5xx, de cola atascada ni de caducidad de certificado | `docs/ops/OBSERVABILITY.md`, tarea 11 | Configurar Sentry (o equivalente) y alertas mínimas antes de abrir |
| F07-19 | Media | **Recuperación ante desastres probada solo en local** (`db_backup.sh`, `db_restore_verify.sh`, `test_db_dr.sh`, `restore_drill.sh` con BD desechable). No hay evidencia de PITR/backup de Neon ni de simulacro real, ni de versionado/retención del bucket S3 de producción | `docs/ops/DISASTER_RECOVERY.md`, tarea 12 | Simulacro con la cuenta real: restaurar una rama de Neon y un objeto del bucket; fijar RPO/RTO |
| F07-20 | Baja | Despliegue web: `buildCommand` ejecuta `npm ci --include=dev` en el servidor de producción y `next start` sin cabeceras de seguridad (F05-01) | `render.yaml:95, 233` | Añadir cabeceras en `next.config.mjs` |
| F07-21 | Info | El worker ya gestiona SIGTERM/SIGINT: termina el trabajo en curso y sale sin tomar otro (`app/worker.py:8, 60-62`); los trabajos son reintentables. Sin hallazgo, solo confirmación | `app/worker.py` | — |

## 5. Gestión de secretos

- En el repositorio: solo `.env.example` (raíz y web) con valores de marcador; `.gitignore` excluye `.env`, `.env.*`, `qa-private/` (facturas reales), `.local-storage/`, `.local-backups/`, evidencias de dispositivo y artefactos de E2E.
- Barrido local de patrones (AWS, claves privadas, tokens de GitHub/Slack/OpenAI-like/Resend) sobre `git ls-files`: **0 coincidencias** (salida solo de nombres, sin valores).
- Producción: la configuración **rechaza al arrancar** secretos débiles (`AUTH_SIGNING_KEY`, `BFF_API_SHARED_SECRET` con longitud/entropía mínimas, valores tipo `change_me`) — `config.py:131-201`.
- Rotación: `STORAGE_ENCRYPTION_KEYS` admite varias claves (`id:clave`); `AUTH_SIGNING_KEY` no tiene rotación sin invalidar sesiones (documentar procedimiento) — F07-22 (Baja).
- Las credenciales de usuario compartidas por chat en sesiones anteriores no se usaron ni se almacenaron (regla del proyecto).

## 6. Cadena de suministro

- Lockfiles versionados y verificados en CI; avisos altos de npm aceptados de forma explícita, con caducidad (`review_by: 2026-11-04`), alcance acotado a herramientas de desarrollo (braces, node-forge) y vigilancia semanal. `pip-audit` sobre `uv.lock` en el monitor.
- Faltan: SBOM, firmas/atestación de la imagen y revisión de dependencias en PR (`dependency-review-action`).
- `overrides` en `package.json` fijan `react`, `react-dom`, `vite`, `postcss` (parches de seguridad); revisar su vigencia periódicamente.

## 7. Lista de verificación de endurecimiento (priorizada)

1. (Antes de abrir) Cabeceras de seguridad web (F05-01), `permissions: contents: read` en `ci.yml` (F07-01), CodeQL + gitleaks (F07-03), observabilidad conectada (F07-18), simulacro de restauración real (F07-19).
2. (Antes de abrir) Fijar SHAs de acciones y digest de la imagen (F07-02, F07-11), Dependabot/CODEOWNERS/SECURITY.md (F07-06).
3. (Cuando haya tráfico) Timeouts de CI, HEALTHCHECK, límites de concurrencia, réplicas, escaneo de imagen y SBOM.

## 8. Limitaciones

- No se ejecutó CI en GitHub Actions desde esta auditoría ni se consultó la configuración de ramas/seguridad de GitHub (no hay herramienta para ello en este entorno).
- Sin daemon de Docker: no se construyó la imagen ni se escaneó; el análisis del `Dockerfile` es estático.
- No hay cuentas de Render/Neon/R2/Resend/EAS: los hallazgos F07-16…F07-20 se derivan de la configuración declarativa y de la documentación, no de los servicios en ejecución.
