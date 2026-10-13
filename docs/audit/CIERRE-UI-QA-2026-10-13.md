# Informe de cierre — UI, QA y arquitectura frontend (2026-10-13)

Alcance: el paquete de diez prompts (arquitectura, densidad, web, iOS, Android, código compartido, seguridad, QA visual,
rendimiento y orquestación) aplicado a `Dev`. Este informe separa **lo verificado** de **lo no verificado**. Un punto sin
prueba figura como no verificado, no como hecho.

## Estado por prompt

| # | Prompt | Estado | Evidencia / límite |
|---|---|---|---|
| 01 | Arquitectura y Design System | Hecho en lo que tiene consumidor | Auditoría en `UI_DENSITY.md` y `DEPENDENCY_MAP.md`. No se crearon Tabs, Breadcrumbs, Toast, Drawer, Dropdown ni Table: ninguna pantalla los usa (regla de `UI_KIT.md`: sin componente sin consumidor). |
| 02 | Controles compactos | Web hecho; móvil mínimo | Medido en navegador (ver abajo). El móvil conserva 44 pt por convención táctil. |
| 03 | Web UI/UX | Parcial | Kit unificado y accesibilidad de páginas públicas verificada. **No auditado:** estados offline, sesión expirada y permisos insuficientes en pantallas con sesión; Lighthouse; navegación por teclado completa. |
| 04 | iOS (HIG) | **No verificado** | Solo `Button` y `Field`. Sin simulador: safe areas, Dynamic Type, teclado y VoiceOver sin comprobar. |
| 05 | Android (Material) | **No verificado** | Igual: edge-to-edge, atrás, TalkBack y fuentes ampliadas sin comprobar. |
| 06 | Código compartido | Hecho | `DEPENDENCY_MAP.md`; fechas RD unificadas en `core`; sin ciclos ni imports cruzados. |
| 07 | Seguridad y go-live | **No ejecutado de nuevo** | Se parte de `AUDIT-03/10` y `REMEDIACION-ESTADO.md`. Sin PostgreSQL local no se probó IDOR/RLS/fuerza bruta. C-23 sigue abierto. |
| 08 | QA visual y accesibilidad | Parcial | axe sobre 7 páginas públicas × 4 anchos. Sin regresión visual, sin VoiceOver/TalkBack, sin pantallas con sesión. |
| 09 | Rendimiento | Parcial (solo bundles web) | Tabla abajo. Sin Core Web Vitals, sin latencias p95/p99 nuevas, sin pruebas en dispositivo. |
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

**Pruebas locales:** core 102, api-contracts 17, api-client 65, web 853, móvil 547, admin 23; typecheck y lint de todos
los workspaces; arquitectura y contratos. API: 14 pasan y 25 se omiten sin PostgreSQL (las ejecuta el CI).

## Hallazgos

| ID | Sev. | Plataforma | Hallazgo | Estado |
|---|---|---|---|---|
| UI-01 | P3 | Web | `/dashboard`, `/consumption` y `/bills` cargan ~100 kB más que el resto porque `recharts` va incluido de forma estática. No se cambió: son gráficas del contenido principal y diferirlas sin medir el efecto en usuarios puede empeorar el salto de diseño. | Abierto: medir LCP antes de decidir. |
| UI-02 | P3 | Web | Los enlaces de texto de las páginas públicas miden ~17 px de alto. axe no lo marca (probablemente por las excepciones de enlace en línea y de espaciado de WCAG 2.5.8; no se comprobó cuál aplica), pero quedan por debajo de los 44 px recomendados en táctil. | Abierto. |
| UI-03 | P2 | Móvil | `Button` con `loading` y `Field` con altura mínima no se han visto renderizados; las pruebas son de estructura. | Abierto: requiere simulador. |
| UI-04 | P3 | Web | Los tamaños 36/44 px dependen de `pointer: coarse`. Un portátil táctil con ratón puede mostrar 44 px; es aceptable. | Aceptado. |
| UI-05 | Info | Web | `/api/bff/auth/me` responde 401 sin sesión: es la sonda de sesión, no un error. | Cerrado. |
| REM-1 | Info | Repo | Se retiró un falso hallazgo propio: `npm ci` falla con npm 10 pero el CI usa Node 24 y pasa. El lockfile no se tocó. | Cerrado. |

## Recomendación (la decisión es de Manuel)

- **Promover `Dev` → `QA`: GO condicionado** a que el CI de `Dev` quede en verde sobre el commit final y a la revisión
  visual manual de «Mi cuenta», Perfil, Apagones, factura y Onboarding en 360, 390, 768 y 1280 px.
- **Producción: NO-GO todavía.** Siguen abiertos puntos que este trabajo no puede cerrar: roles de Neon y RLS en
  producción (C-01), revisión legal (C-04), Sentry y simulacro de restauración (C-05), staging y RTO/RPO (C-19), pruebas en
  dispositivos reales y lectores de pantalla (C-25), C-23 y la revisión de `braces`/`node-forge` antes del **2026-11-04**
  (C-27).

## Cómo aplicar los diez prompts en este repo

Orden: 01 → 02 → 03/04/05 → 06 → 07 → 08 → 09 → 10, con cambios pequeños en `Dev`. Adaptaciones: el repo usa npm
workspaces (no pnpm/Turborepo), React Navigation (no Expo Router) y un kit propio (no shadcn); el contrato de tamaños es
[UI_DENSITY.md](../architecture/UI_DENSITY.md). Reglas que no se negocian: no declarar verificado lo que no se probó, no
crear componentes sin consumidor, y no promover sin CI en verde.
