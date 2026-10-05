# ERD-BILL-02 — Bill detail: ítems manuales y validación (solo lectura)

Contratos reales expuestos por `services/api` tras la migración `0011`. Alcance backend
únicamente; sin UI, sin OCR, sin tarifas/conceptos inventados.

## Rutas (home-scoped, requieren membresía como el resto de `/homes/{home_id}/...`)

### `GET /homes/{home_id}/bills/{bill_id}/items`
Devuelve `BillItemsOut`:
```json
{
  "home_id": "...", "bill_id": "...",
  "items": [{"position": 0, "label": "...", "kind": "charge|discount", "amount_dop": "123.45"}],
  "items_total_dop": null,
  "bill_amount_dop": "3100.00",
  "difference_dop": null
}
```
- `items` vacíos ⇒ `items_total_dop = null` y `difference_dop = null` (nunca `0`): no se inventa
  un total donde no hay captura manual.
- `difference_dop = items_total_dop - bill_amount_dop` cuando ambos existen. **No se recalcula
  `bill.amount_dop`** a partir de los ítems; la diferencia se reporta, no se corrige sola.
- Signo: `charge` ⇒ `amount_dop >= 0`; `discount` ⇒ `amount_dop <= 0`. Validado en Pydantic
  (`model_validator`) y en la base (`ck_bill_items_sign`, `ck_bill_items_finite` rechaza NaN/Infinity).
- `BillOut` (la factura) no cambia de forma: los ítems viven en un endpoint separado.

### `PUT /homes/{home_id}/bills/{bill_id}/items`
Body estricto (`extra="forbid"`): `{"items": [{"label": str 1..200 no-blank, "kind": "charge"|"discount", "amount_dop": Decimal(12,2)}]}`.
- Reemplazo completo (no PATCH incremental); máx. 100 ítems (`max_length=100`, también `ck_bill_items_position`
  en BD). Rechaza `position`, `bill_id`, `source` u otros campos inyectados por el cliente.
- Orden estable: la posición la asigna el servidor por índice de la lista enviada (0..n-1),
  no el cliente.
- Transaccional: borra+reinserta dentro de `write_transaction`, bajo el mismo lock de fila
  (`require_home(..., lock=True)`) que usan `create_bill`/`update_bill`, así una lectura
  concurrente de `/items` nunca ve un estado a medias.
- Auditoría: una sola fila en `audit_events` (`entity="bill_items", operation="replace"`) con
  `before`/`after` = `{"items": [...]}` completo (reutiliza `record_change`, igual que bills).
  No hay evento por ítem.

### `POST /homes/{home_id}/bills/{bill_id}/validate`
Body: `{}` estricto (`extra="forbid"`; cualquier campo, incluido `validated`, da 422).
Devuelve `BillAssessment`, **evaluación de solo lectura**:
```json
{
  "home_id": "...", "bill_id": "...",
  "read_only": true, "approval": "not_performed",
  "status": "consistent|warnings|incomplete",
  "checks": [{"code": "...", "status": "pass|warning|unavailable", "observed": {...}}],
  "warnings": ["days_consistency", ...],
  "provenance": {"origin": "creation|migration|unknown", "original_available": bool,
                 "data": {...}|null, "captured_at": "...”|null},
  "corrections": [{"entity": "bills|bill_items", "operation": "update|replace",
                   "before": {...}, "after": {...}, "created_at": "..."}],
  "corrections_has_more": bool,
  "detail": { ...BillItemsOut... }
}
```
Garantías explícitas:
- **No escribe nada**: ni commit, ni fila de auditoría, ni campo `validated` persistido. No hay
  aprobación humana automática — `approval` siempre es `"not_performed"`, no existe
  `validated: true` en ninguna respuesta de este endpoint.
- **Checks reales** (nunca inventados):
  - `period_order`: `period_end >= period_start`.
  - `period_duration`: días transcurridos dentro de `MAX_PERIOD_DAYS` (366, el mismo límite de creación).
  - `days_consistency`: compara `bill.days` contra el período de dos formas — `elapsed_days`
    (resta simple) e `inclusive_days` (+1). Pasa si `days` coincide con cualquiera de las dos,
    porque el dato legado no documenta si el proveedor cuenta días de forma inclusiva o no.
    `convention` siempre viaja como `"unspecified"`: **no se asume** una convención sin evidencia.
  - `readings_kwh`: si hay `reading_previous`/`reading_current`, exige monotonía y que
    `reading_current - reading_previous == kwh`; si falta alguna lectura, `status="unavailable"`
    (no se finge un resultado).
  - `items_sum`: usa el mismo `difference_dop` que `GET /items`; `unavailable` si no hay ítems
    capturados, `warning` si no cuadra con `bill.amount_dop`.
