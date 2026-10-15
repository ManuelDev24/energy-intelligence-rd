# ERD-ADM-HOMES-WEB — consulta administrativa de viviendas (solo lectura)

Estado: **implementado y verificado** con pruebas de API (también como `erd_app`), unitarias de la consola y Playwright contra PostgreSQL + API + consola reales (15/15 en `apps/admin`, axe sin violaciones a 360/768/1280 px).

## Qué hay
- **Scope nuevo `admin.homes.read`** (migración 0038, dato y no constante): super_admin, operations_admin y support_readonly. Auditor y revisor OCR no lo tienen.
- **API** `GET /api/v1/admin/homes` (lista paginada, ≤100) y `GET /api/v1/admin/homes/{id}`. Solo lectura (POST/PUT/PATCH/DELETE → 404/405), `Cache-Control: no-store`.
- **Consola** `/viviendas` y `/viviendas/{id}` con estados de carga, vacío, error con Reintentar y 403; búsqueda por **código o identificador** y filtro por distribuidora.

## Privacidad (decisión de diseño)
La RLS impide que el API vea viviendas ajenas. En lugar de abrir una política amplia, dos funciones `SECURITY DEFINER` con `search_path` fijo devuelven **solo**: identificador, código, distribuidora, provincia, tipo de usuario, ocupantes, banderas de equipamiento, fechas y **conteos** (miembros, propietarios, invitaciones pendientes, facturas, lecturas, equipos, documentos, reclamaciones, alertas sin leer, apagones).
**Nunca** el nombre de la vivienda, la dirección, ciudad, sector ni quiénes son los miembros. Tampoco contenido de facturas, lecturas o documentos. Por eso no se busca por nombre: el soporte pide a la persona su código/identificador.

## Auditoría
`homes.search` (sin el término buscado; solo si hubo consulta, la distribuidora filtrada y cuántas filas) y `homes.view` (recurso `homes:<id>`), ambos con `scope_used=admin.homes.read`, actor y `request_id`.

## Evidencia
| Criterio | Prueba |
|---|---|
| Sin sesión 401; sin scope 403 (persona normal y rol OCR) | `test_admin_homes.py`, Playwright `sin scopes…403` |
| Entrada inválida (corta, comodín, distribuidora) → 422 | `test_admin_homes.py` |
| Nada identificable en listas ni fichas (nombre, dirección, ciudad, correos) | `test_admin_homes.py`, Playwright (la vivienda sembrada tiene nombre y dirección que no aparecen) |
| Conteos salen de filas reales | `test_admin_homes_counts_come_from_real_rows` |
| Solo lectura; el BFF solo deja pasar GET con parámetros declarados | `bff.test.ts`, `test_admin_homes.py` |
| Auditoría sin el término buscado | `test_admin_homes.py`, Playwright `Auditoría` |
| Scopes por rol exactos | `test_each_role_has_exactly_its_own_scopes` |
| Migración 0038 sube/baja | `test_migrations.py` (alembic up/down/up en CI) |
| Accesibilidad | `a11y.spec.ts` incluye `/viviendas` a 360/768/1280 px |

## Límites
- Solo lectura: **no** hay acciones de escritura (suspender, mover, borrar); serían un paquete aparte con motivo obligatorio y doble auditoría.
- La lista no muestra de quién es la vivienda. Si soporte necesita llegar de una persona a sus viviendas, hace falta una función adicional (ver ADM-USERS-WRITE) y una decisión de privacidad.
- Búsqueda solo por prefijo de código o identificador exacto; el código es opcional (las viviendas creadas por usuarios no lo tienen) y se muestra el inicio del identificador.
