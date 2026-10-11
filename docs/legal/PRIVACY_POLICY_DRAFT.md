# BORRADOR — Política de Privacidad de Energy RD (sin revisión legal)

> **Borrador técnico basado en el inventario real de datos (`PRIVACY_AND_RETENTION_DRAFT.md`). NO es asesoría legal.** Debe revisarlo un
> abogado (Ley 172-13 de la República Dominicana) antes de publicarse. `[ENTRE CORCHETES]` = lo define el responsable.
> Versión `2026-10-draft`. Estado `draft`.

## 1. Responsable del tratamiento
`[RAZÓN SOCIAL, RNC, DOMICILIO]` · Contacto para sus derechos: `[CORREO]` · Plazo de respuesta: `[PLAZO]`.

## 2. Qué datos tratamos y para qué
| Datos | Para qué | Dónde se guardan |
|---|---|---|
| Correo y contraseña (la contraseña solo como hash Argon2id, nunca en claro); versión y fecha de aceptación de los términos | Crear y proteger su cuenta | Base de datos |
| Sesiones (fechas y huella del token de renovación) | Mantenerla iniciada y permitir cerrarlas | Base de datos |
| Vivienda: nombre, provincia/municipio/sector, distribuidora, número de contrato (opcional), tipo de usuario, ocupantes, equipos que declara (tipo, marca, modelo, potencia, horas de uso) | Calcular y mostrar su consumo y estimaciones | Base de datos |
| Facturas (períodos, kWh, montos, fecha límite y de pago) y lecturas del medidor | Historial, comparaciones, proyecciones, metas y alertas | Base de datos |
| **Original de la factura** (foto o PDF) si usted lo sube | Leerlo (OCR local) y conservar su respaldo | Almacenamiento privado, **cifrado** (AES-256-GCM); descarga solo con enlace firmado de 60 segundos |
| Resultado de la lectura OCR (borrador) | Prellenar el formulario; se descarta al confirmar o al expirar | Base de datos |
| Alertas, anomalías detectadas y registro de avisos enviados (sin su contenido) | Avisarle y mostrarle su historial | Base de datos |
| Token de notificaciones push del teléfono | Enviarle avisos push (solo si los activa) | Base de datos |
| Auditoría de cambios (qué cambió y cuándo; sin su identidad) | Seguridad e integridad | Base de datos |
| Datos técnicos de seguridad: huella no reversible de la red de origen y contadores por ventana de tiempo (sin IP en claro) | Frenar abusos y ataques | Base de datos |
| Registros técnicos: método, ruta, estado, duración e identificador de la petición | Diagnosticar fallos | Proveedor de alojamiento |
| Errores de la aplicación (si el responsable activa Sentry): traza del error e identificador, **sin** cuerpos, cookies, correo, IP ni usuario; los correos y tokens se filtran antes de enviar | Corregir fallos | Sentry |

**No hacemos** perfilado publicitario, no vendemos ni cedemos sus datos a terceros con fines comerciales, ni analizamos sus facturas con
servicios externos de inteligencia artificial: la lectura de facturas se hace en nuestros propios servidores con Tesseract.

## 3. Con quién los compartimos (encargados del tratamiento)
`[A COMPLETAR Y VERIFICAR CON CONTRATOS Y DPA]`
| Proveedor | Para qué | Qué recibe | País |
|---|---|---|---|
| Neon (PostgreSQL) | Base de datos | Todos los datos de la tabla anterior | EE. UU. |
| Render | Alojamiento de la API y la web | Tráfico y registros técnicos | EE. UU. |
| Proveedor de almacenamiento S3-compatible `[Cloudflare R2 / AWS S3]` | Originales cifrados | Solo archivos **cifrados** (no puede leerlos) | `[REGIÓN]` |
| Resend | Correos (recuperar contraseña, invitaciones, avisos) | Su correo y el enlace; los avisos llevan texto genérico y un enlace, sin cifras | EE. UU. |
| Expo / FCM / APNs | Notificaciones push | Token del dispositivo y texto genérico («tiene una alerta nueva»), sin cifras ni nombre de vivienda | EE. UU. |
| Sentry (opcional) | Errores | Ver §2 | EE. UU. |
Estos proveedores operan fuera de la República Dominicana: `[TRATAMIENTO DE TRANSFERENCIAS INTERNACIONALES SEGÚN LEY 172-13]`.

## 4. Cuánto tiempo los conservamos (propuesta, pendiente de aprobación)
Su cuenta y datos: mientras la cuenta exista. Originales de factura sin factura asociada: 7 días. Tokens de recuperación: 30 minutos. Token push:
hasta que cierre sesión en la app, apague los avisos o el proveedor lo invalide. Registro de avisos y anomalías: `[12 meses]`. Copias de seguridad
cifradas: `[35 días]`. Registros técnicos: `[30 días]`. Tras borrar la cuenta se borran de inmediato sus datos personales (ver §6).

## 5. Seguridad
Contraseñas con Argon2id; sesiones con tokens de corta duración; originales cifrados antes de subir; enlaces de descarga firmados y de 60 s que
validan que usted sigue siendo miembro de la vivienda; límites contra abuso; copias de seguridad cifradas con `age`; telemetría con filtro de
datos personales. Ningún sistema es infalible: si ocurre una brecha que le afecte, se lo comunicaremos `[PLAZO Y CANAL]`.

## 6. Sus derechos (acceso, rectificación, cancelación y oposición)
| Derecho | Cómo ejercerlo hoy |
|---|---|
| Acceso y portabilidad | «Mi cuenta» → descargar mis datos (JSON): cuenta, viviendas, facturas, lecturas, equipos, alertas, anomalías, preferencias, dispositivos (sin el token) y avisos |
| Rectificación | Editar vivienda, contrato, meta, equipos, facturas y lecturas; cambiar la contraseña. `[Cambio de correo: aún no disponible]` |
| Cancelación | «Mi cuenta» → borrar cuenta (con contraseña). Borra de inmediato sus datos; las copias de seguridad los conservan hasta que expiran |
| Oposición / avisos | Apague correo y push en «Mi cuenta»; retirar el consentimiento equivale a cerrar la cuenta |
Para cualquier otro ejercicio o reclamo: `[CORREO]`. Si no queda conforme, puede acudir a `[AUTORIDAD COMPETENTE]`.

## 7. Menores
El servicio no está dirigido a menores de `[EDAD]` años.

## 8. Cambios
Si cambia esta política de forma relevante, se lo avisaremos y, cuando corresponda, le pediremos aceptar de nuevo.

---
### Notas para quien revise (no forman parte del texto)
- Cada afirmación de §2, §3 y §6 corresponde a algo que el código hace hoy; si alguna deja de ser cierta, hay que actualizar el texto.
- Pendiente de decisión legal: base legal de cada tratamiento, plazos reales, transferencias internacionales, consentimiento para avisos,
  aviso para correos de terceros en invitaciones y visibilidad de correos entre miembros de una vivienda.
