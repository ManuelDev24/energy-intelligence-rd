# Informe de cierre — UI, QA y arquitectura frontend (2026-10-13)

Alcance: el paquete de diez prompts (arquitectura, densidad, web, iOS, Android, código compartido, seguridad, QA visual,
rendimiento y orquestación) aplicado a `Dev`. Este informe separa **lo verificado** de **lo no verificado**. Un punto sin
prueba figura como no verificado, no como hecho.

## Estado por prompt

| # | Prompt | Estado | Evidencia / límite |
|---|---|---|---|
| 01 | Arquitectura y Design System | Hecho en lo que tiene consumidor | Auditoría en `UI_DENSITY.md` y `DEPENDENCY_MAP.md`. No se crearon Tabs, Breadcrumbs, Toast, Drawer, Dropdown ni Table: ninguna pantalla los usa (regla de `UI_KIT.md`: sin componente sin consumidor). |
| 02 | Controles compactos | Web hecho; móvil mínimo | Medido en navegador (ver abajo). El móvil conserva 44 pt por convención táctil. |
| 03 | Web UI/UX | Hecho en lo verificable | Kit unificado. Estados: offline (`ErrorState` muestra «Sin conexión»), sesión expirada (evento `energyrd.session-expired` con oyente y pruebas) y 401/403/409/422/429/5xx con mensajes propios. 11 pantallas con sesión recorridas en navegador real a 4 anchos (abajo); se corrigieron 5 defectos. **No auditado:** Lighthouse completo y VoiceOver/NVDA. |
| 04 | iOS (HIG) | Auditoría estática hecha; **sin dispositivo** | Safe areas vía `SafeAreaProvider`; 21 `Pressable` con `accessibilityRole`; imágenes sin etiqueta: ninguna; sin `allowFontScaling={false}`; teclado: corregidas 5 pantallas. Sin simulador: VoiceOver, Dynamic Type y gestos sin comprobar. |
| 05 | Android (Material) | Auditoría estática hecha; **sin dispositivo** | `RECORD_AUDIO` bloqueado, `allowBackup` apagado, mismos controles accesibles. Sin dispositivo: edge-to-edge con teclado, botón atrás y TalkBack sin comprobar (ver UI-06). |
| 06 | Código compartido | Hecho | `DEPENDENCY_MAP.md`; fechas RD unificadas en `core`; sin ciclos ni imports cruzados. |
| 07 | Seguridad y go-live | Parcial: estático, dependencias y pruebas contra API real | Escaneo estático y dependencias (abajo). Con PostgreSQL real: suite de la API completa (incluye `test_auth_abuse`, `test_auth_security` y `test_rls`) y su segunda pasada con el rol restringido `erd_app` bajo RLS y E2E de autorización entre personas, rutas sin sesión, origen en peticiones que cambian datos y cabeceras de seguridad. **No ejecutado:** pruebas de intrusión externas y de carga. C-23 sigue abierto. |
| 08 | QA visual y accesibilidad | Parcial | axe sobre 7 páginas públicas (28 combinaciones) y 11 pantallas con sesión (44 combinaciones), ambas con 0 violaciones tras las correcciones; recorrido con teclado de 4 páginas. Sin regresión visual automatizada ni VoiceOver/TalkBack. |
| 09 | Rendimiento | Hecho en lo medible en local | Bundles web, LCP/CLS de laboratorio, latencia y SQL por petición de la API, concurrencia y **presupuesto automatizado** (`test_performance_budget.py`, cierra F08-02). **No medido:** arranque en frío en móvil, memoria/batería, datos de campo y producción. |
| 10 | Orquestación y cierre | Este informe | La decisión final es de Manuel. |

## Evidencia medida

**Tamaño de controles (Chromium, CSS de producción, `/register`)**

| Puntero | Inputs y botón | Scroll horizontal |
|---|---|---|
| Fino (1280 px) | 36 px | ninguno |
| Táctil (390 px, `hasTouch`) | **44 px** | ninguno |

