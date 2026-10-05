# ERD-BILL-02 — Revisión independiente (read-only) — 2026-10-04

Alcance: `services/api/BILL_DETAIL_VALIDATION.md`, `apps/web/BILL_DETAIL_UI.md`, `apps/mobile/BILL_DETAIL_UI.md` y los archivos que listan
(backend `bill_items`/`validate`/`bill_snapshots`, contratos, cliente compartido, BFF, UI web y móvil). No se editó producto.

Pruebas temporales (fuera del repo):
- `~/.hermes/cache/scratch/erd_bill02_review/test_bill02_probe.py` — 9 sondas pytest, ejecutadas **solo** con
  `tests/run_isolated.py -p tests.conftest --rootdir=. -c pyproject.toml -s <archivo>` contra `energy_rd_auth_test`, sin concurrencia.
- `~/.hermes/cache/scratch/erd_bill02_review/{bill02,contract}.probe.test.ts` — vitest (Node 24) sobre validadores web/móvil,
  `saveBillItemsVerified`, contrato Zod y cliente compartido con `fetch` simulado.

## Veredicto

**Aprobable con cambios requeridos.** Ningún hallazgo Critical. Tres Required, todos de remedio pequeño. Los riesgos
principales que pedía revisar (IDOR, aprobación implícita, `null`→0, signos/Decimal, auditoría privada) **resisten** las sondas.

## Required

### R1 — El snapshot "inmutable por SQL directo" se puede borrar con `TRUNCATE` (reproducido)
- `services/api/app/alembic/versions/0011_bill_detail.py:21-29`: el trigger es `BEFORE UPDATE OR DELETE ... FOR EACH ROW`;
  `TRUNCATE` no dispara triggers de fila.
- `services/api/BILL_DETAIL_VALIDATION.md:98-101` afirma "inmutable por API y por SQL directo".
- Evidencia: `test_probe_truncate_bypasses_snapshot_trigger` → `TRUNCATE bill_snapshots` funciona; luego `/validate` devuelve
  `origin=unknown`, `warnings=['original_unknown']` (el original de creación desaparece sin error).
- Impacto: requiere privilegios de BD (no se alcanza por la API), pero la garantía documentada es falsa.
- Remedio mínimo: agregar `CREATE TRIGGER bill_snapshot_no_truncate BEFORE TRUNCATE ON bill_snapshots FOR EACH STATEMENT
  EXECUTE FUNCTION ...` (que lance 23514) más un test RED→GREEN; o, como mínimo, corregir la frase del documento a
  "UPDATE/DELETE de fila". (El dueño de la tabla también puede usar `DISABLE TRIGGER`; anotarlo como límite.)

### R2 — Un PUT ya guardado en el servidor puede dejar la caché antigua (móvil reproducido; web por lectura de código)
- Móvil `apps/mobile/src/features/bills/detail/saveItems.ts:44-51` + `hooks.ts:55-58`: la invalidación/`setQueryData`
  solo ocurre en `publish`, después de que el `GET` de confirmación funcione y coincida. Si el `PUT` ya se guardó y luego el
  `GET` falla, no coincide o cambia el alcance, no se invalida nada.
  Evidencia: sonda vitest "PUT committed but confirmation GET fails" → `PUT committed: true`, `publish ran: false`.
  Consecuencia: la pantalla de detalle, que sigue abajo en la pila, conserva los ítems y la revisión anteriores. Además, ante un
  error de red el mensaje genérico hace pensar que el guardado falló.
- Web `apps/web/src/lib/api/hooks.ts:169-174`: `usePutBillItems` invalida solo en `onSuccess`. El BFF responde 502 cuando el
  upstream excede 10 s o no cumple el contrato, aunque la API ya haya hecho commit (`apps/web/src/lib/auth/bff.ts:319-321`);
  en ese caso la caché queda obsoleta. **Hipótesis:** no lo reproduje en vivo, pero el camino es directo en el código.
- Remedio mínimo: invalidar `items` + `assessment` de esa factura en `onSettled` (web) y en un `finally` cuando el `PUT` haya
  resuelto (móvil). Esto no aplica si el error es `ScopeChangedError`, porque `queryClient.clear()` ya cubre ese caso. Añadir un
  test en cada app.

### R3 — El texto web dice "primeras 100" correcciones, pero la API devuelve las 100 **más recientes** (reproducido)
- `services/api/app/services/bill_detail.py:67-72`: ordena `desc`, aplica `limit 101` y luego invierte el orden, así que conserva las
  100 más recientes y descarta las más antiguas.
- `apps/web/src/features/bills/BillAssessmentSection.tsx:177`: "Se muestran las primeras 100 correcciones."
- Evidencia: `test_probe_corrections_window_is_most_recent_100` (101 eventos) → `corrections[0].before == {'days': 1}`,
  es decir, falta el evento más antiguo y `has_more=True`. El móvil sí dice "las 100 correcciones más recientes"
  (`assessmentModel.ts:143`).
