# ERD-WEB-QUALITY — Validación de calidad web

## Cierre con PostgreSQL y API real — 2026-10-10 (Manuel)

> **Estado: COMPLETO contra la API real.** Se ejecutó lo que §7 dejaba pendiente y se corrigieron los
> hallazgos H2, H3, H4 y los nuevos de la revisión. Lo que sigue más abajo es la evidencia histórica
> (API simulada, 2026-10-07) y el smoke del PR #17, que se trajo a `Dev` como commit (el PR no se fusiona).

- Entorno: clon limpio de `Dev`, PostgreSQL 16 + API en contenedores Docker aislados (`:18001`, migraciones
  hasta `0013`, seed de 5 viviendas piloto), web `next dev` en `:3000` (Node 24.21), Chromium headless
  (Playwright) con `prefers-reduced-motion`. El piloto de `:8000` no se tocó.
- Script reproducible: `docs/qa/evidence/rel-verify-2026-10-10/web-qa/qa.py`; resultado completo en
  `results.json` y capturas `web-*.jpg` de la misma carpeta. **90 comprobaciones, 0 fallos.**
- `LIVE_API_URL=http://127.0.0.1:18001 npm run test --workspace apps/web` → **530/530, 0 omitidas**.

| Criterio | Resultado | Evidencia |
|---|---|---|
| Vivienda → factura → dashboard → proyección/alerta **sin mocks** | ✅ PILOT-05: kWh `-5` rechazado en el cliente; 400 kWh → alerta **crítica +66.67 %** (240 → 400) y proyección **466.67 kWh PROYECTADO**, también en `/alerts`; limpieza a 2 facturas | `web-flow-PILOT-05-alert.jpg`, `web-bill-form-errors-focus.jpg` |
| Valores del dashboard = respuesta de `/dashboard` | ✅ en las 5 viviendas (última factura, alerta o su ausencia, proyección) | `web-dashboard-PILOT-0*.jpg` |
| Estados loading / error / vacío / Reintentar | ✅ esqueleto con `role=status`; 500 en `/dashboard` → mensaje local + Reintentar que recupera; API **apagada de verdad** (`docker stop`) → error en 1.3 s y Reintentar recupera al volver | `web-state-*.jpg` |
| Accesibilidad de pantallas internas | ✅ axe-core 4.10 (WCAG 2.0/2.1 A/AA + best-practice) en `/login` y 10 pantallas internas: **0 violaciones** | `results.json` → `axe` |
| H2 "Saltar al contenido" | ✅ corregido: primer Tab, visible al enfocar, Enter lleva el foco a `<main>` | `web-skip-link.jpg` |
| H3 título por pantalla | ✅ corregido: "Facturas · Energy RD", etc. (17 rutas con prueba) | `apps/web/src/app/titles.test.ts` |
| H4 foco con errores de formulario | ✅ corregido en facturas, lecturas, equipos y meta: foco al primer campo `aria-invalid` | `apps/web/src/components/a11y.test.tsx` |
| Responsive 375 px | ✅ `scrollWidth` = 375 | `web-dashboard-375.jpg` |

Hallazgos nuevos de esta revisión, corregidos (TDD, RED → GREEN):

