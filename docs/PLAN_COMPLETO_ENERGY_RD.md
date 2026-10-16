# ⚡ Energy RD — Plan completo para cumplir el 100% del chat

> Fuente: chat compartido de ChatGPT (plan maestro, especificación de 33 módulos, arquitectura, presupuesto)
> contrastado con el estado real del repo al 4 de octubre de 2026.
> Este documento **no reemplaza** `SPRINT_PLAN_2026-10-02.md` (corte del piloto); es el mapa para llegar al plan completo.
> Estado: propuesta, pendiente de aprobación del propietario.

## 0. Cómo leer este plan

- ✅ ya existe en el repo · 🔄 parcial · ⛔ falta.
- Cada tarea tiene ID `ERD-…` y se cierra con `listo <ID>` + URL del commit en `Dev` (regla de `WORKFLOW_RULES.md`).
- Orden de construcción = el del chat: **Core loop primero** (Factura → Consumo → Análisis → Proyección → Alerta → Ahorro), IA después, tiempo real/IoT/solar al final.
- Regla de oro del chat: cada función termina **BD → Backend → API → Frontend → Test → Docs**. No hay pantalla sin dato real detrás.
- Regla de datos: todo valor se etiqueta `REAL`, `ESTIMATED`, `PROJECTED` o `INFERRED`. Nunca una estimación como lectura.

---

## 1. Inventario: chat vs. repo

### 1.1 Los 10 módulos del MVP real (sección 53 del chat)

| # | Módulo | Estado | Falta |
|---|---|---|---|
| 01 | Onboarding | 🔄 | Hoy solo "elegir vivienda". Faltan: ubicación (provincia/municipio/sector), distribuidora, tipo de usuario, perfil energético (personas, A/C, calentador, piscina, solar, inversor), objetivos |
| 02 | Dashboard | 🔄 | Falta gráfica de consumo por día, factura estimada vs. proyección, meta con barra, oportunidad de ahorro, Energy Score, accesos rápidos |
| 03 | Consumo | 🔄 | Solo barras mensuales. Faltan filtros Hoy/Semana/Mes/Año/Personalizado, comparar, kW promedio, pico máximo, promedio diario/semanal, lecturas |
| 04 | Facturas | 🔄 | Manual OK. Falta foto/archivo, OCR, pantalla de confirmación, `bill_items`, documento original, análisis de factura |
| 05 | Proyección | 🔄 | Lineal simple. Falta panel (días transcurridos/restantes, kWh proyectado, factura estimada), botón "¿Cómo bajar esta factura?" |
| 06 | Ahorro | ✅ | API, web y móvil ya tienen recomendaciones explicables, dificultad orientativa y aplicación de meta; falta calibración con datos reales y aceptación de staging |
| 07 | Alertas | 🔄 | Existen alertas por variación. Faltan 4 severidades de color, anomalías, recordatorios de pago, datos incompletos |
| 08 | Equipos | 🔄 | Existe CRUD + estimación. Faltan marca/modelo, iconos por tipo, % de consumo por equipo (gráfica) |
| 09 | Energy Copilot | ✅ | Conversaciones, fuentes, streaming y feedback en web; cliente nativo ya en Dev. Cuotas/privacidad están implementadas; admin agregados AI siguen en ERD-AI-ADMIN-WEB |
| 10 | Perfil | 🔄 | Perfil residencial, servicio y notificaciones básicos ya están en Dev; restan ajustes de cuenta/documentos y aceptación legal/de dispositivos según alcance |

### 1.2 Módulos 11–33 de la especificación (fuera del MVP real, dentro del plan completo)

Anomalías (11) · Consumo por equipo (13) · Interrupciones (14) · Historial del servicio (15) · Mapa energético (16) · Smart Meter (17) · IoT (18) · Solar (19) · Batería (20) · Calculadora solar (21) · Objetivos (23) · Gamificación (24) · Mi vivienda (26) · Configuración (27) · Centro de ayuda (28) · Reclamaciones (29) · Business (30) · Condominios (31) · Administración (32) · Energy Intelligence RD (33). **Baseline `origin/Dev` `f3cb2f42` (2026-10-15):** Centro de ayuda (M28), reclamaciones (M29), informes/PDF, Copilot móvil, OCR admin, resumen administrativo y consulta de usuarios read-only ya están integrados; no son faltantes de desarrollo. El panel admin en conjunto es parcial; quedan paquetes finitos §5. Las demás funciones de visión siguen pendientes según su fase.

### 1.3 Infraestructura y stack

