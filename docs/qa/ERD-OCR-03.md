# ERD-OCR-03 — QA del backend de cola OCR administrativa

Worktree aislado: `/Users/macbookpro/.hermes/cache/scratch/erd-adm-rbac/integrated`
(base `origin/Dev` @ `5e761c6`). Solo backend (`services/api`); no se tocó
`apps/admin`, `package-lock.json` de raíz ni la base de datos de producción/piloto.

## Qué se construyó

- Reutiliza la cola existente `jobs` (`app/services/jobs/queue.py`) y el flujo OCR
  (`app/services/ocr/jobs.py`); **no** se creó una segunda cola.
- Nueva capa de solo lectura/operación administrativa: `app/services/admin_ocr.py`,
  expuesta en `app/api/v1/admin.py` bajo `/api/v1/admin/ocr/*`.
- Migración `0025_ocr_admin_fencing.py` (reversible): añade `jobs.generation`,
  `document_ocr.generation` y el estado terminal `cancelled` en ambas tablas
  (constraints CHECK actualizados). El `downgrade()` reclasifica `cancelled` →
  `dead`/`failed` para no perder datos y elimina las columnas de generación.
- Fencing por generación: todo cuerpo de trabajo (`ocr_jobs.process`, `_fail`)
  ahora exige `document_ocr.generation == generation` recibido del `Job.generation`
  antes de escribir cualquier resultado; un reintento/cancelación admin incrementa
  la generación, así que un worker en vuelo que termine tarde queda descartado
  (`"skipped"`), igual que el *fencing* por `attempts`/`locked_by` ya existente en
  `queue.complete`.

## Endpoints (`/api/v1/admin/ocr`)

| Método | Ruta | Scope | Descripción |
|---|---|---|---|
| GET | `/jobs` | `admin.ocr.read` | Lista paginada (`limit`,`offset`,`status`) con proyección saneada. |
| GET | `/jobs/{id}` | `admin.ocr.read` | Detalle de un trabajo (misma proyección saneada). |
| POST | `/jobs/{id}/retry` | `admin.ocr.retry` | Reintento manual, solo si `status=failed_retryable` o `dead_letter` con error reintentable. |
| POST | `/jobs/{id}/cancel` | `admin.ocr.review` | Cancela un trabajo en cola o en curso. |

Estados expuestos (proyección, nunca el estado crudo de `jobs`/`document_ocr`):
`queued`, `processing`, `completed`, `failed_retryable`, `failed_permanent`,
`dead_letter`, `cancelled`.

La proyección (`AdminOcrJobOut`) **nunca** incluye: `draft`, texto OCR, `storage_key`,
documento completo, PII del hogar o `last_error` crudo. Solo expone
`error_code` (únicamente los códigos ya públicos de `app/services/ocr/jobs.py`:
`engine_error`, `unreadable`, `protected_pdf`, `file_missing`).

## Motivo obligatorio y auditoría

- `retry`/`cancel` exigen `reason` (1–500 car.) y se validan en
  `app/schemas/admin.py::OcrOperationReason` (reutiliza `_reason`, compartida con
  `RoleAssignmentCreate/Revoke` de ERD-ADM-RBAC): rechaza vacío/solo-espacios,
  saltos de línea/control, `@`, URLs, las palabras
  `bearer|token|cookie|password|secret|clave|authorization` (insensible a mayúsculas)
  y cualquier secuencia de ≥7 dígitos (teléfonos/tarjetas). Esto es un filtro
  heurístico, **no** prueba ausencia de PII en prosa libre — ver "Brechas".
- Toda operación exitosa escribe una fila en `admin_audit_events` en la MISMA
  transacción que el cambio de estado (`action=ocr.retry`/`ocr.cancel`,
  `scope_used`, `reason` saneado, `request_id`, `metadata={job_id, generation}`).
  La tabla es inmutable (triggers de la migración 0024).
- El chequeo de scope (`admin_deps.require_scope`) audita bajo
  `action=scope.authorized` (antes `scope.check`) y **nunca** usa
  `action=role.assign`/`role.revoke`/`ocr.retry` para ese paso: un 403/200 de
  autorización no implica que la operación de negocio haya corrido o tenido éxito.

## Idempotencia, reintentos y colisiones

- `retry` es **no** idempotente a propósito: reintentar un trabajo ya `queued`
  devuelve 409 (evita doble encolado/doble auditoría). Verificado con llamadas
  concurrentes (`ThreadPoolExecutor`): solo una gana, solo una fila de auditoría.