- `status`: `"warnings"` si algún check u origen desconocido generó advertencia; si no hay
  advertencias pero algún check es `unavailable` (datos insuficientes), `"incomplete"`;
  si todo pasó con datos completos, `"consistent"`. Nunca implica aprobación.
- `provenance`: de `bill_snapshots` (ver migración `0011`). `origin="creation"` = snapshot
  tomado en el instante de alta por la API (dato fiable). `origin="migration"` = fila ya
  existía al desplegar `0011`; el snapshot se tomó de los valores actuales de `bills`, **no
  verificado contra ningún original real** (`original_available=false`, warning
  `"original_unverified"`). Si no hay fila en `bill_snapshots` (no debería ocurrir salvo
  manipulación directa de BD), `origin="unknown"` + warning `"original_unknown"`. Nunca se
  acusa de fraude ni se infiere intención; son banderas de calidad de dato.
- `corrections`: historial de `audit_events` para `bills`(`update`) y `bill_items`(`replace`)
  de esa factura, orden cronológico ascendente, acotado a 100 (`corrections_has_more` indica
  recorte). Cada entrada expone solo `entity/operation/before/after/created_at` — **sin actor,
  email ni IP** (el modelo `AuditEvent.actor` existe para otros fines pero no se serializa aquí).
- `detail`: repite `GET /items` para evitar una segunda llamada del cliente.

## Migración `0011_bill_detail`
- `bill_items`: tabla nueva, `ON DELETE CASCADE` desde `bills`. Constraints: posición
  `[0,100)` única por factura, label no vacío, `amount_dop` finito y con signo coherente
  con `kind`.
- `bill_snapshots`: `bill_id` PK=FK `CASCADE`, `origin` ∈ {`creation`,`migration`}, `data`
  JSONB, `captured_at`. Backfill en el propio `upgrade()`: una fila `origin='migration'`
  por cada factura piloto/legado existente al momento del despliegue (`to_jsonb(bills)`),
  dejando explícito que ese dato **no es el original verificado**, solo lo mejor disponible.
  Un trigger (`prevent_bill_snapshot_update`) bloquea `UPDATE`/`DELETE` directos sobre
  `bill_snapshots` (`SQLSTATE 23514`) salvo el `DELETE` disparado por el `CASCADE` real al
  borrar la factura. Un segundo trigger de sentencia (`bill_snapshot_no_truncate`,
  `prevent_bill_snapshot_truncate`) bloquea `TRUNCATE`, que los triggers de fila no ven
  (revisión ERD_BILL_02 R1, regresión `test_snapshot_table_cannot_be_truncated_directly`).
  Así el snapshot es inmutable por API y por DML/TRUNCATE directo; un superusuario puede
  seguir deshabilitando triggers o borrando la tabla (DDL), lo cual queda fuera de este
  control. No impide limpiar datos de prueba al borrar la factura.
- `create_bill` ahora inserta también el snapshot `origin="creation"` en la misma transacción
  que el alta (mismo commit, reutilizando `write_transaction`/`record_change`/`snapshot`).
- `downgrade()` elimina `bill_items`, `bill_snapshots` y el trigger/función; no toca `bills`
  ni ninguna otra tabla del piloto (`test_migration_roundtrip_preserves_legacy_bill_and_labels_snapshot_unverified`
  prueba round-trip completo conservando la factura y repoblando el snapshot de migración al
  volver a subir).

## Decimales y normalización
- `Numeric(12,2)` en BD; Pydantic usa `max_digits=12, decimal_places=2, allow_inf_nan=False`
  tanto en `BillItemIn.amount_dop` como ya existía en `_BillFields` de `bills.py`.
- `bills.py` ahora normaliza (`normalized_fields`) cantidades `Decimal` a `.quantize(0.01)`
  antes de `create`/`update`, cerrando el gap de `"250"` guardado sin normalizar en
  auditoría (regla ya conocida del equipo, aplicada aquí también a bill detail).
- Suma de 100 ítems al límite (`9999999999.99` × 100) no desborda `Numeric(12,2)` porque el
  total se calcula en Python con `Decimal`, no se persiste una columna `items_total` (se
  deriva siempre en lectura).

## Autorización e IDOR
- Las nuevas rutas están registradas en `api_router.include_router(bills.router, dependencies=[Depends(authorize_home)])`
  (sin cambios de cableado) y añadidas al inventario de `tests/test_authorization.py::cases()`
  (`GET/PUT /items`, `POST /validate`), de modo que
  `test_private_route_inventory_remains_covered` sigue verificando que no hay rutas privadas
  sin cubrir.
