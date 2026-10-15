# ERD-INT-01 — Registro e historial de interrupciones del servicio eléctrico

Diseño y reglas: `backend/api/OUTAGES.md`.

| Criterio | Evidencia |
|---|---|
| Migración reversible | `0023_power_outages.py`; `test_0023_power_outages_roundtrips_and_the_database_blocks_overlaps` (downgrade a 0022 → upgrade → solape bloqueado por la base → cascada) |
| La base rechaza datos incoherentes (fin ≤ inicio, > 30 días, causa fuera del catálogo, solape, abierta sobre otra) | `test_the_database_enforces_the_same_rules` |
| Alta, lectura, reemplazo y baja; duración calculada por el servidor; abierto = sin duración | `test_creating_an_outage_returns_its_duration_and_lists_newest_first`, `test_an_open_outage_is_ongoing_without_a_duration_and_can_be_closed`, `test_update_replaces_and_delete_removes` |
| Validación (futuro, orden, > 30 días, causa, nota, campos extra, sin zona horaria) → 422 sin guardar nada | `test_invalid_payloads_are_rejected_with_422` (8 casos), `test_zero_length_and_over_thirty_days_are_rejected` |
| Sin solapes, también al editar y con apagones abiertos; empezar justo al terminar otro sí | `test_overlapping_outages_are_refused_but_touching_ones_are_fine`, `test_only_one_open_outage_and_it_blocks_later_ones`, `test_editing_an_outage_does_not_collide_with_itself_but_does_with_others`, `test_overlaps_are_per_home` |
| Agregados mensuales en hora de RD, meses vacíos incluidos, apagón entre meses = mes de inicio, abierto cuenta hasta ahora | `test_summary_aggregates_by_start_month_in_rd_time_and_fills_empty_months` (30 sep 23:30 RD cae en septiembre aunque sea 1 oct UTC), `test_an_open_outage_counts_up_to_now_and_is_flagged`, `test_an_outage_crossing_months_belongs_entirely_to_the_month_it_started`, `test_summary_window_excludes_older_outages_and_rejects_bad_months` |
| Aislamiento entre viviendas y cascada | `test_outages_are_isolated_between_homes_and_cascade_with_the_home`; `HOME_TABLES` de `test_account_deletion.py` incluye `power_outages` |
| Autorización: ajeno → 404, sin token → 401 en las 6 rutas | `test_strangers_cannot_read_or_change_outages`, inventario `test_authorization.py`; Playwright `otra persona no puede ver ni cambiar…` |
| Auditoría de altas/ediciones/bajas | `test_audit_trail_records_create_update_delete` |
| Derecho de acceso: va en la exportación de la cuenta | `test_the_export_includes_the_users_outages` |
| BFF estricto (paginación y `months` acotados, cuerpo estricto, vivienda/id ajenos rechazados, 409/422 con mensaje local) | `bff-outages.test.ts` (7) |
| Contrato y cliente | `contracts:check`; `outages.test.ts` del cliente (6) |
| Validación de entrada y textos compartidos (hora de RD UTC−4, futuro, orden, 30 días, 5 min de tolerancia, «Todavía sin luz») | `packages/core/src/outages.test.ts` (6) |
| Web: formulario accesible con foco en el primer campo inválido, historial, resumen, editar, cerrar un apagón abierto, eliminar con confirmación, error con Reintentar | `outages-page.test.tsx` (10); `titles.test.ts`; Playwright `09-outages.spec.ts` (6) |
| Móvil: pantalla de historial/resumen + formulario con el mismo modelo, accesible desde Perfil | `outagesModel.test.ts` (6) |

## Límites honestos
- Son datos que escribe la persona: no se verifican con la distribuidora ni se cruzan con las lecturas (no se «detecta» un
  apagón desde el medidor).
- La convención «el apagón pertenece al mes en que empezó» puede sobre/infra-representar un mes cuando un apagón cruza el
  cambio de mes; está escrita en la respuesta y en la pantalla.
- No hay recordatorios ni alertas por apagones: es solo registro e historial.
- Flujos nativos (Maestro) no ejecutados: no hay emulador en este entorno; el móvil se cubre con pruebas de lógica y estructura.