| # | Hallazgo | Corrección |
|---|---|---|
| H7 | Con un 500 de la API, el dashboard mostraba el `detail` del servidor tal cual (en el piloto no hay BFF que lo filtre) | `QueryState` usa `userMessage()` por estado; también facturas (alta/edición/borrado), OCR, equipos y alertas |
| H8 | `<article role="alert">` en la alerta del inicio (axe `aria-allowed-role`) | la alerta anunciada se pinta como `<div role="alert">` |
| H9 | Acceso demo sin "Reintentar" cuando no cargan las viviendas (smoke PR #17) | `PilotLogin` pasa `onRetry` |

Siguen abiertos (no bloquean): **H1** el "+15.87 % vs. la última factura" del inicio lo calcula el cliente
(también en móvil); debe venir de la API como métrica `PROJECTED` (tarea propia). **H5** el `input type=file`
oculto es enfocable (accesible por la etiqueta "Seleccionar foto"). **H6** con la API caída aparecen dos
tarjetas de error (períodos y dashboard), cada una con su Reintentar. No se usó lector de pantalla real.

---

Revisión posterior en `test/web-mvp-smoke`: [smoke del 2026-10-10](ERD-WEB-MVP-SMOKE-2026-10-10.md).
Los cinco checks pasan; la aceptación con API real permanece bloqueada. La evidencia histórica siguiente se conserva.

> **Estado: PARCIAL.** El recorrido se probó contra una **API simulada**, no contra la API real:
> Docker Desktop no arranca en el equipo donde se hizo la revisión ("Docker Desktop is unable to
> start") y no hay Python/uv/PostgreSQL. Lo verificado aquí es el comportamiento de la **web** frente
> a respuestas que cumplen el contrato; **no** se probó el backend. El criterio "contra la API real"
> sigue abierto (ver §7).

- Fecha: 2026-10-07 · Responsable: Jonas
- Commit base: `192caf827d4acf767f8df03bfb51cbe30413e4d3` (Dev)
- Node 24.21.0 / npm 11.19.0 (Windows 10), Next.js 15.5 en modo desarrollo para la revisión manual

## 1. Resumen de aceptación

| Criterio | Resultado | Notas |
|---|---|---|
| Recorrido vivienda → factura → dashboard → proyección/alerta | ✅ con API simulada · ⚠️ **no** con API real | §3 |
| Responsive móvil y escritorio | ✅ | 375 / 768 / 1280 px, sin desbordes (§4) |
| Accesibilidad básica y teclado | ✅ con 4 observaciones | §5, hallazgos H2–H5 |
| Estados loading, empty, error y reintento | ✅ | §3.2, capturas 05–07 |
| `npm run test --workspace apps/web` | ✅ | 485 pasan, 5 omitidos (integración contra API real) |
| `npm run lint --workspace apps/web` | ✅ | sin avisos |
| `npm run typecheck --workspace apps/web` | ✅ | |
| `npm run build --workspace apps/web` | ✅ | con `NEXT_PUBLIC_AUTH_ENABLED=true`, `API_BASE_URL` y `WEB_ORIGIN` HTTPS, como el CI |
| Evidencia en `docs/qa/` | ✅ | este documento + `evidence/web-quality-2026-10-07/` |

Los cuatro comandos se ejecutaron desde cero (`npm ci`) en una copia limpia fuera de OneDrive.
Los 5 tests omitidos son `src/test/live-integration.test.tsx`, que solo corre con `LIVE_API_URL`
(la ejecuta el job "recorridos vs API real" del CI, no se corrió aquí).

## 2. Cómo se simuló la API

`docs/qa/evidence/web-quality-2026-10-07/simulated-api.mjs` (Node, sin dependencias nuevas):

- Implementa `homes`, `bills` (listar, crear, leer, editar, borrar), `bills/{id}/items`,
  `bills/{id}/validate`, `dashboard`, `alerts`, `anomalies`.
- **Valida cada respuesta contra los esquemas Zod generados** del contrato
  (`packages/api-contracts/src/generated.ts`); si el simulador se saliera del contrato respondería 500
  y lo registraría. En la revisión no ocurrió.
- Los cálculos del dashboard (promedios, variación, proyección lineal, severidad ≥20 % / ≥40 %) los hace
  el simulador, como lo haría el backend; la web solo muestra lo recibido.
- Controles para forzar estados: `/__sim?delay=4000`, `/__sim?fail=500`, `/__sim?reset=1`.
- **No** implementa `goal`, `readings`, `equipment`, `consumption`, `tariffs`, `contract`, `auth`.
  Esas pantallas devuelven 404 y muestran su estado de error (p. ej. la tarjeta "Meta" del inicio).

Datos: 3 viviendas simuladas — SIM-01 (3 facturas, +50 % → alerta crítica), SIM-02 (2 facturas, +25 % →
aviso) y SIM-03 (sin facturas).

```bash
node docs/qa/evidence/web-quality-2026-10-07/simulated-api.mjs        # API en :8000
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev --workspace apps/web   # web en :3000
```

## 3. Recorrido

### 3.1 Flujo principal (modo piloto, SIM-01)

1. `/dashboard` sin sesión → redirige a `/login` ✅
2. Login: se elige la vivienda con el teclado (↓, Tab, Enter) → `/dashboard` ✅
3. Dashboard (captura 02): próxima factura **RD$ 6,553.33 · 486.67 kWh · PROYECTADO**, alerta
   **Crítica** "subió 50.00 %", desviación detectada, última factura 420 kWh / RD$ 5,600.00, promedio
   13.55 kWh/día y precio medio RD$ 13.33/kWh (ESTIMADO), vs. período anterior +140 kWh / +50.00 % y
   +RD$ 2,040.00 / +57.30 %. **Todos coinciden con el JSON del simulador.**
4. Facturas → lista (3 facturas con kWh y RD$ exactos) → "Registrar factura" → entrada manual.
5. Validación del formulario vacío (captura 03): errores por campo con `role="alert"`, `aria-invalid` y
   `aria-describedby` ✅
6. Alta con teclado (300.50 kWh, RD$ 4,100.00, 30 días) → vuelve a `/dashboard` ✅
7. Dashboard actualizado (captura 04): última factura 300.50 kWh / RD$ 4,100.00, proyección
   **RD$ 5,325.00**, 4 facturas, fuente "mixto" y **sin alerta** (el simulador devuelve `alert: null`
   porque el consumo bajó 28.45 %). Coincide con la API ✅
8. Detalle de factura (captura 09): 420.00 kWh, RD$ 5,600.00, 31 días; "Revisar consistencia" muestra
   estado, comprobaciones, procedencia e historial ✅

### 3.2 Estados

| Estado | Cómo se forzó | Resultado | Captura |
|---|---|---|---|
| Vacío | vivienda SIM-03 | "Aún no hay facturas" con botón **Registrar factura** | 05 |
| Loading | `/__sim?delay=4000` + recarga | esqueletos; selector "Cargando…" | 06 |
| Error | `/__sim?fail=500` + recarga | "No se pudo cargar" + mensaje + **Reintentar** (aparece tras agotar los reintentos del cliente: más de 8 s) | 07 |
| Reintento | `fail=0` y Enter sobre **Reintentar** | la pantalla se recupera sin recargar ✅ | — |

## 4. Responsive

| Ancho | Layout | Desbordes | Notas |
|---|---|---|---|
| 375 (móvil) | cabecera con selector de vivienda + barra inferior fija de 6 destinos; barra lateral oculta | ninguno (`scrollWidth` 375) en `/dashboard`, `/bills`, `/bills/new`, `/alerts` | captura 08; ningún control menor de 36 px salvo H5 |
| 768 (tablet) | barra lateral visible, barra inferior oculta, rejilla de 2 columnas | ninguno | |
| 1280 (escritorio) | barra lateral + contenido máximo 961 px | ninguno | |

## 5. Accesibilidad y teclado

Revisión del DOM y recorrido con teclado. **No** se usó un lector de pantalla ni una herramienta
automática (axe/Lighthouse), y **no** se midió el contraste de color: queda pendiente.

✅ Correcto: `lang="es"`; un solo `h1` y jerarquía `h1 → h2`; landmarks `main`, `nav`, `aside`, `header`;
ningún control interactivo sin nombre; logo decorativo con `alt=""`; ningún `tabindex` positivo; la
gráfica usa `role="img"` con una descripción que incluye los datos; el foco es visible (anillo del
navegador) en enlaces, selector y botones; el recorrido (login, alta de factura, reintento) se hizo con
teclas reales (Tab, flechas, Enter, escritura), colocando por script el foco inicial en algunos pasos para
ahorrar tabulaciones; los campos del formulario tienen etiqueta y `inputmode` adecuado.

## 6. Hallazgos

| # | Severidad | Hallazgo | Sugerencia |
|---|---|---|---|
| H1 | Media | La web **calcula** un porcentaje: el "+15.87 % vs. la última factura" de la tarjeta de próxima factura sale de `projectionDeltaPct` (`@energyrd/core`, usado en `apps/web/src/features/dashboard/DashboardPage.tsx:69`); la API no lo envía. Choca con la regla "no calcular métricas energéticas en la web" y no lleva etiqueta de calidad. | Que la API lo exponga como `Metric` (con calidad `PROJECTED`) o retirarlo. |
| H2 | Media | No hay enlace "saltar al contenido": en escritorio hay **9 paradas de tabulador** (selector + 8 enlaces) antes de `main` (WCAG 2.4.1). | Añadir un skip link visible al recibir foco. |
| H3 | Baja | El `<title>` es "Energy RD" en todas las rutas (WCAG 2.4.2). | Título por pantalla ("Facturas · Energy RD"). |
| H4 | Baja | Tras enviar el formulario de factura con errores, el foco **se queda en el botón** en lugar de ir al primer campo inválido. Los errores sí se anuncian por `role="alert"`. | Mover el foco al primer campo con error o a un resumen. |
| H5 | Info | En `/bills/new` (móvil) hay un control interactivo menor de 36 px y sin texto: probablemente el `input type=file` oculto del botón de foto. | Confirmar que está fuera del orden de tabulación o dimensionarlo. |
| H6 | Info | Con la API caída, el estado de error tarda más de 8 s en aparecer porque el cliente reintenta con espera. | Valorar menos reintentos en lecturas de pantalla principal. |

Solo del entorno de revisión (no son defectos de la app): el primer `Tab` cae en el indicador de
`next dev` (`nextjs-portal`); el círculo "N" se superpone al icono "Inicio" de la barra inferior en móvil.

## 7. Pendiente para cerrar contra la API real

Con Docker funcionando (o en el job "recorridos vs API real" del CI):

```bash
docker compose up -d --build postgres api         # migraciones + seed PILOT-01..05
LIVE_API_URL=http://localhost:8000 npm run test --workspace apps/web   # 5 pruebas de integración
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev --workspace apps/web
```

Repetir §3.1 y §3.2 (con latencia/fallo reales: `docker compose stop api` para el estado de error) y
confirmar que los valores del dashboard, las etiquetas de calidad y la proyección coinciden con la
respuesta de `/api/v1/homes/{id}/dashboard`. Además: revisar contraste y lector de pantalla (§5) y las
pantallas no simuladas (Meta, Lecturas, Equipos, Consumo, Cuenta con auth).

Nota: el CI de `192caf8` (run #31) falló por infraestructura de GitHub ("The job was not acquired by
Runner"), por lo que no hay señal oficial de los jobs `api` y `web + mobile + core`; conviene relanzarlo.

## 8. Evidencia

Carpeta `docs/qa/evidence/web-quality-2026-10-07/`:

| Archivo | Contenido |
|---|---|
| `simulated-api.mjs` | API simulada (§2) |
| `01-login-desktop.jpg` | login con selector de vivienda |
| `02-dashboard-desktop-sim01.jpg` | dashboard SIM-01: proyección, alerta crítica, desviación |
| `03-bill-form-validation-errors.jpg` | validación del formulario de factura |
| `04-dashboard-after-new-bill.jpg` | dashboard tras crear la factura (proyección RD$ 5,325.00, sin alerta) |
| `05-dashboard-empty-state-sim03.jpg` | estado vacío |
| `06-dashboard-loading-skeleton.jpg` | estado de carga |
| `07-dashboard-error-with-retry.jpg` | estado de error con Reintentar |
| `08-dashboard-mobile-375.jpg` | dashboard en móvil con barra inferior |
| `09-bill-detail-desktop.jpg` | detalle de factura |

Las capturas de escritorio se tomaron a 800 px de ancho (el panel de captura recorta los 1280 px); el
layout de 1280 px se verificó midiendo el DOM (§4).
