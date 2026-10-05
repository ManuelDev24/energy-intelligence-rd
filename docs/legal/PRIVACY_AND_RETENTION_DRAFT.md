# BORRADOR — requiere revisión legal (Ley 172-13 RD)

> **Este documento NO es la política de privacidad ni los términos finales.** Es un inventario
> técnico y una propuesta de retención para que asesoría legal redacte los textos definitivos
> conforme a la Ley 172-13 sobre protección de datos personales de la República Dominicana.
> Ninguna cifra de retención aquí está aprobada.

Versiones vigentes servidas por `GET /api/v1/legal`: `terms_version = privacy_version =
"2026-10-draft"`, `status = "draft"` (constantes en `services/api/app/services/legal.py`).
El registro exige `accept_terms: true`; el servidor guarda la versión vigente y la fecha en
`users.terms_version` / `users.terms_accepted_at` (NULL en cuentas anteriores a la migración 0012).

## 1. Categorías de datos recogidos

| Categoría | Dónde | Contenido |
|---|---|---|
| Cuenta | `users` | correo, hash Argon2id de la contraseña (nunca la contraseña), rol, alta, versión y fecha de aceptación de términos |
| Sesiones | `auth_sessions`, `refresh_tokens` | fechas de creación/expiración/revocación; hash SHA-256 del refresh token (no el token) |
| Vivienda | `homes`, `home_members` | nombre, dirección, ciudad, provincia, municipio, sector, tipo de usuario, ocupantes, equipamiento (A/A, calentador, piscina, solar, inversor); membresía y rol |
| Contrato / onboarding | `contracts` | número de cuenta/contrato con la distribuidora |
| Facturación | `bills`, `bill_items`, `bill_snapshots` | períodos, kWh, montos, lecturas, conceptos; original inmutable de cada factura |
| Consumo | `meter_readings`, `home_goals` | lecturas del medidor, metas mensuales |
| Equipos y alertas | `equipment`, `alerts`, `alert_settings` | equipos y potencias, alertas generadas, umbrales |
| Auditoría | `audit_events` | operación, entidad, fechas e instantáneas antes/después (sin identidad del usuario) |
| Recuperación de contraseña | `password_reset_tokens` | hash SHA-256 del token (nunca el token), fechas de creación/caducidad/uso, HMAC del peer que lo pidió (sin IP en claro). El correo con el enlace se envía por el proveedor Resend (encargado del tratamiento, a reflejar en la política) |
| Antiabuso | `auth_abuse_buckets` | HMAC del peer de red + contador por ventana (sin IP en claro, sin correo) |
| Logs técnicos | stdout de la API | método, ruta (incluye ids), estado, duración, `request_id` |

## 2. Finalidades (propuesta)

- Prestar el servicio: análisis de consumo y facturas, alertas, metas y estimaciones.
- Seguridad de la cuenta: autenticación, revocación de sesiones, límites de abuso.
- Integridad y trazabilidad: originales inmutables de facturas y auditoría de cambios.
- Soporte y diagnóstico mediante `request_id`.
- No hay venta ni cesión a terceros, ni perfilado publicitario (a confirmar por producto/legal).

## 3. Retención por categoría (PROPUESTA, no aprobada)

| Categoría | Mientras la cuenta existe | Tras borrar la cuenta |
|---|---|---|
| Cuenta y consentimiento | indefinida | borrado inmediato |
| Sesiones / refresh hashes | hasta expirar (≤ 90 días) + limpieza periódica pendiente | borrado inmediato |
| Vivienda, contrato, facturas, lecturas, metas, equipos, alertas | indefinida | borrado inmediato si el usuario era el único miembro; si es compartida, se conserva para los demás miembros |
| Originales de factura | mientras exista la factura | se borran con la factura (regla de huérfano de 0011) |
| Auditoría | propuesta: 24 meses | filas de viviendas borradas se conservan seudonimizadas (`actor='deleted-user'`, sin instantáneas) |
| Tokens de recuperación | caducan a los 30 min; se purgan automáticamente 1 día después de caducar (en la siguiente solicitud de recuperación); un job global sigue pendiente | borrado inmediato (cascada) |
| Buckets antiabuso | propuesta: purgar ventanas vencidas > 7 días (job pendiente) | no vinculados a la cuenta |
| Logs técnicos | propuesta: 30 días en el proveedor de logs | no se purgan por cuenta |
| Backups | propuesta: 35 días rotativos | ver §5 |

## 4. Borrado de cuenta

`DELETE /api/v1/auth/me` con reautenticación por contraseña. Detalle completo, regla `409
ownership_transfer_required` y límites en `services/api/ACCOUNT_DELETION.md`.

## 5. Advertencia sobre copias de seguridad

Los backups y réplicas existentes **no** se modifican al borrar una cuenta; los datos persisten
en ellos hasta que el backup expira. Antes de producción hay que definir: retención de backups,
cifrado, quién puede restaurarlos y un procedimiento para re-aplicar borrados tras una restauración.

## 6. Pendiente para legal / producto

- Redactar términos y política finales; definir base legal del tratamiento y derechos ARCO
  (acceso, rectificación, cancelación, oposición) y su canal de ejercicio.
- Re-consentimiento al cambiar de versión (hoy no se fuerza a cuentas existentes/legadas).
- Transferencia de propiedad de viviendas compartidas.
- Exportación de datos del usuario (portabilidad), no implementada.
- Resend como encargado del tratamiento (destinatario y contenido del correo de recuperación;
  retención de logs en Resend): revisar su DPA y mencionarlo en la política.
- Responsable del tratamiento y datos de contacto.
