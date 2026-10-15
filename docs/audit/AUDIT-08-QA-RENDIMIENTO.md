# AUDIT-08 — QA, rendimiento, regresión y compatibilidad

Modo: solo lectura sobre el repositorio (git limpio antes y después). Se ejecutaron suites existentes y una medición local acotada en **bases desechables** que se eliminaron al terminar (`energy_rd_audit08_disposable`; la de E2E, `energy_rd_e2e`, la gestiona y borra el propio arnés). No hubo carga destructiva ni contra servicios externos.
Árbol: `Dev` @ `5e761c6`. Fecha: 11-oct-2026. Entorno: contenedor Linux compartido, PostgreSQL 16 local, Node 22.22 (el repo exige 24: ver F08-08), Python 3.12.

## 1. Resultado de las suites en el estado actual (reejecutadas en esta auditoría)

| Suite | Resultado | Duración | Comentario |
|---|---|---|---|
| API (pytest, PostgreSQL real) | **1 082 passed**, 0 fallos, 0 omitidas, 1 aviso (obsolescencia de `httpx` en `starlette.testclient`) | 500 s (8 min 20 s) | Corrió en paralelo con `npm test` y otras lecturas: la duración es una cota superior |
| Web (vitest) | **816 passed**, 5 omitidas (77 archivos; 1 omitido) | 41 s | Las 5 omitidas son `describe.skipIf(!API_URL)` (integración contra API real; se ejecutan en el job `mobile-e2e` del CI) |
| Móvil (vitest) | **541 passed**, 11 omitidas (66 archivos; 3 omitidos) | 7 s | Las 11 omitidas son recorridos contra API real (`src/e2e/*`, requieren URL); no hay render de React Native (pruebas de lógica + estructura) |
| `packages/core` | 85 passed (8 archivos) | 1 s | |
| `packages/api-client` | 66 passed (11 archivos) | 2 s | |
| `packages/api-contracts` | 17 passed (4 archivos) | <1 s | |
| E2E web (Playwright, Chromium, API + worker + `next dev` reales, BD `_e2e`) | **61 passed** (9 especificaciones) | 6 min 6 s | Sin procesos ni bases residuales tras la ejecución |
| `check_architecture.py`, `contracts:check`, `typecheck`, `git diff --check` | OK | — | Ejecutados en AUDIT-01/02 |
| **Total** | **2 607 pruebas unitarias/integración pasadas + 61 E2E** | | 0 fallos |

No ejecutado aquí: E2E en GitHub Actions (el job `e2e-web` no se ha visto verde en la nube), Maestro (7 flujos YAML, sin emulador), pruebas en dispositivo, WebKit/Firefox.

## 2. Inventario y matriz de cobertura por módulo

Cobertura **funcional por referencia** (no por líneas: no hay `pytest-cov` ni `vitest --coverage` configurados, F06-06).

| Módulo | API (pytest) | Web unitaria/integración | E2E web (Playwright) | Móvil (vitest) | Maestro / dispositivo |
|---|---|---|---|---|---|
| Registro, login, sesiones, refresh | `test_auth`, `test_auth_security`, `test_auth_abuse` | ~22 archivos `lib/auth/*` (BFF) | `01-auth` (9) | `auth/*` (9 archivos) | `auth-flow.yaml` (no ejecutado) |
| Recuperación / cambio de contraseña | `test_password_recovery(_races)`, `test_password_change` | páginas olvidé/restablecer | `01-auth`, `05-profile…` | `client.forgot` | — |
| Viviendas, onboarding, compartir/invitar | `test_api_onboarding`, `test_home_sharing`, `test_onboarding_acceptance`, `test_authorization` | `phase2-pages`, share-panel | `02-homes`, `05-profile-share-authz` | `homes/*` | `pilot-flow.yaml` |
| Facturas, detalle, ítems, pago, validación | `test_api_homes_bills`, `test_bill_detail(_integrity)`, `test_calculations` | `new-bill-page`, bills | `03-bills` | `billForm`, bills | `phase2-flow.yaml` |
| OCR (parser, preproceso, trabajos) | 9 archivos `test_ocr_*` (124 funciones de prueba) + `test_jobs` | `bill-ocr` | `03-bills` (OCR real sobre factura sintética) | `BillOcrScreen` (estructura) | **Pendiente**: facturas reales (ERD-OCR-REAL-QA, bloqueada) |
| Lecturas, consumo, panel | `test_api_readings`, `test_api_consumption`, `test_consumption_calc`, `test_api_dashboard` | `insights-pages`, charts | `04-insights` | `consumption/*` | `pilot-flow.yaml` |
| Equipos, meta, contrato, tarifas | `test_equipment_details`, `test_api_goals`, `test_tariff_calc`, `test_api_tariffs` | goal/equipment | `04-insights` | `equipment/*`, `goals/*` | — |
| Anomalías y alertas | `test_anomaly_engine`, `test_anomaly_scan`, `test_alert_rules`, `test_alerts_notifications` | `features/anomalies` | `04-insights` | `alerts.ts` | — |
| Recomendaciones / Energy Score / Apagones (módulo 1) | `test_recommendations` (24), `test_energy_score` (20), `test_outages` (20) | `savings-page`, `energy-score-card`, `outages-page` | `07-savings`, `08-energy-score`, `09-outages` | `savings/*`, `scoreRows`, `outages/*` | — |
| Documentos / almacenamiento | `test_documents`, `test_document_storage` (35), `test_storage_reconcile` | — | `03-bills` | — | — |
| Cuenta (exportación, borrado, preferencias, legal) | `test_account_deletion`, `test_data_export`, `test_account_settings`, `test_legal_consent` | `profile-page`, account-settings | `05-profile-share-authz` | `account.ts` | `qa/labels-flow.yaml` |
| Observabilidad, configuración, migraciones, BD | `test_observability`, `test_telemetry`, `test_config` (23), `test_migrations`, `test_db_safety`, `test_seed` | `telemetry` | — | — | — |
| Resiliencia (API caída/recuperada) | — | estados de error (`06-states-keyboard`) | `06-states-keyboard` (9) | `qa/api-down-flow.yaml`, `api-up-flow.yaml` | no ejecutados |

