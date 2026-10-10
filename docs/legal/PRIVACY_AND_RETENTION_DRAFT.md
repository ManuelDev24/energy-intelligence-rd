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
| Originales de factura (metadatos) | `documents`, `storage_deletions` | tipo, tamaño, huella SHA-256, vivienda, autor, factura asociada, fecha de carga; **sin el archivo ni su nombre** (el contenido irá al almacenamiento privado, ERD-STORE-01, todavía inexistente) |
| Invitaciones a viviendas | `home_invitations` | correo de la persona invitada (dato de un tercero, ver §6), hash SHA-256 del token, fechas y quién invitó |
| Fotos de factura para OCR | memoria del proceso | la imagen se lee con Tesseract **local** y se descarta; solo se devuelven los campos y un extracto del texto leído a quien la subió. No se envía a ningún proveedor ni se conserva |
| Telemetría de errores | Sentry (opcional, `SENTRY_DSN`) | traza del error y `request_id`; **sin** cuerpos, cookies, cabeceras, IP, usuario, variables ni código fuente; correos/tokens filtrados antes de enviar. Inactivo hasta configurar el DSN |
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
| Originales de factura sin factura asociada | caducan a los 7 días (`DOCUMENT_UNCONFIRMED_RETENTION_DAYS`, propuesta) | borrado inmediato (cascada + cola de borrado del archivo) |
| Invitaciones | caducan a los 7 días; se conservan hasta borrar la vivienda | se borran con la vivienda; si se borra a quien invitó, se conservan sin ese vínculo |
| Backups | propuesta: 35 días rotativos, cifrados (`age`, clave privada fuera del servidor) | ver §5 |

## 4. Borrado de cuenta

`DELETE /api/v1/auth/me` con reautenticación por contraseña. Detalle completo, regla `409
ownership_transfer_required` y límites en `services/api/ACCOUNT_DELETION.md`.

## 5. Advertencia sobre copias de seguridad

Los backups y réplicas existentes **no** se modifican al borrar una cuenta; los datos persisten
en ellos hasta que el backup expira. Ya existen respaldos cifrados con clave pública (`scripts/db_backup.sh`) y un
simulacro de restauración (`docs/ops/DISASTER_RECOVERY.md`). Sigue pendiente decidir: retención definitiva, quién
guarda la clave privada y un procedimiento para **re-aplicar los borrados tras una restauración** (sin él, una
restauración puede resucitar cuentas ya borradas).

## 6. Terceros y proveedores (encargados del tratamiento) — a reflejar en la política

| Proveedor | Para qué | Datos que recibe | Estado |
|---|---|---|---|
| Neon (PostgreSQL, AWS us-east-1) | base de datos | todos los datos de §1 | previsto (ERD-DEPLOY-01) |
| Render (región Virginia) | alojamiento de API y web | tráfico y logs técnicos | previsto |
| Resend | correo de recuperación y de invitaciones | correo del destinatario y el enlace (contiene un token de un solo uso); nombre de la vivienda en las invitaciones | previsto; revisar DPA y retención de sus logs |
| Sentry | errores | ver §1 (sin datos personales por diseño) | opcional, inactivo |
| Expo / EAS | compilar y distribuir la app | ninguno de los usuarios (solo el binario) | previsto |
| Cloudflare (opcional) | proxy delante de Render | IP del visitante (`CLIENT_IP_SOURCE=cf-connecting-ip`) | solo si se activa |

**Datos de terceros:** una invitación guarda el correo de alguien que aún no aceptó términos; un propietario ve los
correos de los miembros de su vivienda. Legal debe decidir el aviso y la base legal.
**Transferencias internacionales:** Neon, Render y Resend operan en EE. UU.; la ley 172-13 exige tratarlo.

## 7. Derechos ARCO: mecanismo técnico de cada uno

| Derecho | Mecanismo hoy | Hueco |
|---|---|---|
| **Acceso / portabilidad** | `GET /api/v1/auth/me/export` → JSON con la cuenta, las viviendas del titular (con su rol), facturas con conceptos, lecturas, equipos, alertas, metas, contrato, metadatos de documentos y sesiones. Excluye contraseñas, tokens, claves de archivos, auditoría interna y datos de otras personas. Montos como texto exacto. 6 pruebas | no hay botón en web/móvil todavía (ERD-PROF-01); no incluye los archivos originales (no se almacenan aún) |
| **Rectificación** | editar vivienda, contrato, meta, equipos, facturas y lecturas; cambiar contraseña (`POST /auth/password/change`) | **no se puede cambiar el correo de la cuenta** (no hay endpoint) |
| **Cancelación** | `DELETE /auth/me` con contraseña; borra las viviendas donde es el único miembro, sale de las compartidas y bloquea (409) al único propietario hasta transferir o expulsar | los backups conservan datos hasta expirar (§5); sin procedimiento de re-borrado tras restaurar |
| **Oposición** | no hay perfilado publicitario ni cesión; retirar el consentimiento equivale a cancelar la cuenta | no hay preferencias de comunicaciones hasta ERD-PROF-01 / ERD-ALERT-02 |
| **Canal y plazo** | — | **sin definir**: correo de contacto del responsable, plazo de respuesta y verificación de identidad |

## 8. Pendiente (solo puede cerrarlo asesoría legal / el responsable del tratamiento)
- Redactar términos y política finales; base legal del tratamiento; nombre y contacto del responsable; canal y plazo ARCO.
- Aprobar o cambiar las cifras de retención de §3 y la retención de logs/respaldos.
- Re-consentimiento al cambiar de versión (hoy no se fuerza a cuentas existentes ni legadas).
- Revisar los DPA de Neon, Render, Resend y Sentry y las transferencias internacionales (§6).
- Decidir el aviso para los correos de terceros en invitaciones y la visibilidad de correos entre miembros.
- Hasta que firme legal, `GET /api/v1/legal` seguirá devolviendo `status = "draft"` y la UI lo mostrará como borrador.
