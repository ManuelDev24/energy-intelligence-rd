# AUDIT-02 — Arquitectura, SOLID y Clean Code

Modo: solo lectura (no se refactorizó nada). Rama `Dev` @ `5e761c6`.
Métricas calculadas en esta auditoría (reproducibles): LOC por `git ls-files` sin tests ni código generado; longitud y complejidad ciclomática de funciones Python por AST (`ast`, sin instalar herramientas); búsquedas `grep` de patrones.

## 1. Tamaño y forma del sistema

| Área | LOC (sin tests ni generado) | Observación |
|---|---|---|
| `backend/api/app` | 11 337 | 527 funciones; capas `api/` → `services/` → `models/` |
| `frontend-web/app/src` | 8 022 | Next.js; BFF + features por dominio |
| `frontend-mobile/app/src` | 8 707 | Expo; features por dominio |
| `packages/core/src` | 1 041 | Lógica de dominio compartida (TypeScript puro) |
| `packages/api-client/src` | 308 | Interfaz `Api` + cliente |
| `packages/api-contracts` | generado | OpenAPI → Zod |
| Pruebas | 58 archivos Python (10 800 LOC) + 176 archivos TS | Relación ≈ 1 : 1 con el código de la API |

## 2. Reglas de dependencias entre capas (verificado)

| Regla | Resultado | Evidencia |
|---|---|---|
| `services/` y `models/` no importan `app.api` | ✔ 0 incumplimientos | `grep` + `scripts/check_architecture.py` («Architecture boundaries passed», ejecutado) |
| `services/` no importa FastAPI | ✔ 0 | `check_architecture.py` (también en CI) |
| `models/` no importa `services/` | ✔ 0 | `grep` |
| `packages/core` sin React/Next/React Native | ✔ 0 | `grep` |
| web ↔ mobile sin dependencias cruzadas | ✔ 0 | `grep` |
| Componentes web sin `fetch` directo (todo vía cliente/BFF) | ✔ 0 | `grep` |
| Contrato API ↔ clientes generado, no manual | ✔ (`--check` en CI) | `ci.yml` |

La arquitectura declarada se cumple y está **protegida por una prueba automática** (poco habitual a este tamaño). No se encontraron dependencias circulares a nivel de paquete; a nivel de módulo hubo un ciclo `equipment ↔ recommendations` resuelto con import diferido (`gather_facts` → `shares_pct`), señal de acoplamiento a vigilar.

## 3. Evaluación por módulo

| Módulo | Cohesión | Acoplamiento | Riesgo técnico | Nota |
|---|---|---|---|---|
| Auth (`services/auth.py`, `auth_abuse.py`, `api/auth_deps.py`, BFF) | Alta | Medio (BFF ↔ API por cabecera firmada) | **Medio** | Diseño sofisticado (rotación + detección de reutilización + época de sesión); el BFF concentra mucha lógica (ver §5) |
| Homes / Sharing / Account | Alta | Bajo | Bajo | Membresía y propietario aislados en `authorize_home`/`require_home_owner` |
| Bills + OCR (`bills.py`, `bill_detail.py`, `ocr/*`) | Media | Medio | **Alto** | `parse_bill_text`: 198 líneas, complejidad ciclomática 103 (§4); ruta `/ocr` síncrona (F06-01) |
| Readings / Consumption / Dashboard | Alta | Bajo | Bajo | `build_dashboard` (85 líneas) es el agregador previsto |
| Equipment / Goals / Contract / Tariffs | Alta | Bajo | Bajo | Cálculo de tarifas aislado (`tariff_calc.py`) |
| Anomalies / Alerts / Notifications / Push / Email | Media | Medio | Medio | `notifications.deliver` (CC 23); salida HTTP con timeouts y fuera del hilo de la petición |
| Recommendations / Energy Score / Outages (módulo 1) | Alta | Bajo | Bajo | Motores puros separados de la persistencia; derivados idempotentes por `dedupe_key` |
| Documents / Storage / Jobs / Worker | Alta | Bajo | Bajo-Medio | Cola en PostgreSQL con `FOR UPDATE SKIP LOCKED` (verificado en AUDIT-04); cifrado con rotación de claves |
| `packages/core` | Alta | Muy bajo | Bajo | Lógica compartida web/móvil; buena práctica |

