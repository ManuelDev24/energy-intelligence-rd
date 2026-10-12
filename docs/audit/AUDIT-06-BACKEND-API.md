# AUDIT-06 — Backend Python / FastAPI / contratos API

Modo: solo lectura. Rama `Dev` @ `5e761c6`. Servicio `services/api` (FastAPI 0.142.2, Python 3.12, SQLAlchemy 2, Alembic 0001–0023).
Método: introspección real de rutas (recorrido recursivo de `_IncludedRouter`), lectura de código, y una sonda local acotada (API temporal en puerto 18224, almacenamiento en `/tmp`, ya detenida y borrada).

## 1. Inventario de endpoints (87 operaciones: 86 en OpenAPI + `GET /documents/download` oculta)

| Grupo | Ops | Autenticación | Autorización | Validación de entrada | Respuesta tipada |
|---|---|---|---|---|---|
| `/auth/*` (registro, login, refresh, logout, reset, sesiones, dispositivos, export, borrado de cuenta, preferencias) | 17 | Públicas: register, login, refresh, logout, password/forgot, password/reset (6). Resto Bearer + sesión verificada en BD | Solo sobre el propio usuario (`current_user`); sesión ajena → 404 | Pydantic; `forbid` solo en parte | `TokensOut`, `UserOut`, `NotificationPreferencesOut`; `sessions` devuelve lista |
| `/homes` (CRUD hogar) | 5 | Bearer | `list`/`create` por usuario; `{home_id}` vía `authorize_home` (membresía + `FOR UPDATE` en escritura); `DELETE` solo propietario | Pydantic | `HomeOut` |
| `/homes/{id}/bills/*` (CRUD, items, payment, validate, ocr, ocr-jobs) | 13 | Bearer | `authorize_home` | Pydantic + límites de subida | `BillOut`, `OcrJobOut`, `OcrDraft` |
| `/homes/{id}/{readings,equipment,goal,contract,outages,alerts,anomalies,alert-settings}` | 27 | Bearer | `authorize_home` | Pydantic | Modelos tipados |
| `/homes/{id}/{dashboard,consumption,energy-score,recommendations}` | 6 | Bearer | `authorize_home` | Pydantic / query con límites | Modelos tipados |
| `/homes/{id}/documents` + `download-url` | 5 | Bearer | `authorize_home` | Límites de tamaño por tipo, magic bytes | `DocumentOut`, `DownloadUrlOut` |
| `/homes/{id}/{members,invitations,transfer-ownership}` + `/invitations/accept` | 8 | Bearer | `require_home_owner` en listar/crear/revocar/transferir; `members/me` por membresía | Pydantic | Modelos tipados |
| `/tariffs`, `/legal`, `/health`, `/health/live`, `/` | 5 | Públicas | n/a (datos públicos) | Query con límites | Tipado |
| `GET /documents/download` (oculta del esquema) | 1 | Pública con **token firmado de un solo uso** | `redeem_download` revalida membresía | Token | Binario (`Cache-Control: no-store`) |

Detalle de las 87 filas (método, ruta, auth, autorización, cuerpo, esquema, sync/async, nº de referencias en tests) generado en `/tmp/endpoints.tsv`.

Hallazgos de la matriz:
- **0 rutas privadas sin autenticación:** 75 operaciones exigen Bearer (61 de ellas bajo `/homes/{home_id}`) y 12 son públicas por diseño: 6 de `/auth` (register, login, refresh, logout, password/forgot, password/reset), `GET /documents/download` (token firmado), `/`, `/health`, `/health/live`, `/legal`, `/tariffs`.
- **0 rutas sin al menos una referencia en tests** (columna de cobertura ≥ 1 en las 87).
- **Escritura “de miembro” vs “de propietario”:** `PATCH /homes/{id}` y `PUT .../contract|goal|alert-settings` los puede ejecutar cualquier miembro. Es una decisión de producto (hogar compartido), no un defecto, pero debe quedar documentada (ver F06-09).

## 2. Autorización y objetos ajenos (IDOR)

- Patrón uniforme: `authorize_home(home_id, user)` → 404 si no es miembro (no 403: no filtra existencia). Escrituras toman `FOR UPDATE` sobre `homes` (serializa cambios concurrentes por hogar).
- Recursos hijos (`bill_id`, `equipment_id`, `document_id`, `outage_id`, …) se resuelven **dentro del `home_id` ya autorizado** (consulta con `home_id` + `id`), por lo que un `id` de otro hogar devuelve 404. Verificado en servicios y por los tests de aislamiento (`test_isolation`, `test_documents`, `test_sharing`).
- Descarga de documentos: dos pasos (`POST download-url` autenticado → token firmado de un solo uso → `GET /documents/download`), y el canje **revalida la membresía** en ese momento (`services/document_storage.py:103-124`): un usuario expulsado no puede canjear un token viejo.
- `AUTH_ENABLED=False` (valor por defecto) es solo para desarrollo; `config.py:131-201` lo rechaza en `staging`/`production`.