| Elemento del chat | Repo hoy | Acción |
|---|---|---|
| Auth (registro/login/roles) | Auth por usuario, membresía residencial y RBAC admin en `backend/api` | Base integrada; aceptación legal/operacional pendiente |
| Tablas: users, home_members, contracts, bill_items, meter_readings, tariffs, interruptions, forecasts, anomalies, recommendations, conversations, messages | Esquema extendido con estos dominios y sus migraciones | Auditar fuentes/retención; no inferir datos de telemetría sin meter readings |
| Expo Router + NativeWind | React Navigation + StyleSheet | Decisión: ver §6 (no migrar sin motivo) |
| React Hook Form + Zod | Zod sí; formularios manuales | Adoptar RHF en formularios nuevos |
| Recharts (web) / librería RN | Gráficas hechas a mano (sin librería) | Fase 2: Recharts web + victory-native/gifted-charts móvil |
| shadcn/ui | Estilo propio | Panel admin básico existe; no hace falta reescribir componentes para ampliar módulos |
| Redis + workers | Cola respaldada por PostgreSQL + worker | Salud real del worker/latido aún por construir |
| Storage de facturas | Storage configurado por backend y documentos protegidos | Prueba de proveedor real y despliegue pendientes |
| `frontend-web/admin`, `services/energy-engine`, `ai`, `ingestion`, `workers`, `mcp/energy-rd-mcp`, `packages/ui`, `database/` | `frontend-web/admin` sí existe con RBAC, auditoría, OCR, resumen y usuarios read-only; módulos lógicos adicionales no deben convertirse automáticamente en procesos/backend separados | Ampliar el mismo `backend/api`; despliegue admin requiere autorización |
| TimescaleDB + pgvector | ⛔ (Postgres 16 plano) | Fase 5 (telemetría) y Fase 3 (Copilot/RAG) |
| Playwright / Jest-RNTL | Vitest + Maestro + Playwright web/admin E2E | Ampliar aceptación de navegadores/dispositivos |
| Neon (prod) / Vercel / Expo EAS / Render o Fly | Config de despliegue preparada, sin staging desplegado | Fase 1 (despliegue piloto) |
| Sentry / monitoreo | Código admite configuración; DSN real no confirmado | Requiere cuenta/DSN y consentimiento; no inventar |

---

## 2. Sistema visual (colores, tipografía, componentes) — exactamente lo que dice el chat

### 2.1 Paleta del chat (sección 5)

| Rol | Hex | Uso |
|---|---|---|
| Verde energético | `#197A52` | Acciones principales, botones, tab activo |
| Azul técnico | `#2563EB` | Información y gráficos |
| Fondo neutro | `#F5F7F6` | Fondo de páginas |
| Texto principal | `#1F2937` | Texto y encabezados |
| Checkmark del chat (diagramas) | `#23845d` / `#43866b` | Iconos y líneas de arquitectura (solo docs) |

### 2.2 ✅ Conflicto resuelto — ERD-UX-TOKENS aplicado (2026-10-04, sin commit)

`packages/core/src/tokens.ts` usa una paleta **derivada del logo oficial** (aprobada 2026-10-02): verde `#0B6E4F`, fondo `#0B2B1F`, lima `#C6F432`, fondo `#F5F7FA`, texto `#0F172A`. `BRAND_ASSETS.md` prohíbe recolorear el logo.

**Propuesta (por defecto, hasta que el propietario decida):**
- El **logo, splash e icono no cambian** (marca).
- Los **tokens de interfaz** pasan a los valores del chat: `primary #197A52`, `info #2563EB`, `bg #F5F7F6`, `text #1F2937`.
- El verde oscuro `#0B2B1F` y la lima `#C6F432` se conservan solo para cabeceras de marca y acentos puntuales.
- Tarea: **ERD-UX-TOKENS** — un único cambio en `tokens.ts`; web y móvil lo heredan.

### 2.3 Colores semánticos (del chat, módulos 10 y calidad de dato)

| Concepto | Color | Fuente en el chat |
|---|---|---|
| 🔴 Alerta crítica | rojo (`danger`) | "Consumo extremadamente anormal" |
| 🟠 Advertencia | naranja/ámbar (`warning`) | "Aumento considerable" |
| 🟡 Información | amarillo | "Cambio de patrón" |
| 🟢 Ahorro | verde (`success`) | "Oportunidad detectada" |
| `REAL` | verde (`#197A52` sobre verde claro) | `DataStatusBadge` |
| `ESTIMATED` | azul (`#2563EB` sobre azul claro) | `DataStatusBadge` |
| `PROJECTED` | morado | `DataStatusBadge` (ya existe) |
| `INFERRED` | gris/ámbar punteado | `DataStatusBadge` (**falta**) |
| Estado Smart Meter | 🟢 conectado / 🔴 desconectado | módulo 17 |

### 2.4 Componentes reutilizables (los 12 del chat + los del módulo 22 de la especificación)

Estado: ✅ `QualityBadge`(≈DataStatusBadge), `AlertBanner`(≈AlertCard parcial), `QueryState`(≈Empty/Error/Loading parcial), `MonthlyChart`.
⛔ `MetricCard`, `ConsumptionChart`, `BillCard`, `DeviceCard`, `EnergyGauge`, `AlertCard` (con severidad), `RecommendationCard`, `DateRangePicker`, `EmptyState`, `ErrorState` (con reintentar), `LoadingSkeleton`, `BottomSheet`, `Modal`, `Button/Card/Input` unificados.
Se crean en `packages/ui` (web) y `frontend-mobile/app/src/components` con la **misma API** y los mismos tokens.

**Avance ERD-UI-KIT (2026-10-04, sin commit):** ✅ `MetricCard`, `DataStatusBadge` (+`INFERRED`), `AlertCard` (4 tonos 🔴🟠🟡🟢), `EmptyState`, `ErrorState` (Reintentar + sin conexión), `LoadingSkeleton` (respeta reducir movimiento), `ConsumptionChart`, `EquipmentBreakdown`, `EnergyGauge` en web (`frontend-web/app/src/components`) y móvil (`frontend-mobile/app/src/components`). ⛔ `DateRangePicker`, `BottomSheet`, `Modal`, `RecommendationCard`, `DeviceCard`, `BillCard` (llegan con sus módulos). Pendiente: mover la lógica de gráficos compartida (`chartMath`, `deltaTone`, iconos por tono) a `@energyrd/core`.

