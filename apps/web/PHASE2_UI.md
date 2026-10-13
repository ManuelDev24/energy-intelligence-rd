# Fase 2 — UI web de lecturas, consumo y metas (ERD-CONS-01 / ERD-GOAL-01)

Cliente web de los endpoints de `services/api/PHASE2_IMPLEMENTATION.md`. Solo `apps/web/**`; usa el
cliente compartido (`@energyrd/api-client`) y los contratos (`@energyrd/api-contracts`) sin cambiarlos.

## Pantallas

| Ruta | Qué hace | Archivos |
| --- | --- | --- |
| `/consumption` | Pestañas **Por lecturas** (nueva, por defecto) y **Por factura** (la vista mensual de siempre, intacta). | `features/consumption/ConsumptionPage.tsx`, `ReadingsConsumption.tsx`, `BillsConsumption.tsx` |
| `/readings` | Lista de lecturas (fecha/hora RD, valor, nota), formulario de alta y borrado con confirmación. | `features/readings/ReadingsPage.tsx`, `form.ts` |
| `/goal` | Formulario de meta mensual (RD$ y/o kWh), tarifa oficial vigente y progreso del mes. | `features/goal/GoalPage.tsx`, `form.ts` |
| `/dashboard` | Nueva tarjeta **Meta de <mes>** (progreso) bajo el resumen; el resto no cambia. | `features/goal/GoalProgressCard.tsx` |

Navegación: "Lecturas" en la barra lateral y la inferior; "Meta" solo en la lateral (en móvil se llega
desde la tarjeta del inicio). `/readings` y `/goal` están protegidas por `middleware.ts` igual que el resto.

### Consumo por lecturas
- Rango: atajos **Últimos 7 días**, **Últimos 30 días** (por defecto), **Últimos 12 meses** (desde el día 1
  de hace 11 meses, por mes) y **Personalizado** (desde/hasta). Agrupar por **Día / Semana / Mes**.
- Validación local igual que la API: fechas válidas, desde ≤ hasta, **máximo 366 días** (inclusivo). Con
  rango inválido no se llama a la API y el error se muestra junto a los campos.
- Resumen: **Total del rango**, **Promedio diario**, **Pico** (período + aviso si la cobertura es parcial) y
  **Cobertura** (% + lecturas usadas). Cada métrica lleva su etiqueta de calidad, también REAL.
- Gráfica (`components/readings-consumption-chart.tsx`): REAL verde sólido; ESTIMADO rayado azul con borde;
  **sin datos = columna gris punteada a toda la altura con la etiqueta "Sin datos"** (hueco visible, nunca
  una barra en 0). Tooltip y tabla desplegable con valor, calidad, cobertura y motivo. `role="img"` con
  resumen textual que nombra los huecos.
- "Períodos sin datos": huecos consecutivos agrupados con el **motivo** que envía la API.
- Sin ningún bucket con valor: estado vacío con "Registrar lectura".
- Cambiar de rango mantiene la gráfica anterior atenuada hasta que llega la nueva (`keepPreviousData`).

### Lecturas
- Fecha + hora locales de RD → `read_at` ISO con `-04:00` (`lib/rd-time.ts`, UTC−4 fijo, sin depender
  de la zona del navegador). La lista muestra `read_at` (UTC) convertido a hora de RD.
- Validación local (espejo de la API): número ≥ 0 con ≤ 2 decimales; no futura (tolerancia de 5 min como
  la API); no duplicar instante; **monotonía**: pista en vivo con la lectura anterior/siguiente y error si
  queda fuera. La API sigue siendo la autoridad (409/422 se muestran con mensajes locales).
- Borrado: botón "Eliminar" → confirmación en la fila ("Sí, eliminar" / "Cancelar"), con foco gestionado.

### Meta
- Formulario: dos campos opcionales; vacío = sin esa meta; > 0 con ≤ 2 decimales; al menos uno (PUT
  reemplaza la meta completa; no existe borrar meta en la API).