## 3. Validación de entrada y contratos

- **Contrato OpenAPI → Zod** (`generate_contracts.py` + `packages/api-contracts`): generado y verificado en CI; no hay deriva manual.
- `extra="forbid"` solo en **20 de 83 modelos Pydantic**. Los modelos de entrada sin `forbid` aceptan y **descartan en silencio** campos desconocidos (p. ej. un cliente que envía `role` en un payload que no lo contempla no obtiene error). No hay riesgo de *mass-assignment* porque los servicios asignan campo a campo, pero el contrato es menos estricto de lo que parece.
- Campos de texto sin `maxLength` en el esquema: en su mayoría decimales-como-cadena y enums (`BillCreate.kwh/amount_dop`, `EquipmentIn.power_w/hours_per_day`, `ReadingCreate.reading_kwh`, `GoalIn.*`); Pydantic los acota con `ge/le`, `max_digits` y `decimal_places` (cadenas enormes fallan en la validación), por lo que el riesgo real es bajo, pero el esquema público no lo refleja.
- Subidas: `POST /documents` y `POST /bills/ocr-jobs` leen con tope `read(limit+1)` (acotado, **probado local**: JPEG de 3,1 MB → 201 en 0,08 s; 60 MB → 422 en 0,4 s sin agotar memoria). **Excepción:** `POST /bills/ocr` (ruta síncrona heredada) hace `await file.read()` **sin tope** y compara después (`api/v1/bills.py:32-34`): el cuerpo completo se carga en memoria antes de rechazar (F06-02).

## 4. Listas y paginación

Con `limit` (≤500, por defecto 100) y `offset`: homes, bills, readings, equipment, outages, alerts, anomalies (≤100), recommendations (≤100), tariffs.
**Sin límite** (devuelven todo): `GET /auth/sessions`, `GET /homes/{id}/documents`, `GET /homes/{id}/invitations`, `GET /homes/{id}/members`. Hoy están acotadas por reglas de negocio (sesiones por usuario, invitaciones pendientes, miembros por hogar, documentos por hogar), excepto **documentos** que crece con el uso (F06-04).

## 5. Rendimiento y concurrencia (hallazgos de diseño; medición controlada en AUDIT-08)

- **Pool de BD pequeño frente al threadpool:** `DB_POOL_SIZE=5 + DB_MAX_OVERFLOW=5` = 10 conexiones máximas (`config.py:98-100`, `database.py:11-12`); las rutas `def` corren en el threadpool de AnyIO (40 hilos por defecto). Cada petición mantiene una sesión durante toda la petición (`Depends(get_db)`). Con >10 peticiones simultáneas, el resto espera hasta `DB_POOL_TIMEOUT=10 s` y luego falla con `TimeoutError` de SQLAlchemy → **500 genérico** (no 503/429).
- **Sin `statement_timeout` ni `lock_timeout` global:** solo `auth_abuse` los fija (`SET LOCAL … 2s/3s`). Una consulta lenta o un `FOR UPDATE` bloqueado retiene una conexión sin límite de tiempo.
- **OCR síncrono bloqueante en el bucle de eventos:** `POST /bills/ocr` es `async def` y llama a `extract_text()` (CPU/IO bloqueante, Tesseract) directamente (`api/v1/bills.py:26-37`): mientras corre, **todo el servidor** (todas las rutas) queda detenido. La versión de producción (`/ocr-jobs`) usa un worker aparte y devuelve 202, pero la ruta heredada sigue expuesta (F06-01).
- `POST /documents` y `POST /bills/ocr-jobs` son `async def` pero hacen trabajo sin `await` (cifrado, escritura a almacenamiento, inserción en BD) en el bucle de eventos; con archivos de hasta 10 MB el bloqueo es de decenas de ms, no crítico.
- Llamadas salientes (`push.py`, `email.py`) usan `httpx` con `timeout` explícito (10 s) y se ejecutan en `BackgroundTasks` (no bloquean la respuesta). Correcto.
- Operaciones idempotentes: recomendaciones/anomalías derivadas por `dedupe_key`; `PUT /auth/devices` idempotente; refresco de recomendaciones no duplica.

## 6. Errores y consistencia

- Middleware de contexto (`observability.py`): registra solo la **ruta** (sin query ni cuerpo), asigna `request_id`, convierte excepciones no controladas en JSON genérico 500 con `request_id` (sin trazas al cliente). Correcto.
- Errores de dominio (`services/errors.py`) mapeados de forma coherente: 404/409/422/429.
- **Documentación interactiva expuesta:** `FastAPI(...)` se crea sin `docs_url=None`/`openapi_url=None` (`main.py:19-23`), por lo que `/docs`, `/redoc` y `/openapi.json` quedan accesibles también en producción. No es un secreto (el contrato es público para el cliente), pero amplía la superficie y revela el mapa completo de rutas (F06-05, ya registrado como hallazgo de seguridad en AUDIT-03).
- CORS (`main.py:26-33`): lista de orígenes por configuración; en prod/staging el guard de `config.py` rechaza `*`.