**Cierre ERD-UI-KIT (2026-10-10):** `packages/ui` se elimina del diseño y no se construyen componentes sin consumidor; ver `docs/architecture/UI_KIT.md` (Modal/ConfirmDialog, BillCard, RecommendationCard, DateRangePicker, BottomSheet hechos; DeviceCard hecho con ERD-DEV-02 (2026-10-11, ver `docs/qa/ERD-DEV-02.md`); el rango de fechas ya vive en `@energyrd/core`).

### 2.5 Reglas de experiencia (obligatorias, 7 del chat)

1. Indicadores más importantes primero. 2. Lenguaje simple; explicar kWh y RD$. 3. Real vs. estimado siempre visible. 4. Nada de gráficos vacíos ni métricas sin contexto. 5. Estados `loading / error / offline / empty` en cada pantalla. 6. Accesibilidad: contraste ≥ 4.5:1, objetivos táctiles ≥ 44 px (ya definido en tokens). 7. El usuario corrige lo que extrae el OCR antes de guardar.

---

## 3. Catálogo de gráficos y visualizaciones (todas las del chat)

| ID | Visualización | Dónde | Datos | Color / detalle del chat | Estado |
|---|---|---|---|---|---|
| CH-01 | Barras consumo mensual por factura (proyección punteada) | Dashboard, Consumo | bills | Real verde, proyectado punteado morado | ✅ Recharts (web) · SVG (móvil), con tabla/resumen accesible |
| CH-02 | Línea/área de kWh con filtros Hoy · Semana · Mes · Año · Personalizado | Consumo | meter_readings | Azul técnico `#2563EB`; eje kWh; botón **Comparar** (este mes vs. anterior) | ⛔ |
| CH-03 | Tarjetas de métricas: kWh, kW promedio, pico máximo, promedio diario/semanal, costo estimado, variación | Consumo | readings + tariffs | `MetricCard`, variación ▲/▼ con color | ⛔ |
| CH-04 | Consumo por hora con horas pico (6–10 PM) y valle (2–6 AM) | Consumo por hora | lecturas horarias | Resalta rangos; solo con datos reales (requiere Fase 5) | ⛔ |
| CH-05 | Deltas de factura: Consumo +14 % · Costo +18 % · Días +2 % | Análisis de factura | bills | Flechas y color por signo | 🔄 consumo y costo ✅; días falta en la API (`comparison.days_pct`) |
| CH-06 | Panel de proyección: consumo actual, días transcurridos/restantes, kWh proyectado, factura estimada | Proyección | forecasts | Etiqueta `PROJECTED` | 🔄 |
| CH-07 | Barra de meta (RD$ 6,000 · actual · proyección) | Dashboard, Objetivos | goals | Barra de progreso; rojo si la proyección excede la meta | ⛔ |
| CH-08 | Barra de impacto `████████░░` + ahorro RD$ + dificultad | Ahorro | recommendations | Verde (ahorro) | ✅ API/web/móvil; kWh y RD$ estimados, falta calibración externa |
| CH-09 | `EnergyGauge` — Energy Score 0–100 + 4 componentes (Consumo, Eficiencia, Hábitos, Consistencia) | Dashboard, Ahorro | scores | Gauge semicircular; indicador "interno y configurable" | ✅ API + web/móvil; separar INFERRED de lecturas reales |
| CH-10 | Desglose por equipo (AC 41 % · Nevera 17 % · Bomba 11 % · Boiler 9 % · Cocina 8 % · Otros 14 %) | Equipos | devices | Donut o barras; etiqueta `ESTIMATED` | ✅ barras horizontales (web y móvil) |
| CH-11 | Interrupciones por mes (ej. 7, 8h42m, promedio 1h14m) | Historial del servicio | interruptions | Barras; KPIs encima | ✅ historial y resumen mensual (API/web/móvil) |
| CH-12 | Línea de tiempo de interrupción (inicio, fin, duración) | Interrupciones | interruptions | Lista con duración calculada | ✅ registro e historial; sin IoT de estado vivo |
| CH-13 | Marcador de anomalía (promedio 12 kWh/día vs. hoy 27) | Anomalías | anomalies | Línea base + punto resaltado + botón **Investigar** | 🔄 motor y UI ya existen; lectura mensual depende de datos disponibles |
| CH-14 | Tendencia de historial (Jun 380 → Sep 435) | Facturas | bills | Mini-línea | ✅ web (≥ 2 facturas) · móvil usa CH-01 en Facturas |
| CH-15 | Medidor en vivo (2.84 kW, 121 V, 23.4 A, 🟢 conectado) | Smart Meter | telemetría | Valores grandes + sparkline | ⛔ (Fase 6, requiere telemetría real) |
| CH-16 | Solar: producción · consumo · red · batería % | Solar | telemetría | Barras apiladas / flujo | ⛔ (Fase 7, requiere telemetría) |
| CH-17 | Batería 78 %, 10.4 kWh, autonomía 7h20m | Batería | telemetría | Gauge | ⛔ (Fase 7, requiere telemetría) |
| CH-18 | Mapa de RD con capas (Interrupciones, Consumo, Solar, Generación, Medidores) | Mapa | datos agregados | Mapa coroplético | ⛔ (Fase 8) |
| CH-19 | Business: consumo 48,420 kWh, costo, variación, Peak Demand, mayor carga | Business | readings | KPI + barras | ⛔ (Fase 7) |
| CH-20 | Condominio: 120 unidades, áreas comunes, bombas, ascensores, iluminación | Condominios | readings | Treemap/barras | ⛔ (Fase 7) |
| CH-21 | Gráficos de admin: viviendas, facturas pendientes, salud del sistema, uso de IA | Admin | varios | Tablas + KPIs | 🔄 resumen agregado ya existe; estado de worker aún inferido y sin latidos/backups reales |
| CH-22 | Racha y nivel (🔥 12 días · ⚡ 8 % · 🏆 Nivel 4) | Gamificación | challenges | Insignias | ⛔ (Fase 7) |
| CH-23 | Informe energético descargable/imprimible | Informes | todas | PDF de una página con CH-01/02/06/10 | ✅ API/web/móvil en `origin/Dev`; datos disponibles y estimados etiquetados |

