# ERD-CLAIM-01 — Reclamaciones (API, web y móvil)

Estado: **implementado y verificado con pruebas de API (también como `erd_app`), unitarias y Playwright (web); NO verificado en dispositivo.**

## Principio
El caso es un **registro de la persona**. La app no afirma que la distribuidora se haya equivocado ni la acusa: guarda lo que la persona cuenta, un resumen
neutral de **sus propios datos** y el seguimiento. La reclamación formal la presenta la persona ante su distribuidora; aquí guarda el número de referencia.

## Contrato (`/api/v1/homes/{home}/claims`, todo con `authorize_home`)
| Ruta | Qué hace |
|---|---|
| `POST` | Crea el caso (201). Tipos: `billing_error`, `consumption_dispute` (exigen factura), `outage_damage`, `service_quality`, `other`. |
| `GET ?status=` | Lista (más recientes primero). |
| `GET /{id}` | Detalle con `evidence` y `events`. |
| `POST /{id}/notes` | Agrega una nota (3–2000 caracteres). |
| `PUT /{id}/reference` | Guarda el número de la distribuidora (≤ 60). |
| `POST /{id}/close` | La persona cierra el caso. |
- **Resumen congelado** (`evidence`, ≤ 16 KB): factura (kWh y monto `REAL`, precio medio `ESTIMATED`), factura anterior con variación `ESTIMATED`, lecturas del
  medidor en el período y el `document_id` del original de la factura. No cambia aunque la factura se edite o se borre (el caso sigue, `bill_id` pasa a null).
- Reglas: un caso abierto por (vivienda, factura, tipo) → 409 `claim_conflict`; máx. 20 abiertos por vivienda y 100 eventos por caso → 409 `claim_limit`;
  un caso cerrado no admite cambios (409). El historial solo crece. Las filas son de la vivienda (RLS, migración 0036); se borran con ella.

## Límites conocidos (decisiones pendientes)
1. **Estados «en revisión» y «resuelto»** existen en el modelo, pero solo los fijará un panel de soporte, que no existe. Hoy la persona solo puede cerrar.
2. **Adjuntos subidos por la persona** no están: el almacenamiento actual está atado al OCR de facturas y retención propia; ampliarlo requiere decidir tipos,
   tamaños, retención y borrado. Mientras, el caso enlaza el original de la factura ya guardado.
3. **Notificaciones** de cambios de estado: no aplican hasta que exista el panel de soporte.
4. Sin verificar en Android/iOS (formulario con teclado, lectores de pantalla).

## Pruebas
`services/api/tests/test_claims.py` (9) + inventario de autorización + RLS, `packages/core/src/claims.test.ts`, `apps/web/src/test/claims-pages.test.tsx`,
BFF en `bff-recommendations.test.ts`, `apps/web/e2e/specs/15-claims-help.spec.ts` (flujo completo, privacidad entre cuentas, axe a 360/768/1280) y
`apps/mobile/src/features/claims/claims.test.ts`.
