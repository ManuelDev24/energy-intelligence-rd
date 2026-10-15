# Auditoría 01 — Descubrimiento del monorepo Energy RD

**Modo:** solo lectura. No se modificó ningún archivo del repositorio, no se instalaron dependencias, no se tocó ninguna base de datos real y no se muestran valores de secretos.
**Árbol auditado:** `Dev` @ `5e761c6` (11-oct-2026), 0 cambios sin confirmar, 1 109 archivos versionados.
**Alcance de la evidencia:** lo que se pudo comprobar leyendo el repositorio y ejecutando comprobaciones locales de solo lectura. Cada afirmación lleva archivo y línea cuando aplica; lo no verificado está en §10.

---

## 1. Resumen ejecutivo

El repo es un monorepo npm (workspaces) con **web Next.js 15**, **móvil Expo 57 / React Native 0.86**, **API FastAPI (Python 3.12)** sobre **PostgreSQL 16** y tres paquetes TypeScript compartidos. Las tecnologías esperadas están presentes y las versiones coinciden con lo declarado, salvo las diferencias de §9.

Lo que está bien establecido (verificado):
- Capas respetadas donde hay guardas automáticas: servicios sin FastAPI, cálculos sin ORM, routers sin transacciones y paquetes sin importar de apps (`scripts/check_architecture.py`, pasa).
- Autorización por vivienda centralizada (`authorize_home`) y un inventario de rutas privadas que falla si una ruta nueva no se prueba.
- Guardas de configuración de producción/staging que fallan al arrancar (`backend/api/app/config.py:131-201`).
- Contratos generados desde Pydantic (OpenAPI → Zod) con comprobación `contracts:check`.

Riesgos iniciales que más urgen profundizar (detalle en §8): **no hay RLS ni roles de base de datos separados**, **FastAPI publica `/docs` y `/openapi.json` sin condición de entorno**, **el CI no declara `permissions:` ni fija acciones por SHA**, **la web no define CSP ni cabeceras de seguridad**, **`app.json` no registra el plugin de `expo-image-picker`** aunque la app usa cámara, **el README contradice la realidad** (dice que no hay autenticación, OCR ni almacenamiento) y **la autenticación está apagada por defecto**.

Estos son *riesgos iniciales a confirmar*, no vulnerabilidades demostradas: ninguno se ha explotado ni reproducido en esta fase.

---

## 2. Tabla de aplicaciones y tecnologías

| Unidad | Ruta | Tecnología y versión (declarada) | Notas |
|---|---|---|---|
| Web | `frontend-web/app` | Next.js `^15.1.0`, React `19.2.3`, TypeScript `^5.7.2`, Tailwind `^3.4.17`, React Query `^5.62`, Recharts `^3.10.1`, Zod `^3.24.1`, Sentry browser `10.40.0` | BFF en `src/app/api/bff/[...path]`, `src/middleware.ts`; E2E con Playwright `1.63.0` |
| Móvil | `frontend-mobile/app` | Expo `~57.0.27`, React Native `0.86.3`, React `19.2.3`, TypeScript `~6.0.3`, React Navigation 7, React Query `^5.104`, Zustand `^5.0.15`, `expo-secure-store 57.0.4`, `expo-notifications`, `expo-image-picker`, `expo-document-picker` | `bundleIdentifier`/`package`: `do.energyrd.app`; EAS con perfiles `development/preview/production` |
| API | `backend/api` | Python `>=3.12,<3.13` (venv 3.12.3), FastAPI `>=0.115`, SQLAlchemy `>=2.0.30,<2.1`, Alembic `>=1.13`, psycopg 3, Pydantic 2, Argon2, PyJWT, cryptography `>=50`, boto3, pytesseract, Pillow, pypdfium2, sentry-sdk | `package = false` (sin empaquetar); lock en `uv.lock` |
| Paquete `core` | `packages/core` | TypeScript puro, **0 dependencias** | Formato, calidad del dato, tokens, lógica de presentación compartida |
| Paquete `api-contracts` | `packages/api-contracts` | Zod generado (`src/generated.ts`) + `openapi.json` | Generado por `backend/api/scripts/generate_contracts.py` |
| Paquete `api-client` | `packages/api-client` | Cliente tipado con validación runtime (Zod) | Depende de `api-contracts` |
| Base de datos | — | PostgreSQL 16 (compose `postgres:16-alpine`); **31 tablas**, **24 migraciones** (`0001…0023`) | Extensión `btree_gist` (restricciones de exclusión) |
| Infra | `docker-compose.yml`, `render.yaml`, `backend/api/Dockerfile`, `infrastructure/` | Docker Compose (postgres, api, migrate, worker), Render Blueprint (staging/production) | Neon (PostgreSQL gestionado) y S3/R2 según `docs/deploy/` |
| CI | `.github/workflows/ci.yml`, `deps-monitor.yml` | GitHub Actions | 4 jobs en `ci.yml` + monitor semanal de dependencias |