## 4. Clean Code (métricas reales)

- **Funciones largas (>40 líneas):** 12 de 527; >60 líneas: 2 (`parse_bill_text` 198, `build_dashboard` 85).
- **Complejidad ciclomática ≥ 10:** 48 funciones; **≥ 15:** 14. Las peores: `parse_bill_text` (103), `config.validate_environment` (48, es una cadena de validaciones planas, aceptable), `bill_detail.assess_bill` (29), `anomaly_engine.detect_night` (26), `notifications.deliver` (23), `ocr.pipeline._from_pdf` (20).
- **Muchos parámetros (≥8):** 5 (`documents.register_document` 10, `goals._progress` 9, `jobs.queue.fail/enqueue` 8, `anomaly_engine._shift_text` 8).
- **Archivos grandes (no tests):** `bff.ts` 546, `ocr/parser.py` 461, `DashboardScreen.tsx` 394 (móvil), `DashboardPage.tsx` 367 (web), `packages/api-client/src/index.ts` 308. Nada supera 600 líneas.
- **Higiene del código:** 0 `any`, 0 `@ts-ignore/@ts-expect-error/@ts-nocheck`, 1 `eslint-disable` (móvil), 0 `TODO/FIXME/HACK` reales (las 3 coincidencias en la API son la palabra española «TODOS»). Muy por encima de lo habitual.
- **Comentarios:** abundantes y explican el *porqué* (decisiones de seguridad/negocio); en español, coherente con el producto. Algunos comentarios mezclan inglés y español (p. ej. `parser.py:266-267`).
- **Nombres:** coherentes por dominio; mezcla de convenciones de archivos entre apps (`rd-time.ts` kebab-case en web vs `rdTime.ts` camelCase en móvil) — cosmético.
- **Pruebas:** 87/87 rutas con referencias en tests; sin medición de cobertura de líneas (F06-06).

## 5. SOLID

| Principio | Valoración | Evidencia / riesgo |
|---|---|---|
| **S — Responsabilidad única** | Buena, con 3 excepciones | `bff.ts` (546 líneas, ~25 funciones) mezcla configuración, cookies/época, firma de IP, tabla de rutas permitidas, esquemas de escritura, mapeo de errores y proxy; `ocr/parser.py::parse_bill_text` mezcla votación entre alternativas, extracción de campos y reconciliación; pantallas `DashboardScreen/DashboardPage` combinan datos y presentación |
| **O — Abierto/cerrado** | Buena | Motores de reglas por tipo (anomalías, recomendaciones, score) se amplían añadiendo reglas; backends de almacenamiento/email/push intercambiables por configuración. Punto débil: la lista blanca del BFF obliga a editar `bff.ts` por cada endpoint nuevo (deliberado por seguridad, pero costoso) |
| **L — Sustitución de Liskov** | Buena | Interfaz `Api` (api-client) implementada por cliente real y simulado (`mock-api`); `ObjectStore` con implementaciones local/S3/deshabilitada |
| **I — Segregación de interfaces** | Aceptable | La interfaz `Api` del web (`frontend-web/app/src/lib/api/types.ts:28`, ~41 métodos) crece con cada módulo y los mocks deben implementarla entera (costó tiempo en el módulo 1: hubo que añadir métodos a `mock-api` y a la interfaz) |
| **D — Inversión de dependencias** | Buena | Servicios sin FastAPI; clientes web/móvil dependen de la interfaz `Api`; inyección de `fetch`/transportes en el BFF y los clientes (facilita pruebas) |

## 6. Duplicación entre web y móvil