- Tarifa: muestra el pliego vigente de la distribuidora de la vivienda (código, resolución, vigencia) o
  explica que no hay tarifa oficial cargada ("Otra" o fuera de vigencia).
- Tarjeta de progreso: estado global y por métrica con **ícono + texto + color** (En camino / En riesgo /
  Meta excedida / Datos insuficientes); "Llevas este mes" con su calidad; meta; barra de avance
  (`role="progressbar"`); cierre proyectado con **PROYECTADO**; si el RD$ sale de la tarifa:
  **"Estimado con tarifa SIE-121-2026-TF"** + **ESTIMADO** + enlace a la resolución; precio medio o
  prorrateo de facturas también se rotulan ESTIMADO. `insufficient_data` muestra los motivos y las acciones
  **Registrar lectura** / **Agregar factura** (y **Definir meta** si no hay meta).

## Estados
Cada pantalla tiene carga (skeleton), error con "Reintentar", vacío con acción, guardado (`role="status"`)
y errores de formulario (`role="alert"`). Los errores se eligen por estado/código/campo en
`lib/api/errors.ts` (nunca el texto de la API, tampoco en el piloto sin BFF).

## Datos y caché
- Hooks en `lib/api/hooks.ts`: `useReadings`, `useConsumption(homeId, {granularity, from, to} | null)`,
  `useGoal`, `useGoalProgress`, `useTariffs(distributor)`, `useCreateReading`, `useDeleteReading`, `usePutGoal`.
- Claves bajo `["homes", homeId, …]` (consumo incluye granularidad y rango). Toda escritura de la vivienda
  (lectura, factura, meta, equipo, alerta) invalida ese prefijo: consumo y progreso de la meta se
  recalculan; otras viviendas y las tarifas (`["tariffs", …]`) no se tocan.
- Transporte: con auth, BFF (`/api/bff/*`, allowlist en `AUTH_IMPLEMENTATION.md`); piloto sin auth,
  API directa (`NEXT_PUBLIC_API_URL`). El piloto `:8000` actual no tiene estos endpoints: las pantallas
  nuevas muestran su error local hasta que se actualice.

## Límites
- Sin datos horarios: la resolución mínima es el intervalo entre lecturas.
- Sin reemplazo/reinicio de medidor (una lectura menor que la anterior se rechaza).
- Tarifa: solo BTS-1 oct–dic 2026 (SIE-121-2026-TF); RD$ sin impuestos/alumbrado/otros cargos.
- El rango de 12 meses pide `from` = día 1 de hace 11 meses (≤ 366 días siempre).
- La animación de las barras no se verificó en Chromium headless (allí las barras solo aparecen con
  `prefers-reduced-motion: reduce`; la gráfica de facturas existente se comporta igual). Con movimiento
  reducido se verificó el dibujo de barras REAL/ESTIMADO y de los huecos.

## Verificación
```sh
fnm exec --using=24 npm test --workspace apps/web
fnm exec --using=24 npm run typecheck
fnm exec --using=24 npm run lint --workspace apps/web
NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_AUTH_ENABLED=true API_BASE_URL=https://api.example.invalid \
  WEB_ORIGIN=https://app.example.invalid fnm exec --using=24 npm run build --workspace apps/web
# Live (API aislada :8011 + next dev -p 3021 con auth):
NEXT_PUBLIC_AUTH_ENABLED=true API_BASE_URL=http://127.0.0.1:8011 WEB_ORIGIN=http://localhost:3021 npx next dev -p 3021
AUTH_INTEGRATION_WEB_ORIGIN=http://localhost:3021 python3 apps/web/scripts/verify_phase2_bff.py
```
Pruebas: `src/lib/auth/bff-phase2.test.ts`, `src/lib/phase2-model.test.ts`, `src/test/phase2-pages.test.tsx`,
`src/test/phase2-cache.test.tsx`, `src/middleware-phase2.test.ts`.