**Librerías:** web → Recharts (como dice el chat); móvil → `victory-native` o `react-native-gifted-charts` + `react-native-svg`. Las gráficas actuales hechas a mano (CH-01) se migran para compartir tooltips, ejes y accesibilidad.
**Accesibilidad de gráficos:** cada gráfica expone un resumen textual (ya hecho en `MonthlyChart`) y una tabla alternativa.

---

## 4. Plan por fases (ordenado por dependencia, estimación en semanas-persona de 3 personas)

### Fase 0 — Cierre del piloto actual (1 semana)
| ID | Tarea | Resp. sugerido |
|---|---|---|
| ERD-REL-COMMIT | Commit + push a `Dev` de todo el trabajo local (hoy sin commit), CI remoto verde | Manuel |
| ERD-UX-TOKENS | Decisión de paleta (§2.2) y cambio único en `tokens.ts` | Manuel + Jonas |
| ERD-SEC-DEPS | `npm audit`: resolver braces / node-forge / uuid sin `--force` | Manuel |
| ERD-WEB-QUALITY | Pendiente histórico de Jonas | Jonas |
| ERD-WEB-ENERGY | Pendiente histórico de Anthony (en `Dev`, no en rama) | Anthony |

### Fase 1 — Fundación real: usuarios, seguridad, despliegue (3 semanas) — **bloqueante**
| ID | Tarea | Chat |
|---|---|---|
| ERD-AUTH-01 | **Fundación backend integrada y probada (196 tests):** `users`, registro/login/refresh/logout/me, Argon2id, JWT y rotación de sesiones. **Pendiente:** recuperación/email y controles de abuso; no cerrar tarea integral | `/auth/register`, `/auth/login` |
| ERD-AUTH-02 | **Integrado y probado:** membresía por vivienda en todas las rutas privadas, sin bypass de admin/support; errores 404 indistinguibles entre vivienda ajena e inexistente | "roles y permisos" |
| ERD-AUTH-03 | **Implementado y verificado localmente (2026-10-05):** aceptación de términos en el registro (migración 0012, versión `2026-10-draft`), `GET /legal` público, `DELETE /auth/me` con reautenticación (403/409/429), borrado transaccional y auditoría seudonimizada; UI web (BFF) y móvil. Revisión independiente: 0 Critical; R1 (presupuesto de login gastado sin token) corregido con regresión. Pendiente: texto legal final (revisión Ley 172-13), QA visual/nativa. **ERD-AUTH-04 no aplica todavía** (ver nota abajo) | Perfil → eliminar cuenta |
| ERD-DB-02 | Migraciones 0007+ (0006 reservada para auth): `contracts`, `tariffs`, `meter_readings`, `bill_items` + `documents` | modelo §6 |
| ERD-DEPLOY-01 | Neon (prod) + Render/Fly (API) + Vercel (web) + EAS (móvil), secretos, dominio | presupuesto US$10–45/mes |
| ERD-OBS-01 | Sentry + logs estructurados + health | monitoreo |
| ERD-MOB-AUTH / ERD-WEB-AUTH | **Integrado:** registro, login, logout, sesión segura (web cookies HttpOnly vía BFF; móvil SecureStore), revisión Codex corregida. **Pendiente:** recuperar contraseña y términos | módulo 01 |

### Fase 2 — Core loop completo + Onboarding + Perfil (4 semanas)
> **Nota ERD-AUTH-04 (2026-10-05):** el modelo (`home_members.role IN ('owner','member')`) y la regla de
> `DELETE /auth/me` (409 `ownership_transfer_required` si el único dueño deja otros miembros) ya existen y
> están probados — pero **no hay ninguna ruta de API para invitar o agregar un segundo miembro a una
> vivienda** (la única forma de crearlo hoy es un insert directo en pruebas). Por lo tanto el 409 es hoy
> inalcanzable en producción: nadie puede compartir su vivienda, así que nadie puede quedar bloqueado para
> borrar su cuenta por esta causa. Construir "transferir propiedad" sin "invitar miembro" sería una función
> huérfana. Esto deja de ser un bloqueante real hasta que exista una especificación y un módulo de "compartir
> vivienda / invitar miembro" (sin CH/módulo asignado en este plan todavía).