Tamaño aproximado (archivos versionados): `frontend-mobile/app` 274, `backend/api` 244, `frontend-web/app` 239, `docs/qa` 163, `.agents/skills` 82, `packages` 48. Código: ~24 700 líneas de Python, ~32 900 de TS/TSX (sin generados ni locks).

---

## 3. Diagrama de arquitectura actual

```
                    ┌───────────────────────────┐        ┌───────────────────────────┐
                    │  Navegador (frontend-web/app)      │        │  Teléfono (frontend-mobile/app)    │
                    │  Next.js 15 · React 19     │        │  Expo 57 · RN 0.86         │
                    │  middleware.ts (gate)      │        │  SecureStore (tokens)      │
                    └────────────┬──────────────┘        └──────────────┬────────────┘
        cookies httpOnly +       │  /api/bff/*  (BFF, lista blanca      │  Bearer (access) +
        época + origen (CSRF)    │  estricta, valida contrato)          │  refresh rotatorio
                                 ▼                                      │
                    ┌───────────────────────────┐                       │
                    │  BFF (route handler Next)  │                       │
                    │  src/lib/auth/bff.ts       │                       │
                    └────────────┬──────────────┘                       │
                                 │  HTTPS (prod) · Bearer                │
                                 ▼                                       ▼
                    ┌──────────────────────────────────────────────────────────────┐
                    │  API  backend/api  (FastAPI, Python 3.12, uvicorn)           │
                    │  api/v1/*  ──▶  services/*  ──▶  models (SQLAlchemy)          │
                    │  authorize_home (membresía)   schemas (Pydantic = contrato)   │
                    │  middleware: contexto de petición + CORS                      │
                    └───────┬─────────────────────┬───────────────────────┬────────┘
                            │ SQL (psycopg3)      │ jobs en PostgreSQL     │ HTTPS
                            ▼                     ▼                        ▼
                    ┌───────────────┐   ┌──────────────────┐   ┌───────────────────────────┐
                    │ PostgreSQL 16 │   │ Worker (mismo     │   │ Externos: Resend (correo), │
                    │ (un solo rol) │◀──│ código, perfil    │   │ Expo Push, S3/R2 (docs     │
                    └───────────────┘   │ "jobs")          │   │ cifrados), Sentry          │
                                        │ OCR Tesseract    │   └───────────────────────────┘
                                        └──────────────────┘

   Generación de contratos:  Pydantic ──▶ openapi.json ──▶ packages/api-contracts (Zod) ──▶ api-client ──▶ web + móvil
```

Observación clave: el **BFF solo protege a la web**; el móvil habla directo con la API. Ambos dependen de que la API vuelva a validar todo.

---

## 4. Mapa de dependencias (imports reales)

```
frontend-web/app        ──▶ @energyrd/api-client, @energyrd/api-contracts, @energyrd/core
frontend-mobile/app     ──▶ @energyrd/api-client, @energyrd/api-contracts, @energyrd/core
@energyrd/api-client     ──▶ @energyrd/api-contracts
@energyrd/core           ──▶ @energyrd/api-contracts   (solo tipos)
@energyrd/api-contracts  ──▶ (nada)
```
- Sin ciclos entre paquetes y **ningún paquete importa de `apps/` ni de `services/`** (comprobado con `git grep`).
- Backend: `api/v1` → `services` → `models`; no hay imports de FastAPI en `services/` ni commit/rollback en routers (comprobado con `git grep` y por `check_architecture.py`).
- Dependencia no tipada entre Python y TypeScript: el contrato (`generate_contracts.py` → `generated.ts`), protegido por `contracts:check`.

