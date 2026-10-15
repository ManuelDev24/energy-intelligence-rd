# ERD-SAVE-01 — Recomendaciones de ahorro explicables, versionadas e idempotentes

Diseño y reglas: `backend/api/RECOMMENDATIONS.md`.

| Criterio | Evidencia |
|---|---|
| Migración reversible (tabla, restricciones, índice) | `0022_recommendations.py`; `test_0022_recommendations_table_roundtrips_and_cascades_with_the_home` (downgrade a 0021 → upgrade → cascada al borrar la vivienda); CI ya hace `downgrade -1 && upgrade head` |
| La base rechaza filas incoherentes (ahorro negativo, RD$ sin kWh, categoría/confianza fuera de catálogo, versión 0, clave repetida) | `test_the_database_rejects_inconsistent_rows` |
| Motor puro y determinista; ahorro = potencia × horas × 30 con supuestos escritos | `test_ac_saving_is_nominal_power_times_one_hour_times_thirty_days_with_its_assumptions`, `test_evaluation_is_deterministic_and_ordered_by_saving`, `test_savings_are_never_negative_across_a_grid_of_inputs` |
| Sin datos suficientes no inventa nada (sin precio → sin RD$; sin proyección → sin meta; ahorros < 1 kWh no se muestran) | `test_without_price_there_are_no_pesos_and_without_a_rule_match_there_is_nothing`, `test_tiny_savings_are_not_shown`, `test_goal_gap_…silence_when_under_goal` |
| Un equipo = una recomendación (los ahorros se pueden sumar) | `test_every_equipment_gets_at_most_one_recommendation_and_totals_do_not_double_count` |
| Explicable: regla + versión, evidencia, supuestos, confianza, acción | `test_declaring_equipment_creates_an_explainable_estimated_recommendation`; web `savings-page.test.tsx › muestra el ahorro como ESTIMADO…`; Playwright `declarar un aire acondicionado…` |
| Idempotente: recalcular 3 veces no duplica ni cambia | `test_refresh_is_idempotent_and_never_duplicates` (resultado 0/0/0/0); Playwright `…recalcular no la duplica` |
| Versionado: subir la versión de una regla actualiza lo vigente en su sitio y no toca lo decidido | `test_a_new_rule_version_updates_active_rows_but_not_the_decided_ones` |
| Cambiar/quitar el equipo actualiza o resuelve la misma recomendación | `test_changing_the_equipment_updates_in_place_and_removing_it_resolves` |
| Lo aplicado/descartado se respeta; `resolved` no se fuerza (409) | `test_user_decisions_stick_and_resolved_cannot_be_forced`; Playwright `lo descartado no reaparece…` |
| Un fallo del motor nunca rompe la escritura del equipo | `test_a_failing_engine_never_breaks_the_equipment_write` |
| Autorización: ajeno → 404, sin token → 401, PATCH estricto | `test_strangers_cannot_read_refresh_or_change_recommendations`, inventario `test_authorization.py` (3 rutas nuevas), `test_input_validation`, Playwright `otra persona no puede…` |
| BFF con lista blanca estricta (filtros cerrados, POST de cuerpo vacío, PATCH solo `active/applied/dismissed`, respuesta de otra vivienda/id rechazada, texto del servidor no se filtra) | `bff-recommendations.test.ts` (12 casos) |
| Contrato generado y cliente validan la respuesta (vivienda ajena, id distinto, categoría desconocida) | `contracts:check`; `recommendations.test.ts` (5) |
| Web: pantalla «Ahorro» (estimado etiquetado, «¿Por qué?», aplicar/descartar/reactivar, vacío, error con Reintentar) | `savings-page.test.tsx` (7); título de página en `titles.test.ts`; Playwright `07-savings.spec.ts` (5) |
| Móvil: pantalla «Ahorro» con el mismo modelo compartido (`@energyrd/core`) y acceso desde el panel | `savingsModel.test.ts` (5), `recommendations.test.ts` de core (3) |

## Límites honestos
- Los umbrales y porcentajes de las reglas (1 h de AA, 60 % LED, 5 % nevera…) son **valores de partida sin calibrar con
  consumos reales**; por eso la confianza es media/baja y todo va como ESTIMADO con sus supuestos.
- La potencia es la nominal declarada: un compresor con ciclo de trabajo real consume menos que eso.
- No se identifican equipos a partir de facturas ni lecturas; las recomendaciones por anomalía solo orientan.
- Flujos nativos (Maestro) del módulo no se ejecutaron: no hay emulador/dispositivo en este entorno; el móvil se cubre con
  pruebas de lógica y de estructura, igual que el resto de pantallas.
