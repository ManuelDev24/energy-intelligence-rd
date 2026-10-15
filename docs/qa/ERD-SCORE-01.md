# ERD-SCORE-01 — Energy Score explicable, versionado y calculado por el backend

Diseño, fórmulas y límites: `backend/api/ENERGY_SCORE.md`. Depende de SAVE-01 (recomendaciones → Eficiencia),
ANOM-01-COMPLETE (anomalías → Consistencia) y DEV-02 (equipos con consumo estimado → Eficiencia).

| Criterio | Evidencia |
|---|---|
| El backend es la única fuente del puntaje (la web/móvil no calculan) | `energy_score_engine.py` puro; `EnergyScoreCard` (web) y `scoreRows.ts` (móvil) solo formatean; `scoreComponentView` en `core` no hace aritmética de negocio |
| 4 componentes con pesos que suman 100 y explicación documentada | `test_weights_add_up_to_100_and_every_component_is_documented`; cada componente trae `summary/detail/inputs/reasons/next_step` (`test_a_home_with_bills_and_equipment_gets_an_explained_score`) |
| Sin datos no hay puntaje ni se rellenan ceros | `test_nothing_known_means_no_score_and_no_invented_components`, `test_a_single_available_component_is_not_enough`, `test_a_new_home_has_no_score_and_says_why`; web `un componente sin datos dice «Sin datos»`; Playwright `una vivienda sin datos no tiene puntaje` |
| Un componente faltante redistribuye su peso (no cuenta como 0) | `test_missing_components_do_not_count_as_zero_their_weight_is_redistributed` (79 = (100·35 + 50·25)/60) |
| Fórmulas de cada componente con casos límite | `test_consumption_against_the_goal_is_linear…`, `…by_history_needs_four_bills…`, `test_efficiency_is_the_share…`, `test_habits_combine…`, `test_consistency_penalises…` |
| Rango 0–100, monótono y determinista | `test_scores_stay_within_0_100_and_are_monotonic_in_the_goal_ratio`, `test_evaluation_is_deterministic` |
| Versionado | `score_version` en la respuesta y en el contrato; `SCORE_VERSION` en el motor |
| Aplicar una recomendación mejora Eficiencia; la meta mueve Consumo | `test_applying_a_recommendation_improves_efficiency…`, `test_the_goal_drives_the_consumption_component`; Playwright `aplicar una recomendación mejora Eficiencia…` |
| Mismas bandas en backend y gauge | `test_core_bands_match_the_engine_bands`, `energyScore.test.ts`; `gaugeBand` (web) y `EnergyGauge` (móvil) usan `scoreBand` |
| Etiqueta de calidad: INFERIDO, nunca REAL | `quality: Literal["INFERRED"]`; web `INFERIDO`; móvil `QualityBadge quality="INFERRED"` |
| Autorización y solo lectura | `test_strangers_cannot_read_the_score` (404 ajeno, 401 sin token, 405 en escrituras), inventario `test_authorization.py`, Playwright `otra persona no puede leer el puntaje…`; BFF: `bff-energy-score.test.ts` (sin parámetros, sin escrituras, vivienda ajena y forma inválida rechazadas) |
| Contrato y cliente | `contracts:check`; `energyScore.test.ts` del cliente (vivienda ajena, banda desconocida, puntaje no entero, campo faltante) |
| Web: tarjeta en el panel con gauge accesible (`role="meter"`), componentes, error con Reintentar | `energy-score-card.test.tsx` (4); Playwright `con facturas, equipo y meta el panel muestra el mismo puntaje que la API` |
| Móvil: tarjeta en el panel; si falla no rompe el panel | `energyScoreCard.test.ts` (3) |
| Sin migración | El puntaje se deriva cada vez de los datos actuales (no se guarda): no puede quedar desfasado. Consecuencia: no hay historial de puntajes |

## Límites honestos
Umbrales y pesos sin calibrar con datos reales; «configurable» = constantes versionadas del motor (sin ajustes por persona);
sin historial; en el móvil no se ejecutaron flujos Maestro (no hay emulador en este entorno).