---

## 5. Inventario

### 5.1 API (86 operaciones, 64 rutas — de `packages/api-contracts/openapi.json`)
| Grupo | Operaciones |
|---|---|
| `/` , `/health`, `/health/live` | 3 (públicas) |
| `/api/v1/auth/*` (registro, login, refresh, logout, recuperación, cambio de contraseña, sesiones, preferencias, export, dispositivos push) | 17 |
| `/api/v1/homes` y `/{id}` | 5 |
| `/api/v1/homes/{home_id}/…` (facturas, lecturas, consumo, metas, equipo, alertas, anomalías, recomendaciones, energy-score, apagones, documentos, compartir, perfil/contrato…) | 58 (todas bajo `authorize_home`) |
| `/api/v1/invitations/accept`, `/api/v1/tariffs`, `/api/v1/legal` | 1 + 1 + 1 (sesión / públicas) |

### 5.2 Tablas (31)
`users, auth_sessions, refresh_tokens, password_reset_tokens, auth_abuse_buckets, homes, home_members, home_invitations, contracts, bills, bill_items, bill_snapshots, meter_readings, equipment, alert_settings, alerts, anomalies, recommendations, power_outages, home_goals, documents, document_ocr, storage_deletions, jobs, notifications, notification_preferences, device_tokens, tariffs, tariff_blocks, tariff_fixed_charges, audit_events`.

### 5.3 Integraciones externas
Resend (correo), Expo Push, S3/R2 (originales de factura, cifrados con AES-GCM), Sentry (opcional), Tesseract local (OCR). Sin pagos, sin webhooks entrantes, sin Redis en uso (el compose lo menciona como opcional).

### 5.4 Pruebas
| Área | Archivos de prueba |
|---|---|
| API (pytest) | 58 |
| Web (vitest) | 77 |
| Móvil (vitest, lógica + estructura; sin render RN) | 66 |
| core / api-client / api-contracts | 8 / 11 / 4 |
| E2E web (Playwright, 61 pruebas) | 9 specs |
| Flujos nativos (Maestro) | `frontend-mobile/app/maestro/*.yaml` (no ejecutables aquí) |

---

## 6. Comandos verificados en esta fase

| Comando | Resultado en esta auditoría |
|---|---|
| `npm run typecheck` (raíz) | **OK** (exit 0) |
| `python3 scripts/check_architecture.py` | **OK** |
| `npm run contracts:check` | **OK** (exit 0) |
| `git diff --check` | **OK** |

Comandos documentados cuya ejecución **se verificó antes en esta sesión sobre el mismo contenido** (no se repitieron aquí por coste): `npm test` (core 85, contratos 17, cliente 66, web 816 + 5 omitidas, móvil 541 + 11 omitidas), `npm run lint --workspace frontend-web/app`, `npm run build --workspace frontend-web/app` (con `NEXT_PUBLIC_AUTH_ENABLED=true API_BASE_URL=https://… WEB_ORIGIN=https://…`), `uv run pytest` (1 082 pruebas, requiere PostgreSQL), `alembic upgrade head` / `downgrade` / `alembic check`, `npm run e2e` (61 pruebas, requiere PostgreSQL local y Chromium).
**No verificables aquí:** `docker compose …` (no hay daemon), builds nativos iOS/Android, Maestro, `eas build`, despliegue en Render.

Instalación/ejecución según el repo: `npm ci` · `cp .env.example .env` · `SEED_PILOT=true docker compose up -d --build --wait postgres api` · `npm run dev:web` · `npm run dev:mobile` · `npm run db:migrate`.

---

## 7. Cómo se ejecuta, prueba y despliega