| Elemento | Web | Móvil | Riesgo |
|---|---|---|---|
| Fecha/hora de República Dominicana | `lib/rd-time.ts` (53 líneas): `todayRD`, `nowTimeRD`, `addDaysIso`, `inclusiveDays`, `localToIso`, `isoToRD`, `formatReadAt` | `lib/rdTime.ts` (54 líneas): `todayRD`, `nowRD`, `addDays`, `parseTime`, `toReadingIso`, `localParts` | **Medio:** misma regla de dominio (UTC−4 fijo, sin horario de verano) implementada dos veces con nombres y firmas distintas; un cambio o un error de borde (fin de mes, medianoche) puede divergir. Candidato a `packages/core` |
| Formato numérico/moneda/fechas | `lib/format.ts` (19) | `lib/format.ts` (12) | Bajo: ambos delegan en `@energyrd/core/format` |
| Formularios de factura | `features/bills/form.ts` (102 líneas) | `features/bills/form.ts` (110 líneas) | Bajo-Medio: validación casi paralela; ya hay `core/validation.ts` |
| Hooks de datos | `lib/api/hooks.ts` (288) | `api/hooks.ts` (255) | Bajo: misma estructura sobre React Query; esperable |
| Lógica de dominio (tarifas, score, recomendaciones, interrupciones, equipos) | en `packages/core` | en `packages/core` | ✔ compartida correctamente |

## 7. Hallazgos de arquitectura

| ID | Sev. | Hallazgo | Evidencia | Recomendación |
|---|---|---|---|---|
| F02-01 | Media | `parse_bill_text`: 198 líneas, CC 103; es el punto de mayor riesgo de regresión del parser OCR (cualquier cambio afecta a todos los campos) | `backend/api/app/services/ocr/parser.py:264` | Dividir por campo (extractores puros) + reconciliador; mantener las pruebas existentes como red de seguridad |
| F02-02 | Media | `bff.ts` concentra 8 responsabilidades en 546 líneas | `frontend-web/app/src/lib/auth/bff.ts` | Separar en `config`, `cookies/epoch`, `routes` (tabla declarativa), `schemas`, `errors`, `proxy`; sin cambiar el comportamiento (~20 archivos de test lo protegen) |
| F02-03 | Media | Utilidades de fecha RD duplicadas con APIs distintas | `rd-time.ts` vs `rdTime.ts` | Mover a `@energyrd/core` con una única API y pruebas de bordes |
| F02-04 | Baja | Interfaz `Api` del web monolítica (~41 métodos) | `frontend-web/app/src/lib/api/types.ts:28` | Dividir por contexto (`AuthApi`, `HomesApi`, `BillsApi`, …) y componer |
| F02-05 | Baja | Ciclo `equipment ↔ recommendations` resuelto con import diferido | `recommendation_engine`/`equipment` | Extraer `shares_pct` a un módulo común |
| F02-06 | Baja | Parámetros excesivos (≥8) en 5 funciones; `assess_bill`/`detect_night` con CC 26–29 | ver §4 | Objetos de parámetros / dividir reglas |
| F02-07 | Baja | Pantallas principales de 370–390 líneas mezclan datos y presentación | `DashboardScreen.tsx`, `DashboardPage.tsx` | Extraer subcomponentes por tarjeta (ya hay `EnergyScoreCard`, `SavingsCard`) |
| F02-08 | Info | Convenciones de nombre de archivo distintas entre web (kebab) y móvil (camel) | — | Documentar; sin acción |
| F02-09 | Info | Workspace `mcp/*` inexistente y `.agents/` versionado | `package.json:28` | Ver F07-08 |

## 8. Plan de refactor propuesto (NO ejecutado; requiere aprobación)

1. **Sin riesgo de comportamiento** (antes de cualquier otra cosa): F02-03 (unificar fechas RD en `core` con pruebas de bordes) y F02-04.
2. **Con red de seguridad de pruebas existentes:** F02-02 (BFF por módulos), F02-01 (parser OCR por extractores).
3. **Oportunista:** F02-05…F02-07 cuando se toque cada archivo.
Regla propuesta: cada refactor en su propio commit, sin cambios funcionales, con `npm test` + `pytest` + `check_architecture.py` + E2E verdes antes y después.

## 9. Limitaciones

- Complejidad medida solo en Python (AST). Para TypeScript se usaron tamaño de archivo y conteo de funciones (no se instaló ninguna herramienta de complejidad).
- No se evaluó rendimiento de render ni tamaño del bundle (ver AUDIT-08).
