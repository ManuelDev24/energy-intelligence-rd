# Análisis de brechas del proyecto — actualizado el 11 de octubre de 2026

**Estado actual:** `origin/Dev` avanzó hasta `f3cb2f42` después de la foto descrita abajo. Los commits posteriores integran ERD-CLAIM-01, ERD-HELP-01, ERD-RPT-01/PDF, ERD-AI-CHAT-MOBILE, actualizaciones de ahorro, OCR administrativo, resumen administrativo y consulta admin de usuarios read-only. Esta foto y sus conteos históricos no describen el backlog faltante actual: no volver a contarlos como desarrollo pendiente. El panel admin continúa parcial; su backlog vigente está en `docs/PLAN_COMPLETO_ENERGY_RD.md` §5 y `task_plan.md`.

Documento vivo creado el 10-oct-2026 como foto del plan de cierre (`CLOSURE_PLAN_2026-10-10.md`) y actualizado tras el
**Módulo 1 — Núcleo residencial restante**. Regla de este documento: *una tarea solo figura como cerrada si su criterio
real se cumplió*; lo que depende de datos, cuentas o dispositivos que no están a nuestro alcance se declara como
**bloqueado**, aunque exista una simulación (las simulaciones no cierran criterios reales).

Rama de trabajo: `Dev` (local, 4 commits nuevos sin publicar sobre `5c5d42d`). Nada se ha empujado todavía.

## 1. Módulo 1 — resultado

| Orden | ID | Estado | Commit | Evidencia |
|---:|---|---|---|---|
| 1 | ERD-E2E-PLAYWRIGHT | **Hecha** (con límites, §4) | `[ERD-E2E-PLAYWRIGHT] implementa E2E web contra API y PostgreSQL reales` | `docs/qa/ERD-E2E-PLAYWRIGHT.md` |
| 2 | ERD-SAVE-01 | **Hecha** (parcial frente al plan, §3) | `[ERD-SAVE-01] implementa recomendaciones energéticas explicables` | `docs/qa/ERD-SAVE-01.md`, `backend/api/RECOMMENDATIONS.md` |
| 3 | ERD-SCORE-01 | **Hecha** | `[ERD-SCORE-01] implementa Energy Score explicable y versionado` | `docs/qa/ERD-SCORE-01.md`, `backend/api/ENERGY_SCORE.md` |
| 4 | ERD-INT-01 | **Hecha** | `[ERD-INT-01] implementa registro e historial de interrupciones` | `docs/qa/ERD-INT-01.md`, `backend/api/OUTAGES.md` |

Verificación final del módulo (sobre el árbol con los 4 commits):

| Comprobación | Resultado |
|---|---|
| Migraciones desde una base vacía, `0022` y `0023` con ida y vuelta (`downgrade 0021` → `upgrade head`), un solo `head`, seed idempotente | OK. `alembic check`: «No new upgrade operations detected» (sin deriva modelo ↔ migraciones, incluidas las restricciones de exclusión) |
| Suite completa de la API (PostgreSQL real, base aislada `energy_rd_test`) | **1082 pasan**, 0 fallos |
| Web: `tsc`, `eslint`, `vitest`, `next build` de producción | OK · 816 pruebas pasan (5 omitidas: integración contra API viva, como antes) |
| Móvil: `tsc` y `vitest` | OK · 541 pasan (11 omitidas: igual que antes) |
| `core` / `api-contracts` / `api-client` | 85 / 17 / 66 pruebas pasan |
| Contratos generados y OpenAPI al día (`generate_contracts --check`) | OK |
| `check_architecture.py` (servicios sin FastAPI, cálculos sin ORM) | OK |
| `git diff --check` | OK |
| Playwright contra PostgreSQL + API + worker + web reales (61 pruebas) | ver `docs/qa/ERD-E2E-PLAYWRIGHT.md` (dos corridas consecutivas desde cero) |
| Sin secretos, `.env`, documentos personales, `.only`, `skip` ni `fixme` en el diff | OK (búsqueda sobre `5c5d42d..HEAD`) |
| Flujos Maestro afectados (`auth-flow`, `pilot-flow`: Perfil y Panel cambiaron) | **No ejecutados**: no hay `maestro`, `adb` ni simulador en este entorno. Solo pasan las pruebas estáticas (`maestroFlows.test.ts`) |

## 2. Revisión de seguridad y autorización del módulo

