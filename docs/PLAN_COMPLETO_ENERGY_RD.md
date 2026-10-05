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
| 06 | Ahorro | ⛔ | Recomendaciones con impacto/ahorro/dificultad, "Aplicar objetivo", simulaciones |
| 07 | Alertas | 🔄 | Existen alertas por variación. Faltan 4 severidades de color, anomalías, recordatorios de pago, datos incompletos |
| 08 | Equipos | 🔄 | Existe CRUD + estimación. Faltan marca/modelo, iconos por tipo, % de consumo por equipo (gráfica) |
| 09 | Energy Copilot | ⛔ | Todo |
| 10 | Perfil | ⛔ | Todo (cuenta, vivienda, servicio, notificaciones, seguridad, documentos) |

### 1.2 Módulos 11–33 de la especificación (fuera del MVP real, dentro del plan completo)

Anomalías (11) · Consumo por equipo (13) · Interrupciones (14) · Historial del servicio (15) · Mapa energético (16) · Smart Meter (17) · IoT (18) · Solar (19) · Batería (20) · Calculadora solar (21) · Objetivos (23) · Gamificación (24) · Mi vivienda (26) · Configuración (27) · Centro de ayuda (28) · Reclamaciones (29) · Business (30) · Condominios (31) · Administración (32) · Energy Intelligence RD (33). **Todos ⛔.**

### 1.3 Infraestructura y stack

| Elemento del chat | Repo hoy | Acción |
|---|---|---|
| Auth (registro/login/roles) | ⛔ pospuesta | **Fase 1, bloqueante** |
| Tablas: users, home_members, contracts, bill_items, meter_readings, tariffs, interruptions, forecasts, anomalies, recommendations, conversations, messages | Solo homes, bills, equipment, alerts, audit | Migraciones 0006+ |
| Expo Router + NativeWind | React Navigation + StyleSheet | Decisión: ver §6 (no migrar sin motivo) |
| React Hook Form + Zod | Zod sí; formularios manuales | Adoptar RHF en formularios nuevos |
| Recharts (web) / librería RN | Gráficas hechas a mano (sin librería) | Fase 2: Recharts web + victory-native/gifted-charts móvil |
| shadcn/ui | Estilo propio | Adoptar al construir admin |
| Redis + workers | Opcional (perfil `jobs`) | Obligatorio desde OCR |
| Storage de facturas | ⛔ | Cloudflare R2 / S3 compatible (MinIO local) |
| `apps/admin`, `services/energy-engine`, `ai`, `ingestion`, `workers`, `mcp/energy-rd-mcp`, `packages/ui`, `database/` | `apps/admin` vacío; resto no existe | Crear en la fase que corresponda |
| TimescaleDB + pgvector | ⛔ (Postgres 16 plano) | Fase 5 (telemetría) y Fase 3 (Copilot/RAG) |
| Playwright / Jest-RNTL | Vitest + Maestro | Añadir Playwright en web |
| Neon (prod) / Vercel / Expo EAS / Render o Fly | Todo local | Fase 1 (despliegue piloto) |
| Sentry / monitoreo | ⛔ | Fase 1 |

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
Se crean en `packages/ui` (web) y `apps/mobile/src/components` con la **misma API** y los mismos tokens.

