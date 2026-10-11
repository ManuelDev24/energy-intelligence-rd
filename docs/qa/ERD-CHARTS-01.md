# ERD-CHARTS-01 — Gráficos y rangos (web + móvil)

## Qué se entrega

| Pieza | Web | Móvil |
| --- | --- | --- |
| Barras por factura con **días facturados** en resumen, tooltip y tabla alternativa | `consumption-chart.tsx` | `ConsumptionChart` (resumen accesible) |
| Selector de rango personalizado (máx. 366 días, reglas compartidas en `packages/core/src/range.ts`) | `date-range-picker.tsx` | `DateRangePicker` + `BottomSheet` |
| Comparar con el período anterior (activable) | casilla en `ReadingsConsumption` | `Switch` en `ConsumptionScreen` (activo por defecto) |
| **Ciclo actual**: día X de Y, avance y kWh de lecturas del ciclo | `features/dashboard/CycleCard.tsx` | `features/dashboard/CycleCard.tsx` |
| **Investigar** una anomalía: abre Consumo con el rango sugerido (`investigationRange`) | enlace en `AnomalySection` + `?from&to&granularity` | botón «Investigar en Consumo» + parámetros de navegación |
| **Mini-tendencias** en Consumo y Monto de la última factura | `components/sparkline.tsx` | `components/Sparkline.tsx` |

## Reglas de honestidad de datos

- Las fechas del ciclo son una **estimación** a partir de la última factura (`currentCycle`); la tarjeta lo dice y la distribuidora puede facturar otro ciclo.
- El kWh del ciclo es lo que cubren las **lecturas del medidor**, con su etiqueta de calidad; sin lecturas se muestra «Aún no hay lecturas que cubran este ciclo», nunca un valor inventado ni 0.
- Un ciclo que aún no empieza **no consulta** consumo (`from/to = null` deshabilita la consulta); uno vencido pide registrar la factura.
- La tarjeta de ciclo no aparece al mirar una factura histórica (solo en la vista actual).
- Las mini-tendencias usan **solo facturas REALES** (nunca la proyección), exigen **≥ 3 puntos** (`MIN_TREND_POINTS`) y no interpolan; la serie constante se dibuja plana. Llevan descripción textual: «Tendencia de consumo en las últimas N facturas: subió, de X a Y».
- Los parámetros de rango recibidos por URL o navegación se **validan** (`initialRangeFromParams`): fechas inexistentes, invertidas, tipos incorrectos o más de 366 días se descartan y se usa el rango por defecto.

## Verificación

- `packages/core`: pruebas de `currentCycle`, `investigationRange`, `billDaysLabel`, `trendValues`/`sparkline`/`sparklineSummary`.
- Web: `consumption-deeplink.test.tsx`, `cycle-card.test.tsx`, `range.test.ts`, `sparkline.test.tsx`.
- Móvil: `range.test.ts` (parámetros de navegación), `cycleCard.test.ts` (ciclo, estructura, tendencias). Las pruebas de UI móviles son de lógica pura y de **estructura del código fuente**: no hay render de React Native en vitest.
- Typecheck de web y móvil; export Metro Android.

## Lo que NO está verificado

- **Ningún componente móvil se ha visto en dispositivo/emulador** (Sparkline, CycleCard, DateRangePicker en BottomSheet, navegación con parámetros). Falta pasada manual con TalkBack/VoiceOver, ver `ERD-A11Y-NATIVE`.
- El Sparkline móvil depende de `react-native-svg` (ya usado por los otros gráficos).
