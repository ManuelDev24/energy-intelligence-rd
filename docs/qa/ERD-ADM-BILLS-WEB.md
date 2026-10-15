# ERD-ADM-BILLS-WEB — calidad de datos de facturas y facturas de una vivienda (solo lectura)

Estado: **implementado y verificado** con pruebas de API (también como `erd_app`), unitarias de la consola y Playwright contra PostgreSQL + API + consola reales (18/18 en `apps/admin`, axe sin violaciones a 360/768/1280 px).

## Qué hay
- **Scope `admin.bills.read`** (migración 0039): super_admin, operations_admin y support_readonly. Auditor y revisor OCR no lo tienen.
- **`GET /api/v1/admin/bills/summary?days=`** — solo **conteos** de todas las viviendas: total, nuevas en la ventana, viviendas con facturas, origen (manual/demo), con original, con lecturas, con fecha límite, pagadas, con 0 kWh o monto 0 y estado del OCR. Ningún importe ni identificador.
- **`GET /api/v1/admin/homes/{id}/bills`** — las facturas de **una** vivienda indicada por su identificador exacto: periodo, días, kWh, monto, origen, fecha límite, pagada, lecturas, original y estado del OCR.
- **Consola** `/facturas` (calidad de datos con porcentajes y un formulario por identificador) y `/facturas/{homeId}` (tabla paginada).

## Decisión de privacidad
No existe un listado global de importes: un importe solo se ve indicando el identificador de **una** vivienda, y cada consulta queda auditada. Nunca se muestran nombre, dirección, miembros ni el contenido de los documentos. Los importes se transportan como texto (sin pasar por coma flotante).

## Auditoría
`bills.summary` (recurso `bills`, con la ventana) y `bills.list` (recurso `homes:<id>`), ambos con `scope_used=admin.bills.read`, actor y `request_id`.

## Evidencia
| Criterio | Prueba |
|---|---|
| 401 sin sesión; 403 sin scope (persona normal y rol OCR) en ambas rutas | `test_admin_bills.py`, Playwright `sin scopes…403` |
| Ventana inválida → 422; vivienda inexistente → 404 | `test_admin_bills.py`, Playwright `sin registro` |
| Los conteos salen de filas reales (pagadas, fecha límite, lecturas) | `test_summary_counts_completeness_flags` |
| Más reciente primero; paginación | `test_admin_bills.py` |
| Nada identificable (nombre, dirección, correos, distribuidora) | `test_admin_bills.py`, Playwright |
| Solo lectura; el BFF solo deja pasar GET con parámetros declarados | `bff.test.ts` (7 rutas/métodos rechazados), `test_admin_bills.py` |
| Auditoría | `test_admin_bills.py`, Playwright (`Auditoría`) |
| Scopes por rol exactos | `test_each_role_has_exactly_its_own_scopes` |
| No se inventan porcentajes sin facturas | `bills.test.ts` |
| Accesibilidad | `a11y.spec.ts` incluye `/facturas` a 360/768/1280 px |

## Límites
- Solo lectura: no hay corrección ni borrado de facturas desde la consola.
- «Con 0 kWh/monto 0» son señales de posible error de captura, no un veredicto; no hay todavía detección de importes atípicos (requiere calibrar con datos reales).
- El estado del OCR de la factura es el del original más reciente adjunto.