- **Autorización**: las 4 rutas nuevas (recomendaciones ×3, score ×1, apagones ×6) cuelgan de `authorize_home`. El inventario
  `test_private_route_inventory_remains_covered` falla si una ruta privada no se prueba: cada una se verifica con 401 (sin token) y
  404 (persona ajena, sin revelar si la vivienda existe), y los ids hijos se filtran siempre por `home_id`.
- **BFF**: lista blanca estricta por ruta; filtros de consulta cerrados; cuerpos `.strict()`; la respuesta se valida contra el
  contrato **y** contra la vivienda/id de la ruta; el texto de error del servidor nunca llega al navegador.
- **Entradas**: `extra="forbid"` en `OutageIn` y `RecommendationStatusIn`; estados acotados (`resolved` no se puede imponer);
  el cliente no envía `home_id`; la base repite las reglas (CHECK, UNIQUE, EXCLUDE).
- **Datos personales**: los apagones y las recomendaciones van en la exportación de la cuenta y se borran en cascada con la
  vivienda o la cuenta. No se guardan datos de terceros.
- **Observaciones (no bloqueantes)**: (a) cualquier miembro de la vivienda —no solo el propietario— puede registrar apagones y
  decidir recomendaciones, igual que con facturas y equipos; (b) entrar a «Ahorro» dispara un `POST …/refresh` (escritura breve,
  con bloqueo de la vivienda); no tiene límite de frecuencia propio y un miembro podría llamarlo en bucle: el costo es pequeño
  pero conviene añadir un límite si se abre a más viviendas por persona.

## 3. Brechas del módulo frente a `PLAN_COMPLETO_ENERGY_RD.md`

| Plan | Qué falta |
|---|---|
| ERD-SAVE-01 («reglas de ahorro … con impacto, RD$ y dificultad + “Aplicar objetivo”») | **No hay campo de dificultad** ni la acción «Aplicar objetivo» (convertir el ahorro en meta). Las reglas «nocturno» y «standby» existen solo de forma indirecta (anomalía `night` y la regla `always-on-two-hours`). Los umbrales de todas las reglas son valores de partida **sin calibrar con consumos reales** |
| ERD-SCORE-01 («configurable») | «Configurable» = constantes versionadas del motor (`SCORE_VERSION`); no hay pesos editables por persona ni historial de puntajes (se deriva cada vez) |
| ERD-INT-01 | Solo registro manual e historial; no hay alertas ni recordatorios por apagones ni cruce con las lecturas del medidor |
| CH-09 (EnergyGauge) | Ya tiene API: se muestra en el panel web y móvil |

## 4. Límites de la verificación del módulo

1. **El job `e2e web` de GitHub Actions no se ha ejecutado**: aquí solo se corrió el mismo comando localmente. La primera corrida
   en CI puede mostrar diferencias de entorno (Tesseract, tiempos de arranque de `next dev`, `playwright install --with-deps`).
2. E2E solo con Chromium de escritorio y `next dev` (la configuración de producción de la web exige `API_BASE_URL` HTTPS);
   el build de producción se prueba aparte (`next build`).
3. El móvil se cubre con lógica pura y pruebas de estructura (no hay render de React Native en `vitest`) y **sin Maestro**.
4. Los ahorros, el score y las agregaciones usan reglas visibles y etiquetadas (ESTIMADO / INFERIDO); no son mediciones.

## 5. Tareas abiertas que siguen bloqueadas por factores externos

Se informaron como abiertas en cada corte; ninguna se cerró con simulaciones.

| ID | Qué falta de verdad |
|---|---|
| ERD-OCR-REAL-QA | Facturas reales de las tres distribuidoras (el OCR se probó con facturas sintéticas y patrones de formato; la tasa de acierto real es desconocida) |
| ERD-E2E-MAESTRO-AUTH | Simulador/emulador y las dos plataformas; hay flujos escritos pero no se ejecutaron en esta máquina |
| ERD-A11Y-NATIVE | Lectores de pantalla nativos (VoiceOver/TalkBack) en dispositivos |
| ERD-RELEASE-QA | La promoción `Dev → QA → main` la hace Manuel (`WORKFLOW_RULES.md`) |
| ERD-LEGAL-FINAL | Revisión legal humana de los borradores (`docs/legal/*_DRAFT.md`) |
| ERD-DEPLOY-01 | Cuentas, dominio, TLS y secretos de producción |
| ERD-OBS-01 | DSN de Sentry/APM reales |
| ERD-OPS-DR | Infraestructura de respaldo y un simulacro real de recuperación |