- Factura ajena y factura inexistente devuelven el mismo 404 con el mismo cuerpo
  (`test_foreign_and_missing_ids_are_indistinguishable`): no hay fuga de existencia.
- Miembros (no solo dueños) pueden usar `PUT /items` y `POST /validate`; al revocar la
  membresía, acceso inmediato a 404 (reutiliza `authorize_home`, igual que el resto de
  endpoints de factura).

## Pruebas (TDD, PostgreSQL real vía `tests/run_isolated.py`, DB `energy_rd_auth_test` aislada)
- `tests/test_bill_detail.py` (25 tests): forma vacía/legacy intacta, reemplazo con orden y
  suma firmada, auditoría atómica, límites Decimal/NaN/Infinity/signo/100 ítems, lock de
  lectura vs escritura concurrente (`ThreadPoolExecutor` + `Event`), snapshot inmutable (BD
  rechaza `UPDATE`/`DELETE` directos), sesión de larga vida no sirve cantidades obsoletas,
  endpoint `validate` consistente/con advertencias/sin aprobación automática.
- `tests/test_bill_detail_integrity.py` (14 tests): constraint `NaN` a nivel SQL puro, IDOR
  ajena=inexistente en los tres endpoints nuevos, miembro vs no-miembro, rollback real de
  reemplazo por fallo posterior (`DataError` real de Postgres, no mockeado), reemplazos
  concurrentes como lotes completos (nunca mezclados) con auditoría before/after encadenada,
  migración `0011` reversible conservando factura y repoblando snapshot de migración,
  factura `seed` sin snapshot (`origin="unknown"`), período de 0/1 día con ambas convenciones
  válidas, orden de `corrections` por `clock_timestamp()` (no por inicio de transacción),
  respuesta de `validate` acotada a 100 correcciones sin campos privados de actor.
- Regresión añadida en `test_migrations.py` (versión `head` ahora `0011`) y en
  `test_authorization.py` (inventario de rutas).
- Suite completa vía runner aislado: **403 passed** (`tests/run_isolated.py -q`), sin
  `xfail`/`skip` nuevos. `scripts/check_architecture.py` sigue en verde (servicios sin
  FastAPI, routers sin `commit/rollback/flush`).

## Fuera de alcance / explícitamente no tocado
- `packages/*`, `apps/web`, `apps/mobile`: sin cambios; `generate_contracts`/outputs
  compartidos no se regeneraron (corresponde al agente padre).
- No se añadió ningún concepto/tarifa nuevo a `tariffs`/`tariff_blocks`; los "conceptos" de
  factura son texto libre capturado por el usuario (`label`), no un catálogo regulado.
- No hay OCR ni ningún campo `source="ocr"` (rechazado explícitamente por `extra="forbid"`).
- No se creó ningún mecanismo de aprobación humana ni campo persistente `validated`.
- Puertos 8081/8011/8083/8084 no se tocaron; pruebas corrieron únicamente contra
  `energy_rd_auth_test` vía `tests/run_isolated.py`, sin servidores de desarrollo levantados.

## Pendiente (fuera de este slice)
- Exponer estos contratos en `packages/api-client`/UI queda para el agente/slice de frontend.

## Integración del coordinador (posterior al slice backend)
- `BillCreate`/`BillUpdate` ahora usan `extra="forbid"`: un campo desconocido en alta/edición de factura devuelve 422 en vez de ignorarse. Clientes actuales (web BFF ya estricto, cliente compartido `createBill` envía solo campos del formulario + `source: "manual"`) no envían extras; la API piloto `:8000` no se ha actualizado y conserva el comportamiento anterior.
- Generador: `BillItemsReplace`, `BillItemsOut`, `BillAssessment` añadidos a `MODELS`; soporte nuevo para `dict` libre (`z.record(z.string(), z.unknown())`) y `minItems/maxItems` en arrays (solo afecta a `items.max(100)`). Contratos RED→GREEN `bill-detail-contracts.test.ts` (3).
- Cliente compartido: `getBillItems`, `putBillItems`, `assessBill`, comprobando `home_id` y `bill_id` de la respuesta. RED→GREEN `bill-detail.test.ts` (4).
- No se añadió ningún campo a `BillOut` legacy; si una futura fase quisiera mostrar
  `items_total_dop` en el listado de facturas, requeriría una extensión explícita y su
  propio ciclo TDD.