## 7. Arquitectura backend (resumen; detalle en AUDIT-02)

- `scripts/check_architecture.py` hace cumplir que `services/` no importa FastAPI (verificado en CI). Capas: `api/` (HTTP) → `services/` (reglas) → `models/` (ORM). Un ciclo `equipment ↔ recommendations` se resolvió con importación diferida (aceptable, pero señal de acoplamiento).
- Archivos más grandes y con más responsabilidades: ver AUDIT-02.

## 8. Calidad y pruebas del backend

- 1 suite pytest grande (cientos de pruebas) con BD real de prueba. **No hay linter (ruff/flake8), tipado estático (mypy/pyright) ni medición de cobertura (`pytest-cov`)** en `pyproject.toml` ni en CI (F06-06). Por tanto “cobertura” solo puede afirmarse por referencias de rutas en tests (87/87), no por líneas.
- Pruebas de contrato OpenAPI y de migraciones (`test_migrations.py`, `test_openapi_contract.py`) existen.

## 9. Registro de hallazgos (Prompt 06)

| ID | Sev. | Hallazgo | Evidencia | Corrección sugerida |
|---|---|---|---|---|
| F06-01 | **Alta** | `POST /homes/{id}/bills/ocr` ejecuta OCR bloqueante dentro de `async def`: congela el bucle de eventos (DoS de disponibilidad por un solo usuario autenticado) | `app/api/v1/bills.py:26-37` | Retirar la ruta (ya existe `/ocr-jobs`) o ejecutar `extract_text` con `run_in_threadpool` + tope de concurrencia |
| F06-02 | Media | Lectura sin tope previo del cuerpo (`await file.read()`) en `/bills/ocr`; el límite de 10 MB se aplica después | `bills.py:32-34` | `read(MAX+1)` como en `/ocr-jobs` |
| F06-03 | Media | Pool BD 10 conexiones vs 40 hilos; agotamiento → 500 tras 10 s; sin `statement_timeout`/`lock_timeout` global | `config.py:98-100`, `database.py:11-12` | Subir pool acorde a hilos o limitar threadpool; fijar timeouts por sesión; mapear `TimeoutError` de pool a 503 + `Retry-After` |
| F06-04 | Baja | Listas sin `limit`: `/auth/sessions`, `/documents`, `/invitations`, `/members` | OpenAPI | Añadir `limit/offset` al menos en `/documents` |
| F06-05 | Baja | `/docs`, `/redoc`, `/openapi.json` habilitados en producción | `main.py:19-23` | `docs_url=None, redoc_url=None, openapi_url=None` cuando `ENVIRONMENT in {staging, production}` |
| F06-06 | Media | Sin ruff/mypy/pytest-cov en pyproject ni CI; cobertura de líneas desconocida | `pyproject.toml`, `.github/workflows/ci.yml` | Añadir ruff + mypy (gradual) + `--cov` con umbral inicial |
| F06-07 | Baja | `extra="forbid"` solo en 20/83 modelos; campos desconocidos se ignoran en silencio | grep en `app/schemas` | Base común `StrictModel` para entradas |
| F06-08 | Baja | Campos decimal-como-cadena: Pydantic sí los acota (`ge/le`, `max_digits`, `decimal_places`; p. ej. `EquipmentIn.power_w` `max_digits=10`), pero el esquema OpenAPI/Zod generado no los refleja como `maxLength`/`pattern`, por lo que los clientes generados no validan ese límite | `schemas/equipment.py:22-23`, OpenAPI | Exponer el límite en el esquema (`StringConstraints`/`json_schema_extra`) |
| F06-09 | Info | Escrituras de `home`/`contract`/`goal`/`alert-settings` abiertas a cualquier miembro (decisión de producto no documentada) | `api/v1/homes.py`, `contract.py`, `goal.py` | Documentar el modelo de roles (propietario/miembro) |

Sin hallazgos críticos en el backend. IDOR: sin evidencia en las rutas privadas por `home_id` (matriz de 3 roles × operaciones privadas bajo `/homes`, ver AUDIT-03 ley 4).

## 10. Limitaciones

- No se ejecutó carga sostenida ni pruebas de estrés (regla de la auditoría: sin DoS). Las medidas de latencia controlada están en AUDIT-08.
- La cobertura es por referencia de rutas, no por líneas (no hay herramienta instalada; no se instaló nada sin autorización).
- Rendimiento del OCR real depende de Tesseract/Poppler en el entorno de despliegue; aquí solo se verificó el comportamiento de límites con archivos sintéticos.
