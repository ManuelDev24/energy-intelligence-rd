# ERD-ADM-TARIFFS-WEB — cobertura y versiones de tarifas (solo lectura)

Estado: **implementado y verificado** con pruebas de API (también como `erd_app`), unitarias de la consola y Playwright contra PostgreSQL + API + consola reales (20/20 en `frontend-web/admin`, axe sin violaciones a 360/768/1280 px).

## Por qué existe
`resolve_tariff` **nunca reutiliza una versión vencida**: si ninguna versión cubre «hoy», los costos en RD$ pasan a «tarifa no disponible». La tarifa BTS-1 cargada (migración 0008, SIE-121-2026-TF) vence el **31/12/2026** y no hay versión siguiente cargada. Esta vista lo hace visible con tiempo.

## Qué hay
- **`GET /api/v1/admin/tariffs`** (scope existente `admin.system.read`, sin migración): `coverage` por distribuidora y `versions` con bloques, cargos fijos, fuente y estado (vigente / vencida / futura).
- **Estados de cobertura** (lógica pura `coverage_for`, probada con fechas fijas): `current`; `expiring` (quedan ≤ 30 días **y** no hay versión adyacente que la reemplace); `future_only` (solo hay una versión futura); `missing` (ninguna vigente, con la fecha en que terminó la última).
- **Consola** `/tarifas`: aviso general cuando algo no está cubierto, tabla de cobertura con texto (no solo color) y detalle de cada versión con su fuente (enlace con `rel="noopener noreferrer"`).

## Decisiones
- Son datos **públicos** (pliegos de la SIE) y no están bajo la RLS, así que no hay función `SECURITY DEFINER`, ni scope nuevo, ni auditoría por lectura (igual que el resumen). Si algún día se añaden tarifas privadas/por contrato, hay que revisarlo.
- **Solo lectura.** Cargar una versión nueva sigue siendo una migración revisada contra la resolución oficial; una pantalla de escritura necesitaría doble confirmación, motivo y auditoría, y es un paquete aparte.
- Un hueco entre versiones (p. ej. una termina el 31/12 y la siguiente empieza el 01/02) **no** se considera cubierto.

## Evidencia
| Criterio | Prueba |
|---|---|
| Vigente con margen, sin fecha de fin, por vencer, con reemplazo adyacente, con hueco, vencida, solo futura, otra distribuidora/código | `test_admin_tariffs.py` (8 casos puros) |
| 401/403 (persona normal, soporte sin `admin.system.read`), 200 para operaciones, `no-store`, solo lectura | `test_admin_tariffs.py` |
| Datos reales de la migración 0008 (3 versiones, 4 bloques, 2 cargos fijos) | `test_admin_tariffs.py`, Playwright |
| El BFF solo deja pasar `GET /tariffs` sin parámetros | `bff.test.ts` |
| Texto, gravedad y formato (coma decimal, independiente del idioma del sistema) | `tariffs.test.ts` |
| Precios y enlace de la fuente en pantalla | Playwright `tarifas.spec.ts` |
| Accesibilidad | `a11y.spec.ts` incluye `/tarifas` a 360/768/1280 px |

## Pendiente (acción humana)
- **Cargar la tarifa de 2027** cuando la SIE la publique, antes del 31/12/2026, o los costos en RD$ dejarán de estar disponibles. Esta página mostrará «Vence pronto sin reemplazo» desde el 01/12/2026.