**Accesibilidad con axe-core 4.10.2** (reglas WCAG 2.0/2.1/2.2 A y AA y buenas prácticas) sobre `/login`, `/register`,
`/olvide-contrasena`, `/restablecer-contrasena`, `/verificar-correo`, `/invitacion` y `/legal`, a 360, 390, 768 y 1280 px
(28 combinaciones): **0 violaciones y 0 scroll horizontal**. Se comprobó que axe evalúa de verdad: 37 reglas aprobadas en
`/login` y un control positivo (campo sin etiqueta, imagen sin `alt`, botón sin nombre) que axe detectó.

**Bundles web (build de producción, JS de primera carga, comprimido)**

| Ruta | First Load JS |
|---|---|
| Compartido por todas | 103 kB |
| Páginas de cuenta, formularios y listas | 165–181 kB |
| `/bills` | 268 kB |
| `/dashboard` | 296 kB |
| `/consumption` | 297 kB |

**Teclado (Chromium, `/login`, `/register`, `/olvide-contrasena`, `/legal`):** orden de Tab lógico (campos → botón → enlaces),
foco visible en todas las paradas, sin trampas de teclado.

**Rendimiento de laboratorio** (servidor local de producción, mediana de 5 cargas; **no son datos de campo**):

| Perfil | Página | FCP | LCP | CLS | Transferido |
|---|---|---|---|---|---|
| Escritorio | `/login` | 104 ms | 260 ms | 0,006 | 285 kB |
| Escritorio | `/register` | 112 ms | 112 ms | 0,006 | 282 kB |
| Móvil, 4G lento y CPU 4x | `/login` | 548 ms | 548 ms | 0,026 | 286 kB |
| Móvil, 4G lento y CPU 4x | `/register` | 536 ms | 536 ms | 0,031 | 283 kB |

Referencia «bueno» de Core Web Vitals: LCP ≤ 2,5 s y CLS ≤ 0,1. Con el servidor en el mismo equipo el TTFB (12–18 ms) no es
representativo de producción.

**Rendimiento de la API (PostgreSQL 16 local, datos sintéticos de la auditoría anterior: 27 facturas y 400 lecturas):**

| Endpoint (GET) | SQL | p50 ahora | p50 en AUDIT-08 (antes de C-13) |
|---|---:|---:|---:|
| `/dashboard` | 3 | 13,7 ms | 7,0 ms |
| `/bills?limit=100` | 2 | 11,6 ms | 5,3 ms |
| `/readings?limit=100` | 2 | 13,4 ms | 6,3 ms |
| `/energy-score` | 10 | 19,2 ms | 14,1 ms |
| `/consumption` mensual, 12 meses | 10 | **42,1 ms** | **599,9 ms** |
| `/consumption` diario, 90 días | 10 | 26,4 ms | 70,3 ms |
| `/consumption` diario, 12 meses | 10 | **52,7 ms** | **853,3 ms** |

El arreglo C-13 baja el consumo a 12 meses de 600–850 ms a 42–53 ms (14 a 16 veces más rápido). Las demás cifras salen entre 1,2 y 2 veces más altas que en AUDIT-08 (p. ej. `/dashboard` 7,0 → 13,7 ms): no es comparable al milisegundo, porque cambian el equipo y el método (aquí, `TestClient` en proceso con 400 lecturas por hogar; allí, otro script con 730), y las sentencias SQL son las mismas (2–10); no se investigó la causa de la diferencia. **Sin N+1:** con 3
facturas y 20 lecturas el número de sentencias es idéntico al de 27 facturas y 400 lecturas.

Concurrencia (`/dashboard`, 300 peticiones por nivel, un solo proceso, `scripts/load_pilot.py`): 1 cliente p95 9,6 ms ·
4 clientes 45,9 ms · 8 clientes 99,6 ms · 16 clientes 180 ms · **32 clientes 542 ms**; saturación de ~110–127 peticiones/s.
El objetivo de `OBSERVABILITY.md` (p95 de lecturas < 500 ms) se cumple hasta 16 clientes simultáneos y se supera a 32 con un
solo proceso: es el punto en que habría que añadir procesos o réplicas, no un defecto de la consulta.

**Seguridad estática y dependencias (2026-10-13):**