| Unidad | Ejecutar | Probar | Desplegar (según `render.yaml` / docs) |
|---|---|---|---|
| API | `uvicorn app.main:app` (Docker: `docker-entrypoint.sh`; valida `settings` antes de migrar) | `uv run pytest` (PostgreSQL de pruebas aislado, nombre protegido por `tests/db_safety.py`) | Render (Docker) · staging = rama `Dev`, producción = `main` con auto-deploy apagado; migración como paso único (`preDeployCommand` en producción) |
| Worker | `python -m app.worker` (perfil `jobs`) | cubierto en pytest | servicio aparte en Render (según blueprint) |
| Web | `next dev` / `next start` | `vitest` + Playwright | Render (según blueprint); el build de producción **falla cerrado** sin `NEXT_PUBLIC_AUTH_ENABLED=true` y HTTPS (`next.config.mjs:6-15`) |
| Móvil | `expo start` | `vitest`; Maestro manual | EAS Build/Submit (`eas.json`); `EXPO_PUBLIC_API_URL` debe ser HTTPS fuera de `__DEV__` (`src/config.ts`) |
| Base de datos | `docker compose` (local) / Neon (staging/prod) | pytest + `alembic check` | migraciones con Alembic; respaldo/restauración con `scripts/*.sh` (simulacro documentado, no probado contra producción) |

---

## 8. Riesgos iniciales (a confirmar en las auditorías 03–08)

| ID | Sev. inicial | Riesgo | Evidencia | Auditoría que lo cierra |
|---|---|---|---|---|
| R-01 | **Alta** | **Sin RLS ni roles separados**: ninguna política `ROW LEVEL SECURITY`, `GRANT` ni `CREATE ROLE` en migraciones, scripts o docs. Todo el aislamiento entre viviendas depende de la capa de aplicación (`authorize_home`) y de filtrar por `home_id`. Un único rol de base de datos hace todo (migrar y servir). | `git grep` sin coincidencias; `backend/api/app/api/auth_deps.py:42-61` | 04, 03 |
| R-02 | **Alta** | **Autenticación apagada por defecto**: `AUTH_ENABLED=False` y `ENVIRONMENT="development"` por defecto; si un despliegue omite `ENVIRONMENT`, queda en modo piloto sin autenticación (toda la API abierta). Las guardas solo se activan cuando `ENVIRONMENT` ∈ {production, staging} o ≠ development. | `backend/api/app/config.py:21-22`, `:177-178`; `auth_deps.py:25-26` | 03, 06, 07 |
| R-03 | Media | **Documentación interactiva expuesta**: `FastAPI(...)` no deshabilita `/docs`, `/redoc` ni `/openapi.json` en ningún entorno. | `backend/api/app/main.py:19-23` | 06 |
| R-04 | Media | **CI sin `permissions:` global ni acciones fijadas por SHA** (`@v4`, `@v6`); `GITHUB_TOKEN` hereda los permisos por defecto del repositorio. | `.github/workflows/ci.yml` (sin `permissions`; `uses:` en líneas 35, 53, 91…); `deps-monitor.yml:13` sí declara | 07 |
| R-05 | Media | **La web no define CSP ni cabeceras de seguridad** (`Content-Security-Policy`, `X-Frame-Options`/`frame-ancestors`, HSTS, `Referrer-Policy`); `next.config.mjs` no tiene `headers()`. | `frontend-web/app/next.config.mjs` (sin `headers`); `git grep` sin coincidencias en `frontend-web/app/src` | 05 |
| R-06 | Media | **Móvil: faltan los plugins de permisos** — la app usa cámara/galería/archivos pero `app.json` solo registra `expo-notifications`; puede faltar `NSCameraUsageDescription`/`NSPhotoLibraryUsageDescription` (rechazo en App Store o cierre en iOS) y permisos Android. Tampoco se fija `allowBackup`. | `frontend-mobile/app/app.json:32`; `src/features/bills/BillOcrScreen.tsx:20-33` | 05 |
| R-07 | Media | **README desactualizado y contradictorio**: afirma que "no tiene autenticación" y que "no hay … OCR … ni almacenamiento de archivos", cuando ambos existen. `findings.md:10` conserva la descripción de "esqueletos". | `README.md:5`, `:17`; `findings.md:10` | 01 → corrección en 09 |
| R-08 | Baja | **`workspaces` incluye `mcp/*`**, carpeta inexistente; `engines.node` exige `>=24 <25` pero el entorno local es Node 22 y `deps-monitor.yml` usa Node 22 (CI principal usa 24). Las pruebas locales corrieron en un runtime fuera de `engines`. | `package.json:28`, `:47-49`; `deps-monitor.yml:24` | 07, 08 |
| R-09 | Baja | **Imagen base y herramienta sin fijar por digest**: `python:3.12-slim`, `ghcr.io/astral-sh/uv:0.9`; el `Dockerfile` no define `HEALTHCHECK` (sí el compose). `USER app` sí está definido. | `backend/api/Dockerfile:1,3,25` | 07 |
| R-10 | Baja | **Credencial de desarrollo en el código por defecto**: la URL de base de datos por defecto usa una contraseña local de desarrollo; las guardas de producción la rechazan, pero está en el repo. | `backend/api/app/config.py:10`; `.env.example`; `docker-compose.yml:8,27` | 03 |
| R-11 | Baja | **Lógica duplicada web ↔ móvil**: `rd-time.ts`/`rdTime.ts` (53/54 líneas), `format.ts` y funciones con el mismo nombre (`inclusiveDays`, `todayRD`, `coveragePct`, `bucketLabel`, `consumptionSummary`, `ocrErrorText`…). Candidatas a `packages/core`. | `frontend-web/app/src/lib/rd-time.ts` ↔ `frontend-mobile/app/src/lib/rdTime.ts` | 02 |
| R-12 | Baja | **Ruido en el repositorio**: 82 archivos de skills de agentes (`.agents/skills`) y 149 imágenes de evidencia QA versionadas dentro del repo de producto (32 MB de `.git`). Revisar si alguna captura contiene datos personales. | `git ls-files .agents`; `docs/qa/evidence/**` | 03, 04 |
| R-13 | Baja | **`--no-proxy-headers` deliberado** en uvicorn: detrás de un proxy (Render) la IP de cliente que ve la API es la del proxy; afecta a los límites por IP si no se compensa. | `backend/api/docker-entrypoint.sh` (última línea); `AUTH_ABUSE_PROTECTION.md` | 06 |
| R-14 | Info | **Sin RLS, la prueba de aislamiento depende de pruebas**: existe el inventario `test_private_route_inventory_remains_covered` y 58 archivos de prueba API; falta una prueba que ejerza el aislamiento con un rol de base de datos distinto. | `backend/api/tests/test_authorization.py` | 04 |

