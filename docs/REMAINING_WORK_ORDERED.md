# Energy RD — Trabajo restante del MVP (ordenado)

> **Orden vigente (10-oct-2026):** el cierre previo a los módulos nuevos está en [CLOSURE_PLAN_2026-10-10.md](CLOSURE_PLAN_2026-10-10.md). Este archivo queda como histórico del MVP.

> Lista histórica de asignaciones. Para el estado técnico del checkout al 4 de octubre de 2026,
> consultar [cierre de estabilización](architecture/COMPLETION_2026-10-04.md).
> Las asignaciones y la aprobación del equipo no se cierran automáticamente por cambios locales.

**Corte:** MVP para cinco viviendas piloto. Esta lista no incluye la visión futura de IoT, solar, OCR, IA/Copilot, baterías, interrupciones, negocios ni plataforma nacional.

## Contabilidad del equipo

| Persona | Tareas totales | Completadas | Pendientes |
|---|---:|---:|---:|
| Manuel | 8 | 4 | 4 |
| Jonas | 3 | 2 | 1 |
| Anthony | 2 | 1 | 1 |
| **Total** | **13** | **7** | **6** |

Para el 80% del MVP se requieren 11 tareas completadas. Faltan **4 tareas** para alcanzar ese umbral.

## Trabajo ya completado

| ID | Responsable | Evidencia |
|---|---|---|
| ERD-DB-01 | Manuel | Base de datos, migraciones y runtime inicial. |
| ERD-CORE-API | Manuel | PR #4: homes, facturas, seed y dashboard. |
| ERD-MOB-PILOT | Manuel | PR #7: flujo móvil de vivienda, facturas y dashboard. |
| ERD-CI-01 | Manuel | Workflow CI activo y verde en `Dev`. |
| ERD-WEB-01 | Jonas | Foundation Next.js. |
| ERD-WEB-SHELL-BILLS | Jonas | PR #6: shell, cliente API tipado y facturas. |
| ERD-WEB-04 | Anthony | Base inicial de dashboard/consumo. |

## Tareas pendientes en orden de ejecución

Todas se trabajan directamente sobre `Dev`:

```bash
git checkout Dev && git pull origin Dev
```

Cada commit debe usar `[ID-DE-TAREA] descripción` y al finalizar:

```bash
git pull --rebase origin Dev && git push origin Dev
```

### Fase 1 — Puede iniciar en paralelo

| Orden | ID | Responsable | Objetivo | Dependencias |
|---:|---|---|---|---|
| 1A | ERD-API-INSIGHTS | Manuel | CRUD de equipos, estimaciones etiquetadas y alertas configurables por variación de factura. | Ninguna; API core ya está en `Dev`. |
| 1B | ERD-WEB-ENERGY | Anthony | Completar dashboard energético: vivienda/período, comparación mensual, proyección, alerta y estados de calidad. | Ninguna; debe consumir API real cuando aplique. |

**Criterios de aceptación ERD-API-INSIGHTS**
- Equipos con nombre, habitación, potencia y horas de uso; sin valores negativos.
- Las estimaciones se muestran como `ESTIMATED`, no como medición.
- Alertas incluyen umbral, período base, severidad y estados `unread/read/dismissed`.
- Pruebas API verdes.

**Criterios de aceptación ERD-WEB-ENERGY**
- Sin datos horarios ni telemetría falsa.
- Etiquetas `REAL`, `ESTIMATED`, `PROJECTED` e `INFERRED` visibles cuando corresponda.
- Estados loading, empty y error.
- Tests web, lint, typecheck y build verdes.

> **Corrección necesaria para Anthony:** el PR #10 actual apunta a `main` y usa una feature branch; no debe mergearse bajo las reglas vigentes. Su contenido debe llevarse a commits directos en `Dev`, con `[ERD-WEB-ENERGY]` en el mensaje.

### Fase 2 — Después de API Insights

| Orden | ID | Responsable | Objetivo | Dependencias |
|---:|---|---|---|---|
| 2 | ERD-MOB-INSIGHTS | Manuel | Pantallas móviles de equipos, proyección, recomendaciones y alertas usando API real. | ERD-API-INSIGHTS en `Dev`. |

**Criterios de aceptación**
- Crear/editar equipos desde móvil.
- Visualizar y descartar alertas.
- Mostrar estimaciones y proyecciones con su calidad de dato.
- Estados loading/error/empty y pruebas relevantes.

### Fase 3 — Calidad de cada superficie

| Orden | ID | Responsable | Objetivo | Dependencias |
|---:|---|---|---|---|
| 3A | ERD-MOB-QUALITY | Manuel | Smoke test móvil en Expo Go/simulador y pruebas de recorrido completo. | ERD-MOB-INSIGHTS en `Dev`. |
| 3B | ERD-WEB-QUALITY | Jonas | Accesibilidad, responsividad y flujo web completo con API real. | ERD-WEB-ENERGY en `Dev`. |

**Criterios de aceptación comunes**
- API, web y móvil muestran los mismos datos para la misma vivienda.
- Recorrido: vivienda → factura → dashboard → proyección/alerta.
- CI verde en `Dev`.
- Evidencia manual de prueba documentada.

### Fase 4 — Cierre de MVP

| Orden | ID | Responsable | Objetivo | Dependencias |
|---:|---|---|---|---|
| 4 | ERD-REL-01 | Manuel | Guía de demo, checklist y preparación de release. | ERD-MOB-QUALITY y ERD-WEB-QUALITY en `Dev`. |

**Criterio de aceptación:** otra persona puede clonar el repositorio, levantar API y base de datos, ejecutar web/móvil y demostrar las cinco viviendas piloto sin ayuda adicional.

## Hito de 80%

Con las tareas **ERD-API-INSIGHTS**, **ERD-WEB-ENERGY**, **ERD-MOB-INSIGHTS** y la primera tarea de calidad que quede lista, el proyecto alcanza 11 de 13 tareas: aproximadamente **84.6%** del MVP definido.

## Reglas de cierre

El bot solo acepta un reporte privado de finalización cuando incluye el ID y la URL exacta del commit. Verifica que el commit esté en `Dev`, incluya `[ID]` y tenga CI verde antes de pasar la tarea a revisión. Ver `docs/WORKFLOW_RULES.md`.
