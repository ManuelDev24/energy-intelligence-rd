# Fase 2 — UI móvil: consumo por lecturas, lecturas del medidor y meta mensual

Tareas: **ERD-CONS-01** (cliente móvil) y **ERD-GOAL-01** (cliente móvil). Backend y cliente compartido:
`services/api/PHASE2_IMPLEMENTATION.md`, tarifa: `docs/architecture/TARIFF_BTS1_2026Q4.md`.

## Pantallas

| Pantalla | Dónde | testIDs principales |
|---|---|---|
| **Consumo** (pestaña nueva) | `features/consumption/ConsumptionScreen.tsx` | `tab-Consumption`, `range-7d/30d/12m`, `gran-day/week/month`, `consumption-range`, `consumption-summary`, `consumption-total(-quality)`, `consumption-average(-quality)`, `consumption-peak(-quality)`, `consumption-coverage`, `consumption-chart`, `consumption-gaps`, `consumption-detail-toggle`, `bucket-<AAAA-MM-DD>(-quality)`, `add-reading`, `open-readings`, `add-reading-empty`, `consumption-empty`, `consumption-unavailable` |
| **Lecturas del medidor** (pila) | `features/readings/ReadingsScreen.tsx` | `reading-<AAAA-MM-DD>-<HHMM>` (hora local RD), `…-delete`, `readings-add`, `readings-empty`, `readings-unavailable` |
| **Nueva lectura** (pila) | `features/readings/ReadingFormScreen.tsx` | `f-reading-date`, `f-reading-time`, `f-reading-kwh`, `f-reading-note`, `<campo>-error`, `reading-hint`, `reading-server-error`, `save-reading`, `keyboard-done` |
| **Meta mensual** (pila) | `features/goals/GoalFormScreen.tsx` | `f-goal-amount`, `f-goal-kwh`, `goal-form-error`, `goal-server-error`, `save-goal`, `goal-form-unavailable` |
| **Tarjeta de meta** (dashboard) | `features/goals/GoalCard.tsx` | `goal-card`, `goal-set`, `goal-edit`, `goal-status-<status>`, `goal-kwh` / `goal-amount`, `goal-<m>-status`, `goal-<m>-projected`, `goal-<m>-source(-quality)`, `goal-add-reading`, `goal-add-bill`, `goal-card-loading`, `goal-card-unavailable`, `goal-card-error`, `goal-retry` |

La pestaña Consumo va entre Inicio y Facturas. Los testIDs existentes (`tab-Dashboard`, `tab-Bills`, `tab-Equipment`,
`tab-Alerts`, `hero`, `badge-*`, `card-projection`…) no cambian; `maestro/pilot-flow.yaml` no se modificó.

## Estados

- **Consumo:** sin vivienda · cargando (esqueleto) · **no disponible** (404 de la API piloto) · error con reintento ·
  sin consumo en el rango (no se dibuja un gráfico vacío; CTA “Registrar lectura”) · datos · “Actualizando…” al cambiar
  de rango (se conserva el dato anterior **solo** de la misma cuenta y vivienda).
- **Gráfico (CH-02):** REAL = barra verde sólida; ESTIMADO (reparto entre lecturas) = azul claro con borde; **sin dato =
  hueco punteado de altura completa con “s/d”**, nunca una barra 0 (un 0 real mide 0 y se rotula “0”). Con columnas
  < 4 pt (p. ej. 365 días) el hueco es una marca bajo el eje (contraste 5.5:1). Leyenda solo con lo presente.
  Etiquetas del eje sin solaparse (`axisLabelIndices`). Resumen accesible del gráfico; > 31 barras se resume.
  Detalle por período desplegable: valor o “sin dato”, calidad y motivo redactado **localmente** desde `reason_code`.
- **Agregados:** total, promedio diario y pico llevan **siempre** su etiqueta de calidad (REAL o ESTIMADO, como hermanos
  del valor); cobertura del rango y lecturas usadas.
- **Lecturas:** lista (más reciente primero), eliminar con confirmación (“¿Eliminar la lectura de X kWh del …?”),
  error de borrado vía `describeError`.