**Avance ERD-UI-KIT (2026-10-04, sin commit):** ✅ `MetricCard`, `DataStatusBadge` (+`INFERRED`), `AlertCard` (4 tonos 🔴🟠🟡🟢), `EmptyState`, `ErrorState` (Reintentar + sin conexión), `LoadingSkeleton` (respeta reducir movimiento), `ConsumptionChart`, `EquipmentBreakdown`, `EnergyGauge` en web (`apps/web/src/components`) y móvil (`apps/mobile/src/components`). ⛔ `DateRangePicker`, `BottomSheet`, `Modal`, `RecommendationCard`, `DeviceCard`, `BillCard` (llegan con sus módulos). Pendiente: mover la lógica de gráficos compartida (`chartMath`, `deltaTone`, iconos por tono) a `@energyrd/core`.

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
| CH-08 | Barra de impacto `████████░░` + ahorro RD$ + dificultad | Ahorro | recommendations | Verde (ahorro) | ⛔ |
| CH-09 | `EnergyGauge` — Energy Score 0–100 + 4 componentes (Consumo, Eficiencia, Hábitos, Consistencia) | Dashboard, Ahorro | scores | Gauge semicircular; indicador "interno y configurable" | 🔄 componente listo (web y móvil); sin API de score |
| CH-10 | Desglose por equipo (AC 41 % · Nevera 17 % · Bomba 11 % · Boiler 9 % · Cocina 8 % · Otros 14 %) | Equipos | devices | Donut o barras; etiqueta `ESTIMATED` | ✅ barras horizontales (web y móvil) |
| CH-11 | Interrupciones por mes (ej. 7, 8h42m, promedio 1h14m) | Historial del servicio | interruptions | Barras; KPIs encima | ⛔ |
| CH-12 | Línea de tiempo de interrupción (inicio, fin, duración) | Interrupciones | interruptions | Lista con duración calculada | ⛔ |
| CH-13 | Marcador de anomalía (promedio 12 kWh/día vs. hoy 27) | Anomalías | anomalies | Línea base + punto resaltado + botón **Investigar** | ⛔ |
| CH-14 | Tendencia de historial (Jun 380 → Sep 435) | Facturas | bills | Mini-línea | ✅ web (≥ 2 facturas) · móvil usa CH-01 en Facturas |
| CH-15 | Medidor en vivo (2.84 kW, 121 V, 23.4 A, 🟢 conectado) | Smart Meter | telemetría | Valores grandes + sparkline | ⛔ (Fase 5) |
| CH-16 | Solar: producción · consumo · red · batería % | Solar | telemetría | Barras apiladas / flujo | ⛔ (Fase 6) |
| CH-17 | Batería 78 %, 10.4 kWh, autonomía 7h20m | Batería | telemetría | Gauge | ⛔ (Fase 6) |
| CH-18 | Mapa de RD con capas (Interrupciones, Consumo, Solar, Generación, Medidores) | Mapa | datos agregados | Mapa coroplético | ⛔ (Fase 8) |
| CH-19 | Business: consumo 48,420 kWh, costo, variación, Peak Demand, mayor carga | Business | readings | KPI + barras | ⛔ (Fase 7) |
| CH-20 | Condominio: 120 unidades, áreas comunes, bombas, ascensores, iluminación | Condominios | readings | Treemap/barras | ⛔ (Fase 7) |
| CH-21 | Gráficos de admin: viviendas, facturas pendientes, salud del sistema, uso de IA | Admin | varios | Tablas + KPIs | ⛔ |
| CH-22 | Racha y nivel (🔥 12 días · ⚡ 8 % · 🏆 Nivel 4) | Gamificación | challenges | Insignias | ⛔ (Fase 7) |
| CH-23 | Informe energético descargable/imprimible | Informes | todas | PDF de una página con CH-01/02/06/10 | ⛔ |

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
| ERD-AUTH-03 | Términos y privacidad, borrado de cuenta, política de retención (P14) | Perfil → eliminar cuenta |
| ERD-DB-02 | Migraciones 0007+ (0006 reservada para auth): `contracts`, `tariffs`, `meter_readings`, `bill_items` + `documents` | modelo §6 |
| ERD-DEPLOY-01 | Neon (prod) + Render/Fly (API) + Vercel (web) + EAS (móvil), secretos, dominio | presupuesto US$10–45/mes |
| ERD-OBS-01 | Sentry + logs estructurados + health | monitoreo |
| ERD-MOB-AUTH / ERD-WEB-AUTH | **Integrado:** registro, login, logout, sesión segura (web cookies HttpOnly vía BFF; móvil SecureStore), revisión Codex corregida. **Pendiente:** recuperar contraseña y términos | módulo 01 |

### Fase 2 — Core loop completo + Onboarding + Perfil (4 semanas)
| ID | Tarea | Módulos / gráficos |
|---|---|---|
| ERD-ONB-01 | **Implementación local:** onboarding web/móvil reutilizado, ubicación/distribuidora/perfil/contrato/meta, migración0009, triestados y reintentos parciales. Correcciones revisión R1–R4 con pruebas; **pendiente aceptación live/visual/nativa de estas pantallas** | M01 |
| ERD-CONS-01 | `meter_readings` + `POST /consumption/readings` + `GET /consumption` con agregación día/semana/mes/año | M03 · CH-02, CH-03 |
| ERD-TARIFF-01 | `tariffs` versionadas por distribuidora (EDESUR/EDENORTE/EDEESTE, SIE) y cálculo de costo | cálculo de tarifas |
| ERD-BILL-02 | **Implementado y revisado localmente:** `bill_items` manual (cargos/descuentos), `POST /validate` de solo lectura (nunca aprueba), snapshot original inmutable con legado marcado "origen desconocido", UI web/móvil; revisión independiente con 3 Required corregidos. Pendiente live/visual/nativo. Ver `services/api/BILL_DETAIL_VALIDATION.md` | M04 |
| ERD-DASH-02 | `GET /dashboard` ampliado: consumo, factura, proyección, meta, alertas, ahorro, service_status | M02 · CH-06, CH-07 |
| ERD-FCST-01 | Forecast de consumo y de factura (método documentado; PROJECTED) | M05 · CH-06 |
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
| ERD-OCR-03 | Admin: cola de OCR, errores y pendientes | panel admin → OCR |
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
| ERD-ADM-01 | `apps/admin` (Next.js): resumen, usuarios, viviendas, contratos, facturas (validar/corregir/rechazar), OCR, consumo, tarifas, alertas, interrupciones, recomendaciones, Copilot, auditoría, configuración (14 módulos del chat) |
| ERD-ADM-02 | RBAC con permisos específicos y registro de operaciones sensibles; un admin no ve datos privados sin permiso |
| ERD-RPT-01 | `GET /reports/energy` + informe PDF descargable/imprimible (CH-23) |
| ERD-CLAIM-01 | Reclamaciones (M29): caso con factura, consumo, historial, diferencia, documentos y seguimiento — sin acusar automáticamente a la distribuidora |
| ERD-HELP-01 | Centro de ayuda y FAQ (M28) |

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
| Monolito modular | Sí | Sí | Mantener. `energy-engine`, `ai`, `ingestion`, `workers` empiezan como paquetes dentro de `services/api` y se separan solo si hace falta |
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