| Comprobación | Resultado |
|---|---|
| Patrones de secretos en archivos versionados | 3 coincidencias, las 3 son JWT falsos de pruebas de redacción (`telemetry.test.ts`, `test_e2e_scrub.py`, `test_telemetry.py`). Solo `.env.example` está versionado. |
| `dangerouslySetInnerHTML`, `eval`, `new Function`, `innerHTML=` (web, admin, móvil) | Ninguno. |
| SQL por f-string en la API | `retention.py` usa nombres de tabla de una lista fija en código; las migraciones solo interpolan constantes de rol. Sin datos del usuario. |
| Almacenamiento en navegador | `localStorage` guarda solo la vivienda elegida (modo piloto) y una marca aleatoria para sincronizar pestañas; no hay tokens. |
| Almacenamiento en móvil | `AsyncStorage` guarda solo vivienda y onboarding (y nada con auth activa); las credenciales van a `expo-secure-store`. |
| `pip-audit` (Python) | Sin vulnerabilidades conocidas. |
| `npm audit --omit=dev` | 15 altas, **todas** en el toolchain de Expo/React Native (`expo`, `react-native`, Metro, `braces`, `node-forge`). `npm run audit:monitor`: OK, avisos aceptados y vigentes hasta el 2026-11-04. |

**Pantallas con sesión (API, PostgreSQL y web reales; Chromium; axe con reglas WCAG 2.0/2.1/2.2 A y AA y buenas prácticas):**
Inicio, Consumo, Lecturas, Facturas, Equipos, Alertas, Perfil, Ahorro, Apagones, Meta y Mi cuenta, a 360, 390, 768 y
1280 px (44 combinaciones, con datos sembrados: 6 facturas, 3 lecturas y un equipo). Primera pasada: **2 reglas de axe
incumplidas y 1 desborde horizontal**; tras corregir, **0 violaciones y 0 desbordes**. En «Mi cuenta» y Perfil los campos
miden 320, 220 y 140 px por 36 px según el dato, como define `UI_DENSITY.md`. A 360 y 390 px se llega a Meta, Ahorro y
Apagones desde «Más secciones» (antes no había ningún enlace a Apagones).

**Pruebas locales:** core 102, api-contracts 17, api-client 65, web 858, móvil 549, admin 23; typecheck y lint de todos
los workspaces; arquitectura y contratos. **API contra PostgreSQL 16 real: 1287 aprobadas, 9 omitidas (exigían `tesseract`,
que no estaba instalado) y 96,23 % de cobertura** (umbral 92 %); migraciones subida/bajada/subida y seed idempotente
correctos. **Segunda pasada con la API conectada como `erd_app` (rol sin privilegios sujeto a RLS, `TEST_RLS_ROLE=1`): 328 aprobadas, 0 fallos y 968 omitidas por diseño** (en ese modo solo corren las pruebas con autenticación). **E2E Playwright completo contra API, worker y web reales: 67 de 67** (66 en la corrida completa y la prueba de
OCR con foto real, que había fallado solo por la ausencia de `tesseract`, aprobada al instalarlo).

## Hallazgos

