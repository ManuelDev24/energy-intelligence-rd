# Energy Score (ERD-SCORE-01)

Indicador **interno, INFERIDO y orientativo** de 0 a 100. Lo calcula **solo el backend**: la fórmula vive en
`app/services/energy_score_engine.py` (puro, sin HTTP ni ORM) y la web/móvil únicamente lo dibujan
(`packages/core/src/energyScore.ts`, `EnergyGauge`). `app/services/energy_score.py` junta los hechos y
`GET /api/v1/homes/{home}/energy-score` lo expone (solo lectura, `Cache-Control: no-store`, `authorize_home`).

`SCORE_VERSION = 1`. Cambiar la fórmula, los umbrales o los pesos exige subir la versión.

## Componentes (0–100 cada uno)

| Componente | Peso | Fórmula | Datos |
|---|---|---|---|
| **Consumo** | 35 | Con meta en kWh y proyección: `proyección / meta` ≤ 100 % → 100, ≥ 150 % → 0 (recta). Sin meta: ritmo kWh/día de la última factura vs. mediana de las ≤ 6 anteriores (≥ 4 facturas): ≤ 0 % → 100, ≥ +50 % → 0 | meta, facturas |
| **Eficiencia** | 25 | `ahorro potencial / consumo mensual estimado de los equipos`: 0 % → 100, ≥ 50 % → 0 | equipos (DEV-02), recomendaciones de equipos **vigentes** (SAVE-01; lo aplicado o descartado ya no cuenta) |
| **Hábitos** | 15 | Promedio de lo que aplique: lecturas (última ≤ 7 días → 100, ≥ 30 → 0), factura reciente (cierre ≤ 35 días → 100, ≥ 90 → 0), pagos (pagadas / con fecha límite vencida o pagadas, últimas 6) | lecturas, facturas |
| **Consistencia** | 25 | Promedio de: desviaciones (100 − 30 crítica − 15 advertencia − 5 info por cada abierta de los últimos 90 días; las revisadas pesan la mitad) y estabilidad (coef. de variación del kWh/día de las ≤ 6 últimas facturas: ≤ 10 % → 100, ≥ 50 % → 0; requiere ≥ 3) | anomalías (ANOM-01), facturas |

**Total** = promedio ponderado de los componentes **con datos**; sus pesos se reparten entre ellos. **Con menos de dos
componentes disponibles no hay puntaje** (`status = insufficient_data`, `score = null`). `coverage_pct` dice qué parte del
peso tiene datos. Bandas: ≥ 70 Bueno · ≥ 40 Regular · resto Mejorable (las mismas en el gauge; una prueba compara el motor
con `energyScore.ts`).

## Respuesta
Cada componente trae `summary` (qué mide), `detail` (la cifra que lo motivó), `inputs` (evidencia en texto), `reasons`
(por qué no hay dato) y `next_step` (qué hacer). `quality` es siempre `INFERRED`.

## Límites
Los umbrales son valores de partida **sin calibrar con datos reales**. «Configurable» se limita a constantes versionadas en el
motor: no hay pesos editables por persona. El puntaje no se guarda (se deriva de los datos actuales), así que no hay
historial de puntajes.
