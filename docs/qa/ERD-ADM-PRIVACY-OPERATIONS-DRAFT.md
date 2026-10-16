# Propuesta de política operativa y privacidad para `frontend-web/admin`

**Estado:** borrador interno para revisión del propietario y asesoría legal. No constituye aprobación legal ni habilita acceso en staging/producción. Baseline: `origin/Dev` `f3cb2f42`, 2026-10-15.

## Principios

- Una API de negocio única (`backend/api`); BFF administrativo solo para sesión/seguridad.
- Acceso denegado por defecto, scopes por acción y motivos obligatorios para mutaciones sensibles.
- Mínima divulgación: mostrar solo lo necesario para resolver el caso; no habilitar lectura general de conversaciones privadas ni documentos originales.
- Auditoría append-only de actor, recurso, acción, motivo saneado, resultado y request ID. No copiar email, descripción del caso ni contenido de factura a la auditoría.
- Datos sintéticos en E2E. Ninguna prueba o captura usa cuentas/facturas reales.

## Decisiones recomendadas — requieren aprobación antes de exponer datos

### Viviendas y contratos (`ERD-ADM-HOMES-WEB`)

**Propuesta conservadora:** soporte no ve nombre de persona, dirección exacta, teléfono, email de otros miembros ni número completo de contrato/cuenta. La pantalla podría mostrar un identificador aleatorio de vivienda, distribuidora, municipio/provincia si ya existe y es necesario, estado/fechas del contrato y últimos cuatro caracteres de un identificador de cuenta. Abrir un dato adicional requeriría permiso separado, motivo y auditoría; acceso temporal con caducidad.

Antes de implementar lectura por vivienda, confirmar si el equipo necesita ubicación geográfica y qué identificador puede usar para buscar un caso sin revelar PII.

### Facturas y documentos (`ERD-ADM-BILLS-WEB`)

- Vista inicial: periodo, kWh/monto, calidad y procedencia, estado OCR, ID opaco del documento; excluir URL firmada, clave de storage, nombre de archivo con datos personales y contenido OCR raw.
- Corrección administrativa como acción aparte con scope, motivo y snapshot/audit inmutable; nunca reemplazar la factura original ni autoaprobar el OCR.
- Descargar el original solo bajo permiso independiente, registro de acceso y aprobación de política de retención.

### Usuarios (`ERD-ADM-USERS-WRITE`)

- Exportación/borrado se registra como **solicitud pendiente**, no ejecuta una exportación ni elimina inmediatamente la cuenta.
- Cierre de sesiones y desactivación son permisos distintos; ambos requieren motivo y auditoría. La desactivación revoca sesiones en la misma transacción.
- Bloquear la baja del último `super_admin` activo; no proporcionar endpoint de elevación por HTTP.
- Para pasar una solicitud a completada/rechazada exigir resultado y motivo; no guardar el archivo exportado en el panel.

### Reclamaciones de soporte (`ERD-CLAIM-SUPPORT`)

- Rol recomendado `support_agent` separado de `support_readonly`; scopes independientes para ver casos y cambiar estado.
- Transiciones recomendadas: `open → in_review → resolved`; conservar `closed` para el cierre iniciado por la persona. Toda transición añade evento inmutable con agente y motivo visible en el historial del caso.
- No editar la descripción/evidencia redactada por el usuario; no exponer documentos de factura por defecto. Cada acceso individual queda auditado.

### Adjuntos (`ERD-CLAIM-ATTACHMENTS`)

**No habilitar adjuntos adicionales** hasta aprobar: formatos permitidos (recomendación: PDF/JPEG/PNG), tamaño máximo, antivirus, almacenamiento/cifrado, acceso, plazo de retención por estado del caso y proceso de eliminación/legal hold. No inferir esos límites de la implementación actual.

### Tarifas (`ERD-ADM-TARIFFS-WEB`)

- Solo publicar una versión con resolución/URL oficial verificable, distribuidora, periodo de vigencia, bloques y cargos validados; no editar una versión histórica en sitio.
- Vista previa calcula ejemplos sin guardarlos; publicación exige scope separado, motivo, validación de intervalos/no solapes y auditoría.
- Hasta tener una fuente oficial válida, el comportamiento es `tariff_unavailable`; no sembrar tarifas plausibles.

### Operaciones y sistema (`ERD-ADM-OPERATIONS-WEB`, `ERD-ADM-SYSTEM-WEB`)

- Lecturas, consumo, alertas, apagones y recomendaciones son solo lectura. Exponer datos por vivienda requiere autorización separada; preferir métricas agregadas al inicio.
- Separar «API respondió a esta sonda», «worker heartbeat recibido», «backup reportado por proveedor» y «restauración probada». Ningún contador de DB puede presentarse como prueba de backup/restore.
- Guardar ventana, momento, fuente y proceso para latencia/health; mostrar desconocido/estale explícitamente.

### Analítica de Copilot (`ERD-AI-ADMIN-WEB`)

- Agregar solicitudes, tokens de entrada/salida, proveedor/modelo, latencia, estado y feedback por día/modelo; no devolver prompts, respuestas, fuentes, nombres, IDs de conversación ni mensajes.
- Mostrar costo como **estimación** solo si hay una tarifa aprobada/configurada para el modelo y periodo exactos. Sin esa fuente, el costo debe indicar «no configurado», no cero.

### Ayuda (`ERD-HELP-OPERATIONS`)

Faltan dirección de correo pública, responsable de soporte, objetivo de primera respuesta y revisión editorial/legal. No sustituirlos por valores ficticios; mantener mensaje de soporte no configurado y el contenido versionado en código hasta decidir si hace falta edición desde admin.

## Gate de publicación

El E2E local con datos sintéticos, compilación o una sonda API no certifica staging. Antes de habilitar módulos o desplegar se requiere aprobación de estos campos, política legal definitiva, cuenta/dominio/TLS de staging y autorización explícita de publicación. Este documento permanece en estado borrador hasta entonces.