| ID | Sev. | Plataforma | Hallazgo | Estado |
|---|---|---|---|---|
| UI-01 | P3 | Web | `/dashboard`, `/consumption` y `/bills` cargan ~100 kB más que el resto porque `recharts` va incluido de forma estática. No se cambió: son gráficas del contenido principal y diferirlas sin medir el efecto en usuarios puede empeorar el salto de diseño. | Abierto: medir LCP antes de decidir. |
| UI-02 | P3 | Web | Los enlaces de texto de las páginas públicas miden ~17 px de alto. axe no lo marca (probablemente por las excepciones de enlace en línea y de espaciado de WCAG 2.5.8; no se comprobó cuál aplica), pero quedan por debajo de los 44 px recomendados en táctil. | Abierto. |
| UI-03 | P2 | Móvil | `Button` con `loading` y `Field` con altura mínima no se han visto renderizados; las pruebas son de estructura. | Abierto: requiere simulador. |
| UI-04 | P3 | Web | Los tamaños 36/44 px dependen de `pointer: coarse`. Un portátil táctil con ratón puede mostrar 44 px; es aceptable. | Aceptado. |
| UI-05 | Info | Web | `/api/bff/auth/me` responde 401 sin sesión: es la sonda de sesión, no un error. | Cerrado. |
| UI-06 | P2 | Android | Los formularios usan `KeyboardAvoidingView` con `behavior` solo en iOS (en Android se confía en que el sistema redimensione la ventana). Con *edge-to-edge* obligatorio en Android 15+ eso puede no ocurrir y el teclado taparía campos. No se puede comprobar sin dispositivo. | Abierto: probar en Android 15 antes de publicar. |
| UI-07 | P2 | Móvil | 5 pantallas con campos (Perfil con la contraseña de eliminar cuenta, Ajustes, Compartir, Lectura OCR, Viviendas con invitación) no ajustaban el área visible al teclado; Perfil además podía perder el primer toque (sin `keyboardShouldPersistTaps`; no reproducido en dispositivo). | **Corregido** (`automaticallyAdjustKeyboardInsets` + `keyboardShouldPersistTaps="handled"`) y protegido con `keyboardGuard.test.ts` (verificado que falla si se quita). En iOS; Android: ver UI-06. |
| UI-08 | P2 | Web | A 768 px la tabla de Apagones ensanchaba `<main>` (hijo flex sin `min-w-0`) a 798 px: scroll horizontal global. | **Corregido** (`min-w-0`); 0 desbordes en las 44 combinaciones. |
| UI-09 | P2 | Web | Sin ningún enlace a Apagones y con Ahorro solo dentro de una nota, en pantallas menores de 768 px (la barra lateral se oculta y la inferior omite esos destinos). | **Corregido** (`MoreSections` en Perfil, 44 px, solo en pantallas estrechas); comprobado en 360 y 390 px. |
| UI-10 | P2 | Web | Casilla de `Checkbox` de 16 px (WCAG 2.5.8, `target-size`) y `<summary>` de 20 px de alto en Consumo. | **Corregido** (24 px y `py-1`). |
| UI-11 | P3 | Web | `DeviceCard` usaba `h3` bajo un `h1` (`heading-order`). | **Corregido** (`h2`). |
| UI-12 | P2 | Web | Las 5 tablas con `overflow-x-auto` no eran accesibles por teclado (`scrollable-region-focusable`); axe lo detectó al corregir UI-08. | **Corregido** (`ScrollRegion`: rol `region`, nombre y foco). |
| REM-1 | Info | Repo | Se retiró un falso hallazgo propio: `npm ci` falla con npm 10 pero el CI usa Node 24 y pasa. El lockfile no se tocó. | Cerrado. |

## CI de GitHub Actions

Run [38331407723](https://github.com/ManuelDev24/energy-intelligence-rd/actions/runs/38331407723) sobre `a65c55a` (2026-10-13):
**4 de 4 jobs en verde.** `api (pytest + migrations)` (ruff, mypy, contratos, arquitectura, migraciones, seed, pytest con
cobertura en 12 min y segunda pasada con el rol restringido en 4 min; incluye `test_performance_budget.py`, que pasó en el
runner sin cambiar presupuestos), `web + mobile + core`, `web + mobile (recorridos vs API real)` y `e2e web`
(Playwright contra PostgreSQL, API y worker reales, 4 min). Los commits posteriores son solo documentación (`[skip ci]`).

## Recomendación (la decisión es de Manuel)

- **Promover `Dev` → `QA`: GO condicionado** a la revisión visual manual de «Mi cuenta», Perfil, Apagones, factura y
  Onboarding en 360, 390, 768 y 1280 px. La condición del CI en verde ya se cumple (ver arriba).
- **Producción: NO-GO todavía.** Siguen abiertos puntos que este trabajo no puede cerrar: roles de Neon y RLS en
  producción (C-01), revisión legal (C-04), Sentry y simulacro de restauración (C-05), staging y RTO/RPO (C-19), pruebas en
  dispositivos reales y lectores de pantalla (C-25), C-23 y la revisión de `braces`/`node-forge` antes del **2026-11-04**
  (C-27).

## Cómo aplicar los diez prompts en este repo

Orden: 01 → 02 → 03/04/05 → 06 → 07 → 08 → 09 → 10, con cambios pequeños en `Dev`. Adaptaciones: el repo usa npm
workspaces (no pnpm/Turborepo), React Navigation (no Expo Router) y un kit propio (no shadcn); el contrato de tamaños es
[UI_DENSITY.md](../architecture/UI_DENSITY.md). Reglas que no se negocian: no declarar verificado lo que no se probó, no
crear componentes sin consumidor, y no promover sin CI en verde.