Huecos de cobertura identificados (ver §6): sin pruebas de **carga/rendimiento automatizadas con presupuesto**, sin pruebas de **navegador distinto de Chromium**, sin **render nativo** del móvil, sin **pruebas de contrato contra la API desplegada**.

## 3. Medición de rendimiento local (controlada)

Método: `scripts` temporal (en el área de trabajo de la sesión, no en el repo) que crea una BD desechable, aplica las 23 migraciones, siembra los 5 hogares piloto y añade **datos sintéticos**: 5 hogares × (27 facturas, **730 lecturas diarias**, 10 equipos). API real (`uvicorn`, 1 proceso, `AUTH_ENABLED=false`) en `127.0.0.1`, cliente en el mismo equipo (**sin latencia de red**). 60 peticiones secuenciales por endpoint tras calentamiento (8 en los pesados). Mediciones en milisegundos. **Son cifras de este equipo y este conjunto de datos, no una promesa de capacidad ni extrapolables a Render/Neon** (instancias Free/Starter y red real serán más lentas).

### 3.1 Latencia secuencial (concurrencia 1) y sentencias SQL por petición

| Endpoint (GET) | SQL | Bytes | p50 | p95 | p99 | Errores |
|---|---:|---:|---:|---:|---:|---:|
| `/homes` | 1 | 1 891 | 3,9 | 4,4 | 5,5 | 0 |
| `/homes/{id}/dashboard` | 3 | 2 092 | 7,0 | 9,2 | 10,8 | 0 |
| `/homes/{id}/recommendations` | 2 | 290 | 5,2 | 7,2 | 7,3 | 0 |
| `/homes/{id}/bills?limit=100` | 2 | 9 067 | 5,3 | 6,3 | 7,4 | 0 |
| `/homes/{id}/readings?limit=100` | 2 | 22 501 | 6,3 | 8,2 | 78,0 | 0 |
| `/homes/{id}/equipment` · `/alerts` · `/anomalies` | 2 | 3 595 · 527 · 2 | 4,7 · 5,2 · 5,0 | 6,1 · 6,3 · 5,5 | 7,5 · 7,4 · 5,9 | 0 |
| `/homes/{id}/equipment/estimate` | 3 | 5 282 | 6,0 | 7,6 | 8,5 | 0 |
| `/homes/{id}/goal/progress` | 7 | 638 | 9,7 | 12,9 | 19,3 | 0 |
| `/homes/{id}/energy-score` | 10 | 2 418 | 14,1 | 16,5 | 17,1 | 0 |
| `/homes/{id}/outages/summary` · `/tariffs` | — | — | 4,6 · 6,4 | 5,5 · 9,7 | 5,7 · 13,6 | 0 |
| **`/consumption` mensual, 12 meses** (preset «12 meses» de web/móvil) | 11 | 3 019 | **599,9** | **716,4** | 770,5 | 0 |
| **`/consumption` semanal, 12 meses** | — | — | **617,3** | 699,8 | 699,8 | 0 |
| `/consumption` diario, 60 días | — | — | 40,2 | 64,5 | 141,8 | 0 |
| `/consumption` diario, 90 días | — | — | 70,3 | 96,6 | 115,6 | 0 |
| **`/consumption` diario, 12 meses** | 11 | 50 999 | **853,3** | **980,6** | 980,6 | 0 |

