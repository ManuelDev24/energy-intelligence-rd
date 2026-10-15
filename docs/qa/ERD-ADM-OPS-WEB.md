# ERD-ADM-OPS-WEB — estado de los trabajos en segundo plano (solo lectura)

Estado: **implementado y verificado** con pruebas de API (también como `erd_app`), unitarias de la consola y Playwright contra PostgreSQL + API + consola reales (22/22 en `frontend-web/admin`, axe sin violaciones a 360/768/1280 px).

## Qué hay
- **`GET /api/v1/admin/jobs/summary`** — una fila por tipo de trabajo (correos, OCR, anomalías, alertas, mantenimiento…): en cola, en curso, muertos, terminados y muertos en 24 h, atrasados (en cola y vencidos hace más de 10 min), espera del más antiguo, último terminado y último exitoso.
- **`GET /api/v1/admin/jobs?kind=&status=`** — lista paginada (≤100), más recientes primero.
- **Consola** `/operaciones`: aviso general («posiblemente detenido» si hay trabajo vencido y nada en curso; «atención» si hay muertos en 24 h), tabla por tipo con texto de estado (no solo color) y lista filtrable.
- Scope existente `admin.system.read` (operaciones y superadministración); sin migración.

## Privacidad
**Nunca** se devuelve la carga útil (`payload`) ni el texto del error (`last_error`): solo `has_error`. Los errores de proveedores externos (p. ej. un servicio de correo) pueden contener correos u otros datos personales; es la misma regla de la consola OCR. Un trabajo programado a futuro no cuenta como «espera».

## Decisiones
- **Solo lectura.** Reintentar o cancelar trabajos genéricos queda fuera: el OCR ya tiene su consola con motivo obligatorio y auditoría. Una acción de escritura general (reencolar muertos) necesitaría motivo, doble confirmación y auditoría, y es un paquete aparte.
- No se audita cada lectura (igual que el resumen y la lista OCR): no hay datos de personas.
- El API no carga los *handlers*, así que la vista sale de la tabla `jobs`, no del registro de tipos en memoria; un tipo que nunca se haya encolado no aparece.

## Evidencia
| Criterio | Prueba |
|---|---|
| 401 sin sesión; 403 para persona normal y para soporte (sin `admin.system.read`) en ambas rutas | `test_admin_jobs.py`, Playwright |
| Agregados correctos: en cola, programados a futuro, vencidos, muertos de hoy vs. de hace 3 días, exitosos, cancelados, en curso | `test_admin_jobs.py` |
| Filtros por tipo y estado, más reciente primero, 422 con valores inválidos | `test_admin_jobs.py` |
| Sin carga útil ni texto de error en ninguna respuesta | `test_admin_jobs.py` (busca `SECRETO-DOC`, un correo y `smtp`), Playwright |
| Solo lectura; el BFF solo deja pasar GET con los filtros declarados | `bff.test.ts`, `test_admin_jobs.py` |
| Reglas de atención (muertos 24 h, atrasados sin nada en curso) | `jobs.test.ts` |
| Accesibilidad | `a11y.spec.ts` incluye `/operaciones` a 360/768/1280 px |

## Límites
- «Posiblemente detenido» es una **inferencia** de la cola (el worker no reporta su propio estado).
- Sin gráficos históricos de rendimiento ni alertas hacia fuera (correo, chat): requieren decisiones de monitoreo.