| ID | Tarea | Módulos / gráficos |
|---|---|---|
| ERD-ONB-01 | **Implementación local:** onboarding web/móvil reutilizado, ubicación/distribuidora/perfil/contrato/meta, migración0009, triestados y reintentos parciales. Correcciones revisión R1–R4 con pruebas; **pendiente aceptación live/visual/nativa de estas pantallas** | M01 |
| ERD-CONS-01 | `meter_readings` + `POST /consumption/readings` + `GET /consumption` con agregación día/semana/mes/año | M03 · CH-02, CH-03 |
| ERD-TARIFF-01 | `tariffs` versionadas por distribuidora (EDESUR/EDENORTE/EDEESTE, SIE) y cálculo de costo | cálculo de tarifas |
| ERD-BILL-02 | **Implementado y revisado localmente:** `bill_items` manual (cargos/descuentos), `POST /validate` de solo lectura (nunca aprueba), snapshot original inmutable con legado marcado "origen desconocido", UI web/móvil; revisión independiente con 3 Required corregidos. Pendiente live/visual/nativo. Ver `backend/api/BILL_DETAIL_VALIDATION.md` | M04 |
| ERD-DASH-02 | **Implementado y verificado:** `GET /dashboard` con factura, comparación, proyección, alerta, recomendación y data_status; meta (GoalProgressSection/GoalCard) y gráfico de consumo integrados en la misma pantalla web/móvil. Pendiente: QA visual/nativa real | M02 · CH-06, CH-07 |
| ERD-FCST-01 | **Implementado y verificado:** proyección lineal de próxima factura (kWh + RD$) con método documentado y calidad PROJECTED, en `/dashboard` y UI web/móvil | M05 · CH-06 |
| ERD-GOAL-01 | **Implementado y verificado localmente:** objetivos RD$/kWh + progreso web/móvil, proyección etiquetada y costo estimado con tarifa oficial; integración real y Maestro Android/iOS 2× por plataforma. Sin publicación; QA en `docs/qa/ERD_PHASE2_NATIVE_2026-10-04.md` | M23 · CH-07 |
| ERD-PROF-01 | Perfil, Mi vivienda, Mi servicio, Configuración, notificaciones | M25–27 |
| ERD-UI-KIT | Los 12 componentes de §2.4 en web y móvil + estados loading/empty/error/offline | §2 |
| ERD-CHARTS-01 | CH-01…CH-03, CH-05, CH-06, CH-14 con Recharts y librería RN | §3 |

### Fase 3 — Inteligencia: OCR, anomalías, ahorro, score (4 semanas)
| ID | Tarea | Notas del chat |
|---|---|---|
| ERD-STORE-01 | Almacenamiento de documentos (R2/S3; MinIO local), URLs firmadas | Storage del flujo OCR |
| ERD-OCR-01 | `POST /bills/upload` → worker → OCR (Tesseract inicial, proveedor intercambiable) → parser Pydantic → validación → **confirmación humana** → BD | "Nunca OCR → DB" |
| ERD-OCR-02 | Móvil: Tomar foto / Seleccionar imagen / Manual + pantalla "Hemos encontrado…" [Confirmar][Editar] | módulo 9 |
| ERD-OCR-03 | ✅ Cola OCR administrativa con errores/reintentos, RBAC y auditoría ya integrada; acceso al documento sigue protegido por permisos específicos |
| ERD-ANOM-01 | Motor de anomalías (picos, nocturno, incrementos, caídas, patrones nuevos) con nivel de confianza | M11 · CH-13 |
| ERD-ALERT-02 | 4 severidades (🔴🟠🟡🟢), recordatorios de pago, datos incompletos, notificaciones push | M10 |
| ERD-SAVE-01 | Reglas de ahorro (A/C, calentador, nocturno, standby) con impacto, RD$ y dificultad + "Aplicar objetivo" | M08 · CH-08 |
| ERD-SCORE-01 | Energy Score (Consumo, Eficiencia, Hábitos, Consistencia), configurable | M09 · CH-09 |
| ERD-DEV-02 | Equipos: marca, modelo, iconos, % por equipo | M12–13 · CH-10 |
| ERD-INT-01 | Interrupciones: registro manual, duración, historial mensual | M14–15 · CH-11, CH-12 |
| ERD-WORKER-01 | Redis + workers (OCR, forecast, anomalías, emails, notificaciones) | sección 11 de la arquitectura |

### Fase 4 — Energy Copilot + MCP (3 semanas)
| ID | Tarea | Notas del chat |
|---|---|---|
| ERD-AI-01 | `conversations`, `messages`, `POST /copilot/chat` | M22 |
| ERD-AI-02 | Herramientas controladas: `get_consumption`, `get_bill`, `get_bill_history`, `get_devices`, `get_tariff`, `calculate_projection`, `detect_anomaly`, `calculate_savings`, `analyze_energy_profile` — la IA **no** accede directo a la BD | sección 44 |
| ERD-AI-03 | Respuestas con fuentes de datos usadas y advertencia si faltan datos | M22 |
| ERD-AI-04 | Chat UI (móvil y web): acciones rápidas (¿Por qué gasté más? ¿Cómo ahorro? ¿Qué consume más? ¿Cuánto pagaré? ¿Me conviene solar? Analiza mi factura), historial | M22 |
| ERD-AI-05 | Límites de uso, rate limiting, logging y supervisión en admin | Integrante 2 |
| ERD-MCP-01 | `mcp/energy-rd-mcp`: servidor MCP (BD, Energy Engine, APIs) para Hermes | sección 45 |
| ERD-AI-06 | pgvector para ayuda y contexto (opcional) | sección 42 |