**N+1:** el número de sentencias SQL por petición es **constante y bajo (1–11)** aunque las listas devuelvan 27–100 filas: no se observó N+1 en ningún endpoint medido.

### 3.2 Concurrencia (`/dashboard`, 200 peticiones, 5 hogares)

| Clientes simultáneos | Peticiones/s | p50 | p95 | p99 | Errores |
|---:|---:|---:|---:|---:|---:|
| 1 | 154,7 | 6,3 | 7,7 | 10,0 | 0 |
| 4 | 151,9 | 25,8 | 34,3 | 44,4 | 0 |
| 8 | 156,3 | 50,0 | 63,7 | 72,3 | 0 |
| 16 | 139,1 | 102,6 | 210,7 | 237,8 | 0 |

Lectura: con 1 proceso, el rendimiento satura en ≈150 peticiones/s (≈6,5 ms de CPU por petición); la latencia crece linealmente por cola, **sin errores** hasta 16 clientes simultáneos con consultas rápidas. **No se reprodujo el agotamiento del pool de BD (F06-03)**: necesita peticiones lentas o bloqueos largos, que esta prueba no genera (y no se forzó, por la regla de no hacer DoS).

### 3.3 Efecto de un cálculo pesado sobre el resto del servidor

16 peticiones de `/consumption` diario de 12 meses, 4 en paralelo, mientras una sonda pide `/health/live` cada 50 ms (116 sondeos):

| Métrica | Valor |
|---|---|
| Latencia de cada petición pesada (p50 / máx.) | **3 907 ms / 4 376 ms** (vs 853 ms en solitario) |
| `/health/live` sin carga (p50) | 1,4 ms |
| `/health/live` durante la carga (p50 / p95 / máx.) | **66,6 ms / 202,1 ms / 379,3 ms** |
| Errores | 0 |

Es el mismo mecanismo que SEC-02 (trabajo de CPU en Python que retiene el GIL y el proceso único), pero con un endpoint **legítimo y de uso normal**, no con la ruta OCR heredada.

## 4. Hallazgos de QA y rendimiento