Búsquedas sin hallazgos (ayudan a acotar): patrones de claves de alta confianza (AWS, PEM, `sk-`, `ghp_`, JWT) **solo aparecen en archivos de prueba**; no hay `.env`, `.pem`, `.p12`, `.keystore` ni credenciales versionados (solo los dos `.env.example`); no hay `__pycache__`, `.next`, `node_modules` ni `tsbuildinfo` versionados. Alcance: **solo el árbol actual, no el historial de Git** (ver §10).

---

## 9. Diferencias entre lo documentado y lo real

| Documento | Dice | Realidad |
|---|---|---|
| `README.md:5` | "El piloto es privado y no tiene autenticación" | Existe autenticación completa (registro, sesiones, recuperación, BFF); solo el *modo piloto local* la desactiva |
| `README.md:17` | "No hay … OCR … ni almacenamiento de archivos" | Existen OCR (Tesseract), originales cifrados (S3/R2) y cola de trabajos |
| `README.md:21` | Node.js 24 | `engines` exige 24; el entorno de esta sesión usa 22 |
| `findings.md:10` | "Mobile y API son esqueletos" | Marcado después como histórico (`:18`), pero la sección sigue ahí |
| `docs/REMAINING_WORK_ORDERED.md` | Lista de 13 tareas del MVP | Declarado histórico en su cabecera; el estado vigente está en `COMPLETE_PROJECT_GAP_ANALYSIS_2026-10-10.md` |
| `package.json` workspaces | `mcp/*` | La carpeta no existe |

---

## 10. Limitaciones: lo que NO pudo verificarse