### Fase 5 — Panel administrativo, informes, reclamaciones (3 semanas)
| ID | Tarea |
|---|---|
| ERD-ADM-01 | **Parcial en `origin/Dev`:** `frontend-web/admin` ya tiene resumen agregado, usuarios de solo lectura, OCR, roles/asignaciones y auditoría. No reimplementar estos módulos; cerrar los paquetes ERD-ADM-* pendientes de este plan sobre la misma API `backend/api` |
| ERD-ADM-02 | **Base RBAC integrada:** scopes de roles/OCR/auditoría/usuarios/sistema. Añadir scopes específicos para futuras acciones sensibles; registro inmutable existente |
| ERD-RPT-01 | ✅ Informe por período y PDF descargable/imprimible ya integrados en `origin/Dev` (CH-23) |
| ERD-CLAIM-01 | ✅ Reclamaciones de usuario ya integradas en `origin/Dev`; permanece la cola de soporte y transiciones administrativas `ERD-CLAIM-SUPPORT` |
| ERD-HELP-01 | ✅ Centro de ayuda y FAQ ya integrados en `origin/Dev`; contacto/SLAs/configuración editorial están pendientes de decisión |


### Fase 6 — Tiempo real: Smart Meter e IoT (4 semanas) *(visión fase 3–4 del chat)*
| ID | Tarea |
|---|---|
| ERD-TS-01 | TimescaleDB para telemetría; agregaciones continuas |
| ERD-IOT-01 | MQTT (Mosquitto) + gateway + registro de dispositivos + emparejamiento ("Conectar medidor") |
| ERD-SM-01 | Pantalla Smart Meter (kW, V, A, estado; Actualizar, Ver histórico, Configurar alertas, Desconectar) · CH-15 |
| ERD-HOURLY-01 | Consumo por hora y horas pico/valle · CH-04 |
| ERD-IOT-02 | Smart plugs / sensores ESP32 (consumo real por equipo, sustituye `ESTIMATED`) |

### Fase 7 — Generación y nuevos segmentos (4 semanas)
| ID | Tarea |
|---|---|
| ERD-SOL-01 | Dashboard solar y batería (CH-16, CH-17) |
| ERD-SOL-02 | Calculadora solar (factura, consumo, ubicación, techo, presupuesto → kWp, kWh/año, ahorro, retorno) |
| ERD-BIZ-01 | Energy Business (CH-19) · ERD-CONDO-01 Condominios (CH-20) |
| ERD-GAME-01 | Gamificación y retos (CH-22) |

### Fase 8 — Energy Intelligence RD (continuo, post-piloto)
Mapa energético (CH-18), datos nacionales agregados (SIE, MEM, ONE, CUED), pérdidas, tendencias, APIs públicas. Siempre con datos agregados y protegidos. NILM, predicción de carga y optimización de baterías quedan aquí.

---

## 5. División de equipo (la del chat, adaptada al equipo real)

| Rol del chat | Responsabilidades | Quién (hoy) | Riesgo |
|---|---|---|---|
| Integrante 1 — Data + IA | BD, Energy Engine, OCR, forecast, anomalías, ahorro, Copilot, MCP | **sin dueño** (Manuel absorbe BD) | Fases 3–4 no tienen responsable |
| Integrante 2 — Backend | FastAPI, auth, APIs, integraciones, workers, deploy | Manuel | Sobrecarga: Manuel lleva BD + backend + móvil |
| Integrante 3 — Frontend | Mobile, web, UI/UX, design system | Jonas + Anthony (web), Manuel (móvil) | Móvil depende de una sola persona |

**Decisión pedida:** asignar dueño de Data/IA (Fase 3–4). Sugerencia: Manuel mantiene backend/BD/auth; Anthony toma Energy Engine/OCR/IA; Jonas toma admin + web UI kit; Hermes (Claude Code) acelera a los tres con ramas revisables, nunca sobre datos de producción.

Reglas compartidas del chat: ramas `main` / `Dev` (en este repo se trabaja directo sobre `Dev` por `WORKFLOW_RULES.md`), PRs revisados, contratos de API definidos antes de las pantallas, pruebas con facturas reales del piloto.

---

## 6. Decisiones técnicas que conviene fijar ahora

| Tema | Chat | Repo | Recomendación |
|---|---|---|---|
| Navegación móvil | Expo Router | React Navigation | **Mantener React Navigation**: ya tiene 75/75 pasos Maestro; migrar cuesta semanas sin valor para el usuario |
| Estilos móvil | NativeWind | StyleSheet + tokens | Mantener tokens compartidos; NativeWind solo si Jonas/Anthony lo piden |
| Barra inferior | Inicio · Consumo · Factura · Energía · Perfil (≤5) | Inicio · Facturas · Equipos · Alertas | Pasar a las 5 del chat; Copilot, Ahorro, Interrupciones dentro de Energía/Inicio |
| Monolito modular | Sí | Sí | Mantener. `energy-engine`, `ai`, `ingestion`, `workers` empiezan como paquetes dentro de `backend/api` y se separan solo si hace falta |
| Neon vs. Docker local | Neon inicial | Postgres local 16 | Neon para prod/staging; local para dev y tests |
| IA | LLM por API, tool-calling | — | Proveedor intercambiable (OpenAI/Anthropic); límite de gasto mensual |

---

## 7. Presupuesto (del chat, para el piloto)

≈ **US$10–45/mes** (≈ RD$600–2,700): Neon US$0, backend US$0–10, Vercel US$0, Expo US$0, storage US$0–5, OCR US$0–10, LLM US$5–20, dominio US$10–20/año, Sentry US$0. Presupuesto de presentación: RD$2,000–5,000/mes (RD$0–1,500 si todo es interno). **No comprar** (todavía): servidores dedicados, Kubernetes, AWS Enterprise, IoT complejo, medidores, hardware por vivienda. Gasto en APIs de pago requiere confirmación previa.

