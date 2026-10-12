# Operación de la cola OCR administrativa (ERD-OCR-03)

Guía operativa para `admin.ocr.*`. Asume el backend desplegado con migración
`0025` aplicada (`alembic upgrade head`) y roles asignados vía ERD-ADM-RBAC
(`app/services/admin.py`, ver `docs/security/ADMIN_RBAC.md`).

## Scopes requeridos

| Acción | Scope |
|---|---|
| Ver la cola / detalle de un trabajo | `admin.ocr.read` |
| Reintentar manualmente | `admin.ocr.retry` |
| Cancelar un trabajo en cola o en curso | `admin.ocr.review` |

Roles con estos scopes de fábrica (migración 0024): `super_admin`,
`operations_admin` (read+retry+review), `ocr_reviewer` (read+review, sin retry).

## Consultar la cola

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "$API/api/v1/admin/ocr/jobs?status=dead_letter&limit=50&offset=0" | jq
```

`status` acepta: `queued`, `processing`, `completed`, `failed_retryable`,
`failed_permanent`, `dead_letter`, `cancelled`. Sin `status` devuelve todos,
paginados por `limit`/`offset` (máx. `limit=200`).

Cada elemento trae: `id` (id del `Job`), `document_id`, `status`, `attempts`,
`max_attempts`, `run_at`, `created_at`, `finished_at`, `error_code`. **Nunca**
el borrador OCR, el texto reconocido, la clave de almacenamiento ni el
`last_error` crudo (puede contener fragmentos del documento).

## Reintentar un trabajo fallido

Solo aplica a `failed_retryable` (el intento previo falló pero puede
reintentarse) o a un `dead_letter` cuyo `error_code` no sea permanente
(`unreadable`, `protected_pdf`, `file_missing` son permanentes y requieren que
la persona vuelva a subir el documento, no un retry administrativo).

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"reason": "Revisar motor tras incidente de disponibilidad"}' \
  "$API/api/v1/admin/ocr/jobs/$JOB_ID/retry" | jq
```

Respuestas:
- `200` — vuelve a `queued`, `generation` incrementada, backoff calculado con
  `app/services/jobs/queue.py::backoff_seconds`.
- `409` — el trabajo no está en estado reintentable (ya en cola, en curso,
  completado, permanentemente fallido, documento confirmado o borrado).
- `422` — `reason` vacío, solo espacios, o contiene un patrón bloqueado
  (ver "Motivo" abajo).
- `403` — falta `admin.ocr.retry`.

El `reason` queda en `admin_audit_events` (inmutable) junto con `actor_user_id`,
`request_id` y `metadata={job_id, generation}`, en la misma transacción que el
cambio de estado — si la escritura de auditoría falla, el reintento se revierte.

## Cancelar un trabajo

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"reason": "Detener por solicitud de la persona titular"}' \
  "$API/api/v1/admin/ocr/jobs/$JOB_ID/cancel" | jq
```

Solo aplica a `queued`/`processing`. Un trabajo cancelado nunca vuelve a
`queued` solo o publica un borrador: si el worker ya estaba leyendo el
documento, el *fencing* por generación descarta su resultado cuando termine
(confirmado por `test_cancel_during_extraction_never_publishes_draft`).

## Motivo (`reason`)

Reglas (compartidas con ERD-ADM-RBAC, `app/schemas/admin.py::_reason`):
- 1–500 caracteres, no vacío tras `strip()`.
- Rechaza: caracteres de control/salto de línea, `@`, URLs `http(s)://`,
  las palabras `bearer`, `token`, `cookie`, `password`, `secret`, `clave`,
  `authorization` (cualquier mayúscula/minúscula) y cualquier secuencia de
  7+ dígitos (teléfonos, tarjetas, cédulas).
- **Esto es una mitigación heurística, no una garantía de ausencia de PII.**
  Un motivo como "revisar caso de Juan Pérez" pasa el filtro. Instruir a los
  operadores a usar términos operativos (tipo de incidente, componente,
  ticket interno) y nunca nombres, contactos o datos de la factura.

## Diagnóstico común

| Síntoma | Causa probable | Acción |
|---|---|---|
| `409` en retry de un `dead_letter` | `error_code` permanente (`file_missing`/`unreadable`/`protected_pdf`) | Pedir a la persona que resuba el documento; no hay retry admin para esto. |
| `409` en retry/cancel de un trabajo "fallido" en la UI del hogar | Alguien más ya lo reintentó (fencing por generación) | Refrescar la lista; el estado cambió. |
| Trabajo queda `processing` mucho tiempo | Concesión (`locked_until`) vencida pero el worker sigue vivo en otro proceso | Esperar al vencimiento de la concesión (`queue.claim` la retoma); no cancelar salvo necesidad real. |
| Auditoría sin `reason` legible | No ocurre: la escritura falla con 422 antes de tocar la base si el motivo es inválido | — |

## Comandos verificados en esta sesión

```bash
cd services/api
export TEST_DATABASE_URL=postgresql+psycopg://energy:change_me_local_only@localhost:5433/energy_rd_ocr_admin_test
uv run pytest tests/test_admin_ocr.py tests/test_admin_rbac.py -q      # 50 passed
uv run pytest tests/test_migrations.py -q                              # 24 passed (incluye 0025 up/down)
PYTHONPATH=. uv run python scripts/generate_contracts.py --check       # sin diferencias
PYTHONPATH=. uv run python ../../scripts/check_architecture.py          # Architecture boundaries passed
```

## Brecha conocida

El motivo de `reason` filtra patrones obvios pero no es una prueba de
ausencia total de PII en prosa libre (ver `docs/qa/ERD-OCR-03.md`, sección
"Brechas honestas"). No afirmar en revisiones de seguridad que este campo es
"seguro frente a PII" sin matizarlo.