- Remedio: cambiar el texto web por el del móvil y ajustar `bill-detail-page.test.tsx`.

## Optional / Consider

- **O1 — La web muestra la clave interna `updated_at` en el historial.** En `BillAssessmentSection.tsx:48-66`, `changes()`
  compara todas las claves, y `FIELD` no incluye `updated_at`. Sonda `test_probe_update_correction_exposes_internal_keys`: una
  edición de monto cambia `['amount_dop', 'updated_at']`, por lo que la web pinta "updated_at: antes 2026-… → después …". No es
  dato privado, pero es ruido técnico. Remedio: limitar el historial a las claves de `FIELD`, como hace el móvil. Además, en
  `bill_items`, una corrección que solo cambia montos se ve como "1 concepto → 1 concepto".
- **O2 — Paridad de longitud de etiqueta.** La API cuenta puntos de código (150 emoji → 200, según la sonda), y el móvil también
  (`itemsForm.ts:32`). La web (`items.ts:47`, `.length` UTF-16) y el BFF (`bff.ts:74`, `z.string().max(200)`) rechazan esa
  etiqueta válida. Remedio: usar `[...label].length` / `.refine`.
- **O3 — Web acepta NUL en la etiqueta** (`items.ts:45-47`, `bff.ts:74`). La sonda confirma que el payload sale con
  `"a\u0000b"` y la API responde 422. El fallo es seguro, pero el mensaje es tardío. El móvil sí lo rechaza localmente.
- **O4 — El cliente compartido no verifica el `detail` anidado.** En `packages/api-client/src/index.ts:118-121,134-135`,
  `ownBill` solo comprueba `bill_id` de primer nivel, y la comprobación genérica de `home_id` tampoco baja a `detail`. La sonda
  muestra que `assessBill` acepta un `detail` de otra vivienda/factura. El BFF web sí lo rechaza (`bff.ts:86-91`); el móvil
  consume este cliente sin BFF. Requiere un servidor defectuoso. Remedio: comprobar también `detail.home_id`/`detail.bill_id` en
  `assessBill`.
- **O5 — Las lecturas toman `FOR UPDATE` sobre `homes`.** En `bill_detail.py:32,80`, `GET /items` y `POST /validate` mantienen un
  bloqueo exclusivo de fila hasta cerrar la sesión. Sonda `test_probe_get_items_takes_row_lock`: un `FOR SHARE` concurrente
  bloquea el `GET` (`blocked: True`). `FOR UPDATE` también entra en conflicto con `FOR KEY SHARE` de inserciones hijas
  (lecturas, facturas). Es correcto, pero serializa lecturas. Considerar una transacción `REPEATABLE READ READ ONLY`.
- **O6 — Móvil con auth: un 404 se muestra como "no disponible en este servidor".** Esto ocurre en `screenState.ts:11` y
  `saveItems.ts:59` (está documentado). La web distingue piloto y auth (`errors.ts:9-11`). Considerar aplicar `AUTH_ENABLED` igual.

## FYI

- **Contrato de entrada generado demasiado permisivo.** `packages/api-contracts/src/generated.ts:388`: el regex de
  `BillItemInSchema.amount_dop` tiene una alternativa sin `$`. La sonda acepta `"1abc"`, `"0.001"`, `"12345678901234"`,
  `"99999999999.99"`, `"1,000"` y `"-5"` como cargo. Hoy **ningún consumidor de producción** valida con él (web: regex propio del
  BFF; móvil: `itemsForm`; cliente: no parsea la entrada). El patrón aparece 16 veces en `generated.ts`; es un problema previo
  del generador. No usarlo como validador sin arreglarlo.
- **Downgrade/upgrade de 0011.** Destruye los originales `creation`: al volver a subir quedan como `migration`, sin verificar, y
  la etiqueta sigue siendo honesta. Los eventos `bill_items` del historial sobreviven aunque los ítems ya no existan (sonda: 0
  ítems, 1 corrección de `bill_items`). No hacer downgrade en el piloto sin respaldo.
- **Formato de `provenance.data`.** Con `migration` sale de `to_jsonb(bills)` (números JSON y timestamps ISO); con `creation` sale
  de `snapshot()` (cadenas `"3100.00"` y `str(datetime)`). Ninguna UI lo pinta hoy.
- **Diferencias de entrada web/móvil, ambas fallan de forma segura.** Web: monto con signo (descuento `-150`), rechaza
  `"1,00"` y `"1 000"`. Móvil: monto sin signo (el tipo aplica el signo), `"1,00"`→1.00, `"1 000"`→1000. Ambas: `"1,000"`→1000.00,
  `"1.000"` rechazado, ≤10 enteros/2 decimales, 100 sí y 101 no, `-0`/`0` nunca se envía como `-0.00`.