---

## 8. Lo que el chat dice explícitamente que NO se construya al inicio

Marketplace · NILM avanzado · control automático de electrodomésticos · hardware propio · Kubernetes · microservicios complejos · blockchain · red social · sistema nacional completo · IA entrenada desde cero · integraciones con 20 fabricantes. Se respetan hasta Fase 8.

---

## 9. Criterios de aceptación globales

**MVP completo (fin Fase 4):**
1. Un usuario real se registra, crea su vivienda y contrato, y sube una factura por foto.
2. El OCR propone datos; el usuario los corrige y confirma; se conserva el original.
3. Móvil y web muestran el **mismo** dashboard (consumo, factura, proyección, meta, alertas, ahorro, score).
4. Compara períodos, ve anomalías y recibe una recomendación con ahorro estimado.
5. Registra una interrupción y ve su historial.
6. Pregunta al Copilot "¿por qué aumentó mi factura?" y recibe respuesta con fuentes y advertencia de datos faltantes.
7. Un admin autorizado revisa/corrige una factura y queda registrado en auditoría.
8. Cada dato lleva etiqueta `REAL/ESTIMATED/PROJECTED/INFERRED`.
9. Estados loading/empty/error/offline en todas las pantallas; contraste y objetivos táctiles cumplidos.
10. CI verde en `Dev`, recorridos E2E (Playwright web, Maestro móvil) pasando contra API real, cálculos verificados con facturas reales del piloto.

**Plan completo (fin Fase 8):** módulos 1–33 del chat implementados o explícitamente descartados con justificación.

---

## 10. Cronograma resumido

| Fase | Semanas | Acumulado | Entregable demostrable |
|---|---:|---:|---|
| 0 Cierre piloto | 1 | 1 | Trabajo en `Dev`, CI verde, paleta decidida |
| 1 Fundación | 3 | 4 | Login real, permisos por vivienda, despliegue en la nube |
| 2 Core loop | 4 | 8 | Onboarding, consumo, proyección, metas, perfil, kit de UI y gráficos |
| 3 Inteligencia | 4 | 12 | OCR con confirmación, anomalías, ahorro, score, interrupciones |
| 4 Copilot | 3 | 15 | Energy Copilot + MCP |
| 5 Admin | 3 | 18 | Panel admin, informes, reclamaciones |
| 6 Tiempo real | 4 | 22 | Smart Meter / IoT |
| 7 Solar y segmentos | 4 | 26 | Solar, batería, Business, Condominios |
| 8 Nacional | continuo | — | Mapa y datos agregados |

El chat original proponía 12 semanas para el MVP; con el alcance del chat, **Fases 0–4 (≈15 semanas) equivalen a ese MVP**. Con 3 personas y Claude Code/Hermes como apoyo es alcanzable si Data/IA tiene dueño.

---

## 11. Riesgos

- ⛔ Sin auth no hay piloto real (Fase 1).
- ⛔ Data/IA sin responsable → OCR y Copilot se retrasan.
- 🟠 Conflicto de paleta con el logo aprobado (§2.2).
- 🟠 Calidad de OCR con facturas dominicanas reales: reunir ≥ 20 facturas de las 5 viviendas antes de elegir proveedor.
- 🟠 Costo de IA: fijar tope mensual y modelo barato por defecto.
- 🟠 Datos personales (Ley 172-13 RD): política de retención y consentimiento antes de usuarios reales.
- 🟡 Dependencias con avisos de seguridad (ERD-SEC-DEPS).

---

## 12. Herramientas de diseño (skills ya instaladas en `.agents/skills`)

| Necesidad del plan | Skill / librería | Uso |
|---|---|---|
| Paleta, contraste, tokens (§2) | `better-colors`, `better-accessibility`, `design-md` | ERD-UX-TOKENS: validar `#197A52/#2563EB/#F5F7F6/#1F2937` (contraste ≥ 4.5:1), exportar `DESIGN.md` como fuente única |
| Tipografía y jerarquía | `better-typography`, `apple-design` | Escala de fuentes, números tabulares para kWh y RD$ |
| Layout de dashboards y tablas | `better-layout`, `better-ui`, `better-interface` | MetricCard, rejillas, espaciado |
| Variantes antes de construir | `prototype`, `variant` | 3 versiones del Dashboard y del Onboarding; elegir y desechar |
| Gráficos (§3) | `pick-ui-library` → **recharts** (web); Liveline para telemetría en vivo (Fase 6) | CH-01…CH-23 |
| Números animados (kWh, RD$, score) | NumberFlow | MetricCard, EnergyGauge |
| Toasts / confirmaciones | Sonner (web) | Alertas, "Factura guardada" |
| Componentes accesibles | base-ui + `cva` + `clsx` | Modal, BottomSheet, selects, variantes de Button/Card |
| Movimiento | `animate`, `animate-expo`, `emil-design-eng`, `animation-vocabulary` | Transiciones, gauge, estados de carga; móvil con Reanimated |
| Sensación nativa en móvil | `mobile-native`, `make-interfaces-feel-better` | Táctil ≥ 44 px, safe areas, háptica |
| Textos de interfaz | `better-writing` | Lenguaje simple, explicar kWh y RD$ |
| Revisión antes de cerrar cada tarea | `interface-review`, `review-animations`, `improve-animations`, `find-animation-opportunities` | Puerta de calidad de UI por tarea |
| Diseño de referencia | `popular-web-designs`, `claude-design` | Referentes (Stripe/Linear) para panel admin y landing |