- **Historial de Git**: no se buscaron secretos en commits antiguos (solo el árbol actual).
- **Configuración remota de GitHub**: protección de ramas, secretos de repositorio, permisos por defecto de Actions, revisiones obligatorias.
- **Infraestructura real**: Render, Neon, bucket S3/R2, DNS, TLS, variables de entorno de staging/producción, backups reales y simulacros de restauración (solo hay scripts y documentación).
- **Dependencias**: no se ejecutó `npm audit` / `pip-audit` aquí (requiere red); la vigilancia existe en `deps-monitor.yml` y `docs/security/accepted-advisories.json`, pero no se evaluó su vigencia hoy.
- **Docker**: no hay daemon; compose y Dockerfile solo se leyeron.
- **Móvil nativo**: sin builds iOS/Android, sin emulador y sin Maestro; permisos reales y comportamiento en dispositivo sin comprobar.
- **Ejecución dinámica de la API contra un cliente hostil**: no se hizo en esta fase (corresponde a las auditorías 03 y 06, en entorno autorizado).
- **Cobertura y rendimiento**: no se midieron.
- Las cifras de líneas de código y de archivos son aproximadas (`git ls-files`).

---

## 11. Áreas y archivos que requieren auditoría profunda

| Prioridad | Área | Archivos |
|---|---|---|
| 1 | Autenticación, sesiones, recuperación, abuso | `backend/api/app/services/auth.py`, `auth_abuse.py`, `password_recovery.py`, `api/v1/auth.py`, `api/auth_deps.py` |
| 1 | Aislamiento por vivienda / BOLA | `api/auth_deps.py`, `services/transactions.py`, todos los `api/v1/*.py` y sus servicios |
| 1 | Base de datos sin RLS | `app/models/*`, `app/alembic/versions/*`, `app/database.py`, roles de Neon |
| 1 | BFF web | `frontend-web/app/src/lib/auth/bff.ts` (546 líneas), `src/middleware.ts`, `next.config.mjs` |
| 2 | Almacenamiento y OCR | `backend/api/app/services/storage/*`, `document_storage.py`, `ocr/*`, `api/v1/documents.py` |
| 2 | Móvil: sesión y permisos | `frontend-mobile/app/src/auth/*`, `app.json`, `eas.json`, `src/notifications/push.ts`, `BillOcrScreen.tsx` |
| 2 | CI/CD y despliegue | `.github/workflows/*`, `render.yaml`, `backend/api/Dockerfile`, `docker-entrypoint.sh`, `infrastructure/deploy/check_deploy_config.py` |
| 3 | Privacidad y retención | `data_export.py`, `account.py`, `audit.py`, `docs/legal/*_DRAFT.md` |
| 3 | Telemetría y logs | `observability.py`, `packages/core/src/telemetry.ts`, `frontend-web/app/src/lib/telemetry.ts` |

---

## 12. Siguientes pasos de auditoría (priorizados)

1. **Prompt 04 (BD y privacidad) antes que el 03**: R-01 y R-14 cambian el modelo de amenazas; conviene saber con evidencia cómo se aísla cada tabla antes de calificar las 20 leyes.
2. **Prompt 03 (seguridad / 20 leyes)**, con R-02, R-03 y R-10 como primeras hipótesis a confirmar (¿qué pasa si falta `ENVIRONMENT` en un despliegue?).
3. **Prompt 06 (backend y API)**: tabla de las 86 operaciones con autenticación, autorización y validación; revisar `--no-proxy-headers` frente al límite por IP (R-13).
4. **Prompt 05 (web, Android, iOS)**: CSP/cabeceras (R-05), plugins y permisos móviles (R-06), `allowBackup`, deep links (`scheme: energyrd`).
5. **Prompt 07 (DevSecOps)**: `permissions:` y pines (R-04), imagen base (R-09), configuración remota de GitHub y Render (hoy no verificable).
6. **Prompt 02 (arquitectura)** puede ir en paralelo: R-11 y el tamaño de `bff.ts`.
7. **Prompt 08 (QA/rendimiento)** al final de la fase de lectura, con objetivos definidos antes de medir.
8. **No ejecutar el Prompt 09** hasta aprobar el backlog de hallazgos.

*Este informe no es una certificación de seguridad ni de cumplimiento. Es un inventario con riesgos iniciales por confirmar.*