- Un documento ya confirmado (`documents.bill_id IS NOT NULL`) o borrado nunca
  admite retry/cancel (409) — se bloquea con `SELECT ... FOR UPDATE` sobre
  `documents` antes de tocar `jobs`/`document_ocr`.
- El flujo de reintento manual del hogar (`ocr_jobs.retry`, usado por
  `api/v1/bills.py`) se dejó intacto para el caso normal, pero ahora respeta el
  estado del `Job` vigente (no borra un trabajo `running`/`queued`) para no
  pisar un reintento admin ya en curso.

## Pruebas (TDD RED→GREEN)

`services/api/tests/test_admin_ocr.py` (19 pruebas) cubre:
roles/scope por cada ruta (incluye 401 sin sesión, 403 `support_readonly`/hogar),
proyección sin PII, los 7 estados + paginación + filtro, motivo obligatorio con
lista de patrones inseguros, reintento repetido/concurrente, trabajos muertos,
fallos permanentes, documento borrado/confirmado, cancelación persistente con
*fencing* de un worker en curso, finalización tardía descartada tras retry y
tras cancel, downgrade/upgrade de la migración 0025 y retención de `cancelled`
en `jobs.purge`.

`services/api/tests/test_admin_rbac.py` ganó 3 pruebas nuevas para el hallazgo
de la revisión independiente de RBAC: filtro `status=active` excluye expirados
y `status=expired` los aísla; auditoría de autorización de scope separada de
éxito de operación; motivo con patrones inseguros rechazado antes de auditar.

### Comandos reales ejecutados (verificados en esta sesión)

```bash
cd services/api
export TEST_DATABASE_URL=postgresql+psycopg://energy:change_me_local_only@localhost:5433/energy_rd_ocr_admin_test
uv run pytest tests/test_admin_ocr.py tests/test_admin_rbac.py tests/test_jobs.py \
  tests/test_authorization.py tests/test_migrations.py -q
# -> 119 passed
uv run pytest tests/test_admin_ocr.py::test_0025_cancel_downgrade_and_restore -q
# -> 1 passed (downgrade a 0024 reclasifica cancelled->dead/failed; upgrade a head restaura generation=0)
PYTHONPATH=. uv run python scripts/generate_contracts.py && \
  PYTHONPATH=. uv run python scripts/generate_contracts.py --check
# -> sin diferencias (OpenAPI + Zod regenerados y verificados)
PYTHONPATH=. uv run python ../../scripts/check_architecture.py
# -> "Architecture boundaries passed"
```

Se evitó la suite completa (`pytest tests/`) a propósito: `tests/test_ocr_prod.py`
usa `ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', ...)`
que no existe en este Mac (entorno sin esa fuente DejaVu), y falla en 18 casos
por esa razón ajena a este cambio (confirmado: todos usan `bill_image()`/PIL).
Esos casos no tocan el código nuevo de ERD-OCR-03.

## Brechas honestas / riesgos abiertos

1. **Filtro de `reason` es heurístico, no una prueba de ausencia de PII.** Rechaza
   patrones obvios (bearer/token/cookie/secreto/URLs/dígitos largos/control chars)
   pero prosa libre con un nombre propio o una dirección pasa sin ser detectada.
   Se decidió mantenerlo como mitigación básica —no como garantía— y se documenta
   aquí en lugar de afirmar "a salvo de PII".
2. El scope `admin.ocr.review` también gobierna `cancel`; la especificación original
   solo mencionaba "cualquier endpoint de revisión" sin detallar cancelación — se
   asumió que cancelar un trabajo en curso es una acción de revisión operativa, no
   de solo-lectura (`admin.ocr.read`) ni de reintento (`admin.ocr.retry`). Si el
   propietario prefiere un scope dedicado (`admin.ocr.cancel`), es un cambio de
   migración 0024/datos de seed, no de este código.
3. No se implementó un endpoint para "confirmar" ni para disparar `bills` desde
   admin — fuera de alcance explícito de la tarea ("no automatic bill confirmation").
4. El filtro `status=<proyección>` en `admin_ocr.list_jobs` reconstruye el `CASE`
   de estado dos veces (en memoria para la proyección, en SQL para filtrar). Si se
   agregan más estados derivados conviene extraer una sola fuente de verdad (p.ej.
   una vista SQL) para evitar que ambas copias diverjan.
