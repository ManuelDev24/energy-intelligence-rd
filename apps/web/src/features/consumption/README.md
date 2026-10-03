# ERD-WEB-04 — Dashboard y consumo

Módulo React preparado para ERD-WEB-01/02. La primera base web de Jonas todavía no está publicada. No se agregan rutas, manifiestos, dependencias, configuración global ni estilos globales.

## Integración después de publicar la base

Importar `ConsumptionDashboard` desde una página o contenedor de la base web y proporcionar `state`, `homes` e `initialFilters`. El componente tiene frontera `use client` y CSS Modules local.

```tsx
import { ConsumptionDashboard } from './features/consumption/ConsumptionDashboard';
import { demoHomes, demoStates } from './features/consumption/fixtures';

<ConsumptionDashboard
  homes={demoHomes}
  state={demoStates.demo}
  initialFilters={{ homeId: 'home-1', year: '2026', status: 'ALL' }}
  onRetry={() => reloadConsumption()}
/>
```

`reloadConsumption` corresponde al contenedor que conectará la API. Para datos reales pasar `{ kind: 'ready', records }`; usar `demo` exclusivamente para fixtures, nunca como fallback silencioso de un error. Los estados `loading`, `empty` y `error` están en `demoStates`. El botón de reintento solo aparece al recibir un callback.

El contrato espera un registro por propiedad/mes, fechas YYYY-MM válidas y kWh finitos no negativos; el adaptador de API debe validar estos requisitos y rechazar duplicados. Los filtros iniciales deben referenciar una propiedad existente. Cambiar de cuenta requiere remontar el componente con una key de cuenta.

La comparación aplica los filtros activos, utiliza el mes calendario anterior y conserva ambas etiquetas de procedencia. Si falta ese mes no se sustituye por otro; un baseline de cero no genera un porcentaje. La gráfica y tabla muestran cada etiqueta REAL/ESTIMATED/PROJECTED/INFERRED. Cero es un valor disponible, distinto de ausencia de datos. No se crean lecturas horarias ni se interpolan meses ausentes.

## Validación

Desde la raíz: `node --test apps/web/src/features/consumption/model.test.mjs` (Node 24). Cubre filtros, rollover anual, comparación, ausencia de baseline, división por cero y etiquetas de fixtures.

Pendiente con ERD-WEB-01/02: typecheck usando el tsconfig de Jonas, render del componente y verificación visual/responsive en la aplicación. Revisar todos los estados, navegación por teclado, filtros, tabla accesible y cero kWh. Este módulo aislado no constituye una aplicación web ejecutable.