| ID | Sev. | Hallazgo | Evidencia | Corrección sugerida |
|---|---|---|---|---|
| F08-01 | **Media** | **El cálculo de consumo es O(cubetas × intervalos) y se repite 3 veces por petición.** `allocate` recorre todos los intervalos por cada cubeta (`consumption_calc.py:122-149`) y `build_consumption` lo ejecuta para el rango actual y, dentro de `_comparison`, **otra vez para el período anterior y para el actual en granularidad diaria** (`consumption.py:98-121`), aunque ya tiene el resultado. Con lecturas diarias, el atajo «12 meses» (el más usado) tarda **≈600 ms** y el diario de 12 meses **≈850–980 ms**; en concurrencia 4 sube a ≈3,9 s y degrada hasta `/health/live` (p95 202 ms, máx. 379 ms). Con pocas lecturas (p. ej. mensuales) el coste es mínimo: el problema escala con hogares que registran lecturas a diario durante un año | `consumption_calc.py:122-149`, `consumption.py:60-121`; §3.1–3.3 | Intervalos ordenados + búsqueda binaria/ventana deslizante (O(n+m)); reutilizar el resultado diario en `_comparison`; prueba de rendimiento con presupuesto (p. ej. p95 < 150 ms con 365 cubetas × 365 lecturas) |
| F08-02 | Media | **No hay pruebas de rendimiento ni de carga automatizadas con presupuesto** (solo `scripts/load_pilot.py`, manual, solo `/dashboard`); por eso F08-01 no se detectó. No hay umbrales en CI ni seguimiento de latencias | `scripts/load_pilot.py`, `ci.yml` | Prueba de humo de rendimiento en CI (datos sintéticos, umbrales holgados) + guion de carga reutilizable para staging |
| F08-03 | Media | **El job `e2e-web` de CI nunca se ha visto verde en GitHub Actions** (el PR #22 se fusionó sin que llegara a completarse); localmente: 61/61 | historial PR #22; §1 | Vigilar la primera ejecución real en `Dev`; si falla, tratarlo como bloqueo de CI |
| F08-04 | Baja | **Sin cobertura de líneas** (Python ni TS): no se puede fijar un umbral ni detectar regresiones de cobertura | `pyproject.toml`, `vitest.config.*` | `pytest-cov` y `vitest --coverage` con umbral inicial realista |
| F08-05 | Baja | E2E solo en **Chromium de escritorio**; sin WebKit/Firefox ni viewport móvil | `frontend-web/app/playwright.config.ts` | Añadir proyectos `webkit` y `mobile-chrome` al menos para las 4 pruebas etiquetadas `@smoke` |
| F08-06 | Baja | El móvil se prueba por lógica y estructura, sin render de React Native; los flujos Maestro (7) no se ejecutan en CI ni aquí | `maestroFlows.test.ts` | Pruebas de componente con `@testing-library/react-native` en las pantallas críticas; Maestro en un runner con emulador (tarea ERD-E2E-MAESTRO-AUTH) |
| F08-07 | Info | pytest tarda ≈8 min (1 082 pruebas, BD real) y E2E ≈6 min: coste de CI aceptable; paralelizar (`pytest-xdist` con BD por trabajador) si crece | §1 | — |
| F08-08 | Info | Todas las pruebas se ejecutaron con Node **22.22** aunque `engines` exige `>=24 <25` (CI/Render usan 24): una diferencia de runtime no cubierta por esta verificación local | `package.json:47-49` | Repetir en Node 24 (lo hará CI) |
| F08-09 | Info | Aviso de obsolescencia: `starlette.testclient` + `httpx` («install `httpx2`») | salida de pytest | Planificar la actualización de dependencias de prueba |

## 5. Idempotencia, concurrencia y consistencia (evidencia existente + nueva)

- **Idempotencia:** `app.seed` se ejecuta dos veces en CI; `recommendations/refresh`, escaneo de anomalías y alertas son idempotentes por `dedupe_key`; la cola de trabajos usa `idempotency_key`; `PUT /auth/devices` idempotente; el borrado de cuenta y de objetos tiene reintentos seguros. Cubierto por `test_recommendations`, `test_anomaly_scan`, `test_jobs`, `test_storage_reconcile`, `test_account_deletion`.
- **Concurrencia:** 20 hilos con facturas solapadas → 1 aceptada, 19 rechazadas por la restricción de exclusión (AUDIT-04, prueba 3); `FOR UPDATE` por hogar en escrituras; carreras de recuperación de contraseña (`test_password_recovery_races`); época de sesión en el BFF contra carreras login/logout.
- **Consistencia web ↔ API:** validación Zod de cada respuesta y comprobación de pertenencia en el cliente; contrato regenerado y verificado en CI.
- **Resiliencia a fallos de dependencias:** correo/push con *timeout* y degradación (fallos no revierten la escritura del usuario: `SAVEPOINT`); API caída/recuperada cubierta por E2E y Maestro (este último no ejecutado).

## 6. Compatibilidad y accesibilidad (resumen; detalle en AUDIT-05)

- Web: Chromium de escritorio verificado; navegadores y tamaños móviles **no verificados**. 262 atributos `aria-*`/`role`, recorrido de teclado en E2E y pruebas de accesibilidad (`a11y.test.tsx`).
- Móvil: 123 etiquetas/roles de accesibilidad verificados por prueba estática; TalkBack/VoiceOver, tamaños de fuente, rotación y dispositivos de gama baja **no verificados** (ERD-A11Y-NATIVE y ERD-RELEASE-QA, bloqueadas externamente).

## 7. Plan de regresión propuesto

| Momento | Qué correr | Duración aprox. |
|---|---|---|
| Cada PR (ya en CI) | typecheck, lint, arquitectura, contratos, pytest, vitest, build web, E2E web | ≈15–20 min |
| Cada PR (a añadir) | CodeQL, gitleaks, cobertura con umbral, humo de rendimiento (F08-02) | +3–5 min |
| Semanal (ya) | `deps-monitor` (npm audit + pip-audit) | — |
| Nocturno (a añadir) | E2E en WebKit/Firefox + móvil Chromium; guion de carga sobre staging; Maestro cuando haya runner | — |
| Antes de cada versión | Los anteriores + Maestro Android/iOS en dispositivo + checklist `docs/RELEASE_CHECKLIST.md` + simulacro de restauración | manual |

**Flujos críticos que deben tener siempre una prueba E2E verde:** registro→vivienda→factura (manual y OCR)→panel; login/refresh/logout y revocación entre pestañas; aislamiento entre cuentas; recomendaciones→aplicar; apagones; recuperación de contraseña; borrado y exportación de cuenta.

## 8. Limitaciones

- Medición con un solo proceso, mismo equipo para cliente/servidor/BD, sin red, con datos sintéticos y una distribución uniforme de lecturas; **no representa producción**.
- No se probó carga sostenida, picos ni agotamiento de recursos (regla de la auditoría).
- No se midió consumo de memoria/CPU de contenedores ni tamaño de *bundle* ni tiempos de carga en navegador/dispositivo (sin herramientas instaladas para ello).
- Las cifras de cobertura son por referencia a rutas/módulos, no por líneas.
