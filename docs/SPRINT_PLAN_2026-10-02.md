# Energy RD — Plan de trabajo del MVP

**Ventanas:** fin de semana **2–4 de octubre de 2026** y semana **5–11 de octubre de 2026**  
**Equipo:** Propietario (móvil + base de datos/backend), Compañero A (web foundation), Compañero B (web features)  
**Fuente de verdad:** este archivo. Telegram entrega tareas y confirmaciones; no sustituye el tablero/backlog.

## 1. Corte de producto aprobado para estas dos semanas

El MVP debe demostrar, para **cinco viviendas piloto**, este ciclo completo:

> alta/selección de vivienda → registro manual de factura → historial mensual → dashboard → proyección simple → alerta o recomendación basada en reglas

### Incluido
- Facturas mensuales introducidas manualmente.
- Consumo mensual, RD$, comparación entre períodos y proyección lineal etiquetada.
- Dashboard y formulario de facturas en móvil y web.
- Cinco viviendas semilla para la demostración.
- Pruebas de cálculo, API y recorridos principales de UI.

### Fuera del corte (no asignar ahora)
- OCR operativo, medidores inteligentes, MQTT/IoT, telemetría horaria.
- Paneles solares, baterías, interrupciones y calidad de red.
- IA/Copilot, ML, gamificación, mapa nacional, pagos/tarifas oficiales automatizadas.
- Aplicación de administración separada, negocios y condominios.

**Regla de datos:** una factura mensual no prueba picos, consumo horario ni estado en tiempo real. Toda cifra debe incluir `REAL`, `ESTIMATED`, `PROJECTED` o `INFERRED` según corresponda.

## 2. Estado real antes de comenzar

| Área | Verificado | Falta para MVP |
|---|---|---|
| Móvil | Proyecto Expo/TypeScript existe, pero `App.tsx` sigue siendo la plantilla inicial. | Navegación, cliente API, onboarding, selector de vivienda, dashboard, facturas, historial y pruebas. |
| API | FastAPI solo expone `/` y `/health`. | Dependencias Python reproducibles, modelos, migraciones, routers, validaciones, motor de reglas, tests y ejecución real. |
| Base de datos | Docker Compose declara PostgreSQL 16 y Redis. | Tablas, Alembic funcional, seed de 5 viviendas, conexión/configuración validada. |
| Web | `apps/web` no tiene aplicación implementada; el script raíz la referencia. | Bootstrap Next.js, shell, rutas, dashboard, consumo, facturas, cliente API, pruebas. |

## 3. Dependencias y acuerdos obligatorios

1. **Una sola API de cálculo:** móvil y web no calculan variación/proyección; consumen el backend.
2. **Contrato primero:** backend publica OpenAPI bajo `/api/v1` antes de integrar pantallas reales.
3. **Convención de branch:** cada tarea usa el branch indicado. Un PR por tarea; título: `[ID] descripción`.
4. **“Listo” válido:** no basta el mensaje de Telegram. Debe existir PR, checks que pasan y evidencia de aceptación.
5. **Datos demo:** si la web avanza antes de la API, usar fixtures tipados marcados como `demo/mock`, nunca como datos reales.
6. **No tocar configuración global ajena:** Compañero B no modifica la base/shell de A sin coordinación; todos trabajan en ramas separadas.

## 4. Fin de semana — vertical slice (2–4 Oct)

### Propietario — Móvil + base de datos/backend