## Verificado sin hallazgo

- **IDOR**: el mismo usuario con otra vivienda (test existente) y un usuario ajeno con su propia vivienda (sonda
  `test_probe_cross_user_idor`) obtienen 404 en GET/PUT `/items` y POST `/validate`. El cuerpo es idéntico entre factura ajena e
  inexistente y entre vivienda ajena e inexistente (con `X-Request-ID` fijo), y los ítems de la víctima quedan intactos.
- **Sin aprobación**: `/validate` no cambia `audit_events`, `bill_snapshots` ni `bills.updated_at`. La respuesta no contiene
  "verif" ni la clave `validated` (sonda). `approval` es el literal `not_performed`, y el contrato rechaza `approved`. Web y móvil
  muestran "Esta revisión no aprueba la factura."; `grep -i verificad` en el código UI (sin tests) solo encuentra un comentario
  en `saveItems.ts:1`.
- **`null` ≠ 0**: con la API sin ítems, `items_total_dop`/`difference_dop` llegan como `null`. La web muestra "Sin detalle"
  (`BillItemsSection.tsx:19,146-147`), el móvil igual (sonda `detailView`) y el contrato conserva `null`.
- **Signos y Decimal en el backend**: cargos `-0` y `-0.00` → `0.00`; total con descuento `3100.00`, diferencia `0.00` (nunca
  `-0.00`). `"1,000"` → 422; `1e3` y `"1E+3"` → `1000.00`. Con 100 × `9999999999.99` el total es `999999999999.00`, lo acepta el
  contrato y `fmtDop` lo formatea; `fmtDop("-0.00")` → `RD$ 0.00`. El constraint de BD sobre el signo existe.
- **Auditoría**: un solo evento `replace` con `{"items":[{amount_dop,kind,label,position}]}`. `actor` es la etiqueta fija `pilot`
  y no se serializa. Cada corrección expone solo `entity/operation/before/after/created_at`, sin email ni IP.
- **Concurrencia**: el reemplazo bloquea la fila de vivienda igual que crear/editar/borrar factura. No volví a ejecutar las
  pruebas de barrera existentes; el coordinador reportó 403 passed.
- **Caché web**: las claves llevan cuenta y cuelgan de `keys.bill`; `useUpdateBill`, vía `invalidateHome`, también refresca
  ítems y diferencia. El descarte por `account_changed` está en `bffFetch`. Reviso código y tests existentes, no reejecutados.
- **Fallo suave del piloto**: web `billDetailUnavailable` (solo sin auth, 404/405/501) oculta la revisión. Móvil
  `detailScreenState` oculta editar y revisar.

## Límites (no verificado)

- No hubo verificación **live**: no se levantaron la API, el BFF ni `next dev`, y los puertos 8081/8011/8083/8084 no se tocaron.
  R2 en web es hipótesis por lectura de código.
- No hubo verificación **visual** (sin capturas web) ni **nativa** (sin simulador/emulador/Maestro, sin teclado ni layout reales).
- No volví a ejecutar las suites completas (API 403, web 351, móvil 324, contratos, cliente); me apoyo en la reejecución del
  coordinador. Mis sondas: 9/9 pytest (tras fijar `X-Request-ID` en la sonda IDOR) y 6/6 vitest, todas fuera del repo.

## Correcciones aplicadas por el coordinador (posterior a esta revisión)

| Hallazgo | Cambio | RED → GREEN |
|---|---|---|
| R1 TRUNCATE esquiva inmutabilidad | `0011_bill_detail.py`: trigger de sentencia `bill_snapshot_no_truncate` (`prevent_bill_snapshot_truncate`), eliminado en downgrade; doc corregida | `test_snapshot_table_cannot_be_truncated_directly`: "DID NOT RAISE" → pasa; integridad + migraciones 33 passed |
| R2 caché obsoleta tras PUT con fallo posterior | Móvil: `saveBillItemsVerified` llama `settled` en `finally` una vez intentado el PUT; `hooks.ts` invalida ahí solo esa factura. Web: `usePutBillItems` pasa a `onSettled` | Móvil: 2 tests nuevos fallaban → 11/11. Web: hipótesis confirmada (isInvalidated false) → 5/5 |
| R3 texto "primeras 100" | `BillAssessmentSection.tsx`: "Se muestran las 100 correcciones más recientes." | Test nuevo falla con el texto anterior (revertido temporalmente) → pasa |

Gates finales: API 404 passed (warning previo), arquitectura OK, contratos `--check` OK; JS core29/contratos10/cliente16/web353+5skip/móvil327+11skip; typecheck, lint, build web y diff-check exit 0; hashes pilot-flow/phase2-flow sin cambios. Optional/FYI del informe quedan abiertos (no bloquean). Sigue sin verificación live/visual/nativa.