**Regla:** cada tarea de UI pasa por `interface-review` (y `review-animations` si hay movimiento) antes de `listo <ID>`.

---

## 13. Próximo paso inmediato

1. Aprobar este plan (o marcar qué fases recortar).
2. Decidir paleta (§2.2) y dueño de Data/IA (§5).
3. Autorizar commit + push de lo local (ERD-REL-COMMIT).
4. Arrancar Fase 1 con **ERD-AUTH-01**.

## 14. Paquete vigente solicitado — release web y administración (baseline `origin/Dev` `f3cb2f42`)

**Módulos ya integrados en Dev — no reabrir como faltantes de desarrollo:** Copilot móvil (`ERD-AI-CHAT-MOBILE`), Reports/PDF (`ERD-RPT-01`), Help (`ERD-HELP-01`), Claims del usuario (`ERD-CLAIM-01`), OCR administrativo (`ERD-OCR-03`), resumen agregado admin (`ERD-ADM-DASH-WEB`) y consulta admin de usuarios read-only (`ERD-ADM-USERS-WEB`). El panel admin es parcial, no vacío.

| ID | Estado local verificable / siguiente gate |
|---|---|
| ERD-WEB-RELEASE-QA | E2E integrado y ejecutado contra PostgreSQL/API/worker/BFF locales con factura sintética; `docs/qa/ERD-WEB-RELEASE-QA.md`. **104/104 passed en 5.6 min** tras corregir dos selectores del harness. Solo aceptación local, sin staging. |
| ERD-WEB-CROSS-BROWSER | Suite integral final **104/104**; proyectos Chromium, Firefox, WebKit, Pixel 7 e iPhone 13 emulados. Primera/última suite pasó los **16/16 smoke** adicionales. Viewport 640 px es proxy de reflow al 200%, no zoom real; CI remoto y dispositivos físicos no verificados. |
| ERD-WEB-A11Y-FINAL | Suite integral **104/104**; `12-a11y-layout.spec.ts` axe WCAG 2.0/2.1/2.2 A/AA + buenas prácticas y teclado/foco/diálogo/formulario pasaron. Lector de pantalla, gráficos y zoom real requieren revisión manual; CI remoto pendiente. |
| ERD-WEB-CAMERA-01 | Controles explícitos «Tomar foto» (`image/*`, `capture=environment`) y «Elegir foto o PDF»; unidad 7/7. Carga OCR revisable pasó en Chromium, Firefox, WebKit y emulación Pixel/iPhone; Safari iOS/Chrome Android físicos pendientes. |
| ERD-WEB-OFFLINE-UX-01 | Aviso sin desmontar formularios, lecturas revalidan al reconectar y escrituras no se reintentan; unit 13/13. E2E de borrador/red/revalidación/cero escrituras pasó en suite integral 104/104. |
| ERD-WEB-LEGAL-PUBLISH | Bloqueado: falta copy aprobado para términos/privacidad que cubra OCR, Copilot y notificaciones; los borradores no se sustituyen por texto inventado. |
| ERD-ADM-USERS-WRITE | Implementado y verificado localmente: solicitudes de exportación/borrado sin ejecución automática, cierre de sesiones/desactivación con scope, motivo, auditoría y guarda del último super-admin. Cola `/solicitudes` y acciones en ficha; transición oculta sin `admin.users.requests.manage`; API 1363, admin unit 48, E2E admin 13/13, build/typecheck/contracts/arquitectura OK. Evidencia `docs/qa/ERD-ADM-USERS-WRITE.md`; sin commit/deploy. |
| ERD-ADM-HOMES-WEB | Decisión de privacidad pendiente antes de exponer vivienda/contrato a soporte. |
| ERD-ADM-BILLS-WEB | Pendiente: revisión/corrección auditada, procedencia y documentos protegidos. |
| ERD-ADM-TARIFFS-WEB | Pendiente: versionado, vigencia, fuente oficial, validación y vista previa. |
| ERD-ADM-OPERATIONS-WEB | Pendiente: lectura de consumo/anomalías/alertas/apagones/recomendaciones; solo lectura salvo scope específico. |
| ERD-ADM-SYSTEM-WEB | Pendiente: heartbeat real, latencia, backup/restore y sondas; el estado actual del worker es inferido. |
| ERD-AI-ADMIN-WEB | Pendiente: uso/costo/latencia/feedback agregado sin leer conversaciones privadas; coste exige tarifa/modelo y fuente aprobados. |
| ERD-CLAIM-SUPPORT | Pendiente: cola de soporte y transiciones «en revisión/resuelta» con scope/audit; no duplicar el flujo de usuario ya integrado. |
| ERD-CLAIM-ATTACHMENTS | Bloqueado hasta definir tipos, límite, retención y borrado; por ahora solo se enlaza la factura original. |
| ERD-HELP-OPERATIONS | Bloqueado: correo público, responsable, SLA y decisión de administración editorial no aportados. |
| ERD-ADM-DEPLOY | No desplegar desde este worktree: requiere autorización de publicación, dominio/TLS y staging aprobados; ejecutar localmente no equivale a staging. |

**Arquitectura invariable:** `backend/api` sigue siendo la API de negocio única; BFF solo media sesión y seguridad. No crear base ni backend administrativo paralelo.