| ID | Branch | Entregable | Depende de | Criterio de aceptación |
|---|---|---|---|---|
| ERD-DB-01 | `feat/pilot-db-foundation` | Estandarizar proyecto Python (`pyproject.toml` o requirements bloqueados), `.env.example`, driver PostgreSQL coherente, Alembic y modelos `homes`, `bills`, `alerts` con migración inicial. | — | Desde checkout limpio: instalar, levantar PostgreSQL, `alembic upgrade head`, downgrade y upgrade sin error. |
| ERD-DB-02 | `feat/pilot-seed-five-homes` | Seed idempotente de 5 viviendas, con mínimo 2 facturas mensuales por vivienda. | ERD-DB-01 | Ejecutar dos veces conserva exactamente 5 viviendas, sin duplicar facturas; test de conteos/FK pasa. |
| ERD-API-01 | `feat/pilot-api-homes-bills` | `/api/v1/homes` y CRUD de facturas manuales por vivienda. Campos: distribuidora, período, días, kWh, total RD$, lecturas opcionales y fuente. | ERD-DB-01 | OpenAPI disponible; negativos/períodos inválidos/vivienda inexistente devuelven 4xx; tests de endpoint pasan. |
| ERD-API-02 | `feat/pilot-api-dashboard-rules` | Endpoint dashboard: último consumo, comparación, proyección lineal, alerta/recomendación determinista y estados de calidad. | ERD-API-01, ERD-DB-02 | Con fixtures conocidas, cálculos exactos; con historial insuficiente explica la falta de datos sin inventar porcentajes. |
| ERD-MOB-01 | `feat/mobile-app-foundation` | Sustituir plantilla Expo por navegación, tema, cliente HTTP tipado, configuración de URL API y selección persistente de vivienda. | Contrato inicial de ERD-API-01 | Compila; selector consume viviendas seed o mock explícito; estados loading/error/empty visibles. |
| ERD-MOB-02 | `feat/mobile-bills-flow` | Historial y formulario de factura manual, con validación y cambio de vivienda. | ERD-MOB-01, ERD-API-01 | Crear factura actualiza historial; errores son legibles; no mezcla datos entre viviendas. |
| ERD-MOB-03 | `feat/mobile-pilot-dashboard` | Home con consumo mensual, comparación, proyección, alerta y recomendación. | ERD-MOB-01, ERD-API-02 | Cinco viviendas renderizan sus propios resultados; no muestra métricas horarias no medidas. |

### Compañero A — Base de la web

| ID | Branch | Entregable | Depende de | Criterio de aceptación |
|---|---|---|---|---|
| ERD-WEB-01 | `feat/web-foundation-auth-shell` | Crear `apps/web`: Next.js App Router, TypeScript, Tailwind, UI base, TanStack Query, Zod, scripts dev/build/lint/typecheck/test. | — | El workspace es detectado; scripts pasan; no quedan dependencias globales implícitas. |
| ERD-WEB-02 | `feat/web-app-shell-routes` | Layout responsive, navegación y rutas `/login`, `/dashboard`, `/consumption`, `/bills`; boundary de sesión sin credenciales hardcodeadas. | ERD-WEB-01 | Navegación desktop/móvil; ruta privada redirige a login sin sesión; estado de auth pendiente de API queda explícito. |
| ERD-WEB-03 | `feat/web-api-contract-client` | Cliente API tipado, QueryClient, tipos de respuesta y fixtures marcados como demo mientras API no esté disponible. | ERD-WEB-01, contrato de ERD-API-01 | Ningún cálculo energético se duplica en la web; loading/error/empty/demo son distinguibles. |

### Compañero B — Features de la web

| ID | Branch | Entregable | Depende de | Criterio de aceptación |
|---|---|---|---|---|
| ERD-WEB-04 | `feat/web-dashboard-consumption` | Tarjetas de dashboard, consumo mensual, comparación, filtros y gráfica con estados vacíos/error/demo. | Primera integración de ERD-WEB-01/02; API dashboard para datos reales | Renderiza datos con etiquetas de calidad; no presenta consumo horario si la fuente es mensual; pruebas de estados pasan. |
| ERD-WEB-05 | `feat/web-bills-flow` | Lista, detalle y formulario de factura manual con Zod y componentes reutilizables. | ERD-WEB-01/03; API de facturas para datos reales | Valida datos antes de enviar; lista/detalle/formulario cubren loading/error/empty; pruebas de formulario pasan. |

### Meta de cierre del domingo

Una vivienda piloto puede registrar una factura manual y ver dashboard mensual en móvil; la web tiene shell estable y features funcionando con API o fixtures demo declarados.

## 5. Semana siguiente — cierre de MVP (5–11 Oct)

