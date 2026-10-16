# ERD-ADM-USERS-WRITE — evidencia local

**Estado:** implementado y verificado en el worktree local, sin commit/push ni despliegue. Baseline: `origin/Dev` `f3cb2f42`. Las pruebas usan una base aislada y cuentas sintéticas; no se tocaron clientes ni bases compartidas.

## Alcance

- Migración `0043_admin_user_management` (renumerada desde 0038 al integrarse sobre Dev, que ya usa 0038–0042 para viviendas, facturas, IA y sistema): registro de solicitudes de exportación/borrado, sin ejecutar exportación ni borrado al crearlas.
- API central `backend/api`: creación/listado/transición de solicitudes; cierre de sesiones; desactivación con revocación transaccional de sesiones.
- Scopes diferenciados para lectura/gestión de solicitudes, cierre de sesiones y desactivación. Los cambios requieren motivo y se registran en auditoría append-only.
- Se preserva el último `super_admin` activo; las solicitudes solo admiten transiciones válidas y el estado final no se reabre.
- BFF de `frontend-web/admin` limita métodos, rutas y filtros permitidos; no añade una API de negocio paralela.
- Panel `/solicitudes` con filtros, paginación y cambios de estado; ficha de persona muestra las acciones solo con los scopes correspondientes. No muestra viviendas, facturas ni documentos.

## Verificación

- API: `env -u PYTHONPATH .venv/bin/python -m tests.run_isolated -q` → **1363 passed**.
- Admin: `npm test --workspace frontend-web/admin` → **48 passed**; `npm run typecheck --workspace frontend-web/admin` → pass.
- Las pruebas unitarias cubren la cola de solo lectura: sin `admin.users.requests.manage` no aparece el formulario de transición; con ese scope, sí. El formulario tiene un nombre accesible.
- Admin E2E real con PostgreSQL/API/worker/BFF locales y datos sintéticos → **13/13 passed**. Incluye solicitud de exportación, transición pendiente→en revisión→atendida, solicitud de borrado, cierre de sesiones comprobando revocación y desactivación.
- Axe + responsive en 360/768/1280 px para rutas administrativas, incluida cola y ficha de usuario → pasó dentro de los 13 E2E. Una primera corrida encontró que la región de tabla desplazable no recibía foco de teclado; se añadió `tabIndex=0` y la repetición pasó.
- Build de producción de `frontend-web/admin` → pass.
- `npm run contracts:check`, `python3 scripts/check_architecture.py` y `git diff --check` → pass.

## Límites y bloqueos

- La cola registra y tramita solicitudes; **no** crea ni entrega archivos y **no** elimina cuentas. La ejecución real requiere un flujo operativo/legal aprobado y no está implementada.
- La retención de solicitudes/auditoría, el canal de entrega de exportaciones y el responsable/SLA de soporte siguen pendientes de aprobación.
- Evidencia local no certifica CI remoto, staging, TLS, despliegue ni aceptación con datos reales. No se ejecutaron migraciones sobre bases compartidas.