- **Formulario de lectura:** fecha y hora locales RD → `AAAA-MM-DDTHH:MM:00-04:00`. Validación igual a la API: kWh
  decimal ≥ 0, ≤ 2 decimales, ≤ 10 enteros (acepta `1,000` y `1250,5`), no futura, no repetir instante,
  **monotonía** (≥ la anterior y ≤ la siguiente en el tiempo, con el valor de referencia en el mensaje), nota ≤ 255.
  Pista con la última lectura. 409/422 de la API → mensajes locales propios; campos vía lista permitida de `api/errors.ts`.
- **Meta:** al menos una (RD$ y/o kWh), cada una > 0 y ≤ 2 decimales; vacía = sin esa meta. Precarga la guardada.
- **Tarjeta de meta:** cargando · **no disponible** (API piloto: aviso compacto de una línea, el resto del dashboard
  igual) · error con “Reintentar” · sin meta (“Definir meta”) · progreso: estado con **icono + texto + color**
  (En camino / En riesgo / Meta excedida / Datos insuficientes), actual vs. meta con % y barra, proyección con badge
  **PROYECTADO**, nota de origen: RD$ por tarifa → “Estimado con tarifa SIE-121-2026-TF” + **ESTIMADO** (resolución
  tomada de `tariff.source_resolution`, validada por formato), precio medio de factura → ESTIMADO. `insufficient_data`:
  motivos redactados localmente + CTA **Registrar lectura** y **Agregar factura**.

## Datos y caché

- Claves por cuenta y vivienda (`api/phase2Keys.ts`, probado): `readings`, `consumption/<home>/<g>/<from>/<to>`,
  `goal`, `goal-progress`. Todas cuelgan de `['account', epoch]` / `['pilot']`: el `queryClient.clear()` del cierre
  de sesión (`auth/runtime.ts`) y el cambio de época las eliminan.
- Crear/borrar lectura invalida lecturas, **todo** el consumo de esa vivienda y el progreso. Guardar meta invalida meta y
  progreso. Crear/borrar factura invalida además el progreso de la meta.
- 4xx no se reintenta (`retryPolicy`): la API piloto responde 404 una sola vez y la UI pasa a “no disponible”.

## Límites

- Sin selector nativo de fecha/hora (no se agregan dependencias): campos de texto `AAAA-MM-DD` y `HH:MM` precargados con
  la hora actual de RD (UTC−4 fijo).
- Sin edición de lecturas (la API no la ofrece): borrar y volver a registrar. Sin cambio/reinicio de medidor.
- Sin borrar la meta (no hay `DELETE /goal`): se deja vacía una de las dos, pero al menos una debe quedar.
- La tarjeta evalúa el mes calendario actual (fecha del servidor); no hay navegación a meses anteriores.
- `GET /tariffs` no se muestra todavía en la UI (solo se refleja en la nota de la meta).
- Los textos `reason`/`reasons` del servidor no se muestran; los motivos se derivan localmente de los campos.

## Verificación

```bash
eval "$(fnm env --shell bash)"
fnm exec --using=24 npm test --workspace apps/mobile          # lógica pura (rangos, ISO −04:00, validación, barras con huecos, claves)
fnm exec --using=24 npm run typecheck --workspace apps/mobile
# e2e real (cuenta y vivienda desechables en la API dedicada; sonda solo lectura a la piloto)
cd apps/mobile && AUTH_E2E_API_URL=http://127.0.0.1:8011 PHASE2_PILOT_PROBE_URL=http://127.0.0.1:8000 \
  fnm exec --using=24 npx vitest run src/e2e/phase2Flow.e2e.test.ts
npx expo export --platform ios|android --output-dir <scratch>
maestro test … maestro/phase2-flow.yaml   # ver cabecera del archivo: Metro con auth en :8083 y API :8011
```

La QA nativa se ejecutó en iPhone 18 Pro (iOS 27.0) y EnergyRD_Pixel (Android 16) contra la API aislada `:8011`.
El recorrido completo reforzado pasó dos veces consecutivas por plataforma: 28 aserciones/esperas verificadas por ejecución
(13 aserciones directas + 15 esperas), con revisión visual de capturas y teclado iOS. Informe, historial de fallos,
comandos y rutas exactas: `docs/qa/ERD_PHASE2_NATIVE_2026-10-04.md`. No equivale a pruebas en dispositivos físicos.