| ID | Responsable | Branch | Entregable | Depende de | Criterio de aceptación |
|---|---|---|---|---|---|
| ERD-API-03 | Propietario | `chore/api-runtime-contract-tests` | Procedimiento único para levantar DB+API; healthcheck con DB; CORS por entorno; contrato OpenAPI y pruebas de integración. | ERD-API-01/02 | Checkout limpio ejecuta API y suite documentada; `/health` verifica conectividad real. |
| ERD-API-04 | Propietario | `feat/pilot-equipment-estimates` | CRUD de equipos declarados (W, horas/día, habitación) y estimación etiquetada. | ERD-API-02 | Estimado identifica supuestos; no se reporta como medición directa; tests de reglas pasan. |
| ERD-API-05 | Propietario | `feat/pilot-bill-alerts` | Alertas configurables por variación de facturas. | ERD-API-02 | Solo alerta si hay historial y se supera umbral; incluye período base, severidad y estado read/dismissed. |
| ERD-MOB-04 | Propietario | `feat/mobile-consumption-projection` | Pantallas de consumo, proyección y recomendaciones de reglas. | ERD-API-02/04 | Separa datos reales, proyección y estimación; cada pantalla tiene estado vacío/error. |
| ERD-MOB-05 | Propietario | `test/mobile-pilot-smoke` | Pruebas y recorrido Expo Go: vivienda → factura → dashboard. | ERD-MOB-02/03 | Pruebas automatizadas pasan y existe evidencia de smoke contra API local. |
| ERD-WEB-06 | Compañero A | `feat/web-real-api-integration` | Sustituir fixtures de dashboard/consumo por cliente real, manteniendo mocks solo en tests. | ERD-API-01/02/03 | Para una misma vivienda, web y API muestran las mismas cifras/etiquetas. |
| ERD-WEB-07 | Compañero B | `feat/web-bills-real-api-integration` | Integrar listado, detalle y creación de facturas contra API. | ERD-API-01/03, ERD-WEB-05 | Crear una factura actualiza listado/dashboard sin recargar manualmente; fallos de red/validación visibles. |
| ERD-WEB-08 | A+B (A revisa) | `test/web-mvp-smoke` | Tests de rutas/features y revisión de accesibilidad/responsividad. | ERD-WEB-04–07 | Build, lint, typecheck y tests pasan; flujo web vivienda → factura → dashboard funciona. |
| ERD-REL-01 | Equipo | `chore/mvp-demo-readme` | Guía de demo y checklist de release para las 5 viviendas piloto. | Todas P0 | Otra persona puede levantar el proyecto y recorrer el MVP sin conocimiento previo. |

## 6. Orden de trabajo diario sugerido

### Viernes 2
- Propietario: ERD-DB-01.
- A: ERD-WEB-01.
- B: prepara diseño/fixtures/tipos de ERD-WEB-04 sin modificar configuración global.

### Sábado 3
- Propietario: ERD-DB-02 + ERD-API-01; comienza ERD-MOB-01 cuando el contrato esté definido.
- A: ERD-WEB-02 + ERD-WEB-03.
- B: sobre la primera integración de A, ERD-WEB-04.

### Domingo 4
- Propietario: ERD-API-02, ERD-MOB-02/03 y demo vertical.
- A: revisión del shell e integración de contrato.
- B: ERD-WEB-05.
- Equipo: revisión cruzada de PRs y lista de bloqueos para el lunes.

### Lunes–sábado 5–11
- Propietario cierra runtime, estimaciones, alertas y smoke mobile.
- A integra datos reales en dashboard/consumo y revisa PRs web.
- B integra facturas reales y cierra pruebas web.
- Viernes/sábado: ERD-REL-01 y demo completa.

## 7. Protocolo para el bot de Telegram

Formato de asignación:

```text
TAREA ERD-WEB-04
Branch: feat/web-dashboard-consumption
Objetivo: [una frase]
Aceptación: [tres checks]
Dependencias: ERD-WEB-01/02
```

Formato para completar:

```text
listo ERD-WEB-04
PR: https://github.com/ManuelDev24/energy-intelligence-rd/pull/NN
```

El bot debe:
1. Confirmar que la tarea pertenece al remitente o al grupo autorizado.
2. Buscar el PR contra el branch esperado.
3. Comprobar estado, checks, archivos modificados y descripción.
4. Ejecutar `scripts/verify_task_pr.sh` contra el repositorio canónico antes de cambiar estado: valida repo, base `Dev`, branch esperado, ID en título, archivos modificados y checks.
5. Marcar la tarea como `review` — no `done` — hasta revisión del responsable.
6. Enviarte por privado: tarea, autor, PR, estado de checks, resumen, riesgos y bloqueo si existe.

## 8. Definition of Done por tarea

Una tarea solo se considera terminada cuando:

- [ ] Está en su branch asignado.
- [ ] Tiene PR contra `Dev` con descripción y referencia de ID.
- [ ] Build/lint/typecheck/tests relevantes pasan o el fallo queda declarado.
- [ ] Se comprobó el criterio de aceptación especificado.
- [ ] No introduce secretos, datos ficticios sin etiqueta o métricas que la fuente no soporta.
- [ ] Tiene revisión de otro integrante antes del merge.
