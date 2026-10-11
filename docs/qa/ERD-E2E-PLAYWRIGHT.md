# ERD-E2E-PLAYWRIGHT — E2E web contra PostgreSQL, API y worker reales

Suite en `apps/web/e2e/` (Playwright 1.63, Chromium). **Nada se simula**: cada corrida crea una base PostgreSQL exclusiva
(`energy_rd_e2e`), aplica **todas las migraciones desde vacío**, levanta la API (`uvicorn`), el worker de trabajos y la
web (`next dev`), ejecuta las pruebas y lo apaga todo, borrando la base.

## Cómo correrla

| Qué | Comando |
|---|---|
| Todo (regresión) | `npm run e2e` |
| Solo humo (`@smoke`, 4 recorridos) | `npm run e2e:smoke` |
| Instalar el navegador | `npm run e2e:install --workspace apps/web` |
| Chromium propio (entornos sin descarga) | `E2E_CHROMIUM_PATH=/ruta/chrome npm run e2e` |
| Otra base / puertos | `E2E_DATABASE_URL`, `E2E_API_PORT`, `E2E_WEB_PORT` (el nombre de la base debe terminar en `_e2e` y ser local) |

Requisitos: PostgreSQL local, `uv`, Node 24, Tesseract (para el recorrido OCR).

## Aislamiento y seguridad

- `scripts/e2e_prepare.py` **se niega** a operar si la base no termina en `_e2e` o el host no es local: nunca toca la base del piloto.
- Puertos propios (API 18101, web 3101); claves de firma/cifrado aleatorias por corrida; correo en un *outbox* de archivo (no sale ningún correo); telemetría desactivada.
- Fixtures deterministas e idempotentes: 5 viviendas piloto sembradas con `seed_pilot` + una persona de pruebas `@example.com`; el resto de cuentas se crean por prueba con correo aleatorio. Factura sintética generada por código (sin datos personales).
- `workers: 1` (una base compartida), `forbidOnly`, sin esperas fijas (solo `expect`/`waitFor` con condición), selectores por rol/etiqueta o `data-testid`.
- Trazas, capturas y video **solo si falla** una prueba. En CI se ejecuta `scripts/scrub_e2e_artifacts.py` (probado en `tests/test_e2e_scrub.py`): redacta tokens, cookies, contraseñas y correos de las trazas, descarta cuerpos de red/capturas internas y **borra los videos** antes de subir el artefacto (retención 7 días, solo en fallo).

## Cobertura (46 pruebas)

| Spec | Recorridos |
|---|---|
| `01-auth` | registro con términos obligatorios; correo repetido/contraseña corta; login/logout y credencial errónea; vencimiento sin renovación silenciosa (decisión de diseño); rotación del refresh en la API real y rechazo del viejo; cookies `httpOnly` y sin tokens para JS; recuperación de contraseña por correo de un solo uso; correo inexistente sin enumeración; cambio de contraseña |
| `02-homes` | cuenta nueva sin viviendas del piloto; onboarding de 6 etapas; datos persistidos (perfil, contrato, meta); segunda vivienda y alternancia; validaciones; la cuenta de pruebas ve exactamente las 5 piloto; una persona ajena no las ve ni por el BFF |
| `03-bills` | factura manual (vacío, validación, alta, historial, detalle); período solapado rechazado; editar/eliminar con confirmación; **OCR real**: foto → progreso → borrador → confirmar guarda UNA factura con su original; archivo ilegible sin crear nada |
| `04-insights` | panel piloto (etiquetas de calidad, alerta crítica, proyección, recomendación); consumo por factura y por lecturas, sin inventar datos; metas (guardar, recordar, rechazar inválida); equipos (tipo/marca/modelo/icono, reparto 100 %, editar/eliminar); alertas (crear, leer, descartar, vacío) |
| `05-profile-share-authz` | perfil y preferencias de aviso; sesiones activas; compartir (invitar → correo → aceptar → expulsar; invitación revocada); autorización entre personas (B no lee ni modifica lo de A), 401 sin sesión y protección CSRF por origen |
| `06-states-keyboard` | estados loading / vacío / error + Reintentar / red caída; teclado: login solo con Tab+Enter, foco al primer campo inválido, «Saltar al contenido», menú principal, diálogo con foco atrapado, Escape y retorno del foco |

## Evidencia de la corrida

- Dos corridas consecutivas **desde cero** (sin `E2E_REUSE`): `46 passed` (4,7 min) y `46 passed` (4,8 min); 0 reintentos (`flaky` = 0).
- Al terminar: base `_e2e` eliminada, sin procesos residuales.
- `tsc --noEmit`, `eslint` y `vitest` (772 pruebas) de la web siguen en verde con la suite incluida; `check_architecture` y `git diff --check` limpios; sin `.only`, `skip` ni `fixme`.
- CI: job `e2e web` en `.github/workflows/ci.yml` (obligatorio: corre en cada push/PR a Dev, QA y main, tras `api`), con servicio PostgreSQL, Chromium instalado con dependencias y publicación de diagnósticos depurados solo en fallo.

## Límites honestos

- Se usa `next dev` porque la configuración de producción de la web exige `API_BASE_URL` HTTPS; la suite prueba el comportamiento de la app, no el build de producción (eso lo cubre el job `web-mobile`).
- Solo Chromium de escritorio; no hay proyecto móvil/WebKit.
- Los flujos nativos (Maestro) siguen fuera de este alcance y bloqueados por su propio entorno.
