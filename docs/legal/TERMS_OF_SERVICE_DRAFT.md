# BORRADOR — Términos de Servicio de Energy RD (sin revisión legal)

> **Este texto es un borrador técnico redactado a partir de lo que la aplicación hace hoy. NO es asesoría legal ni un documento
> vigente.** Lo debe revisar y aprobar un abogado (Ley 172-13 de protección de datos de República Dominicana y normas de consumo)
> antes de publicarse o de pedir a alguien que lo acepte. Los espacios `[ENTRE CORCHETES]` los define el responsable.
> Versión: `2026-10-draft` (la misma que registra la API al aceptar). Estado: `draft`.

## 1. Quiénes somos y qué es Energy RD
Energy RD es una aplicación web y móvil de `[RAZÓN SOCIAL, RNC, DOMICILIO Y CORREO DE CONTACTO DEL RESPONSABLE]` que ayuda a las
personas a entender el consumo y el costo de su energía eléctrica a partir de **datos que ellas mismas registran** (facturas, lecturas
del medidor, equipos declarados).

## 2. Qué NO es
- **No es una distribuidora de electricidad ni sustituye su factura.** La factura oficial es la que emite EDESUR, EDENORTE o EDEESTE.
- **No es un medidor ni una medición.** Todo número lleva una etiqueta: **REAL** (viene de su factura o lectura), **ESTIMADO** (se
  calcula, p. ej. consumo por equipo), **PROYECTADO** (predicción) o **INFERIDO**. Las estimaciones y proyecciones pueden equivocarse.
- **No da asesoría regulatoria ni tarifaria.** No asigna categorías tarifarias oficiales ni garantiza ahorros.
- La lectura automática de fotos y PDF (OCR) produce un **borrador** que usted debe revisar y confirmar; nada se guarda como factura sin su
  confirmación, y puede contener errores.

## 3. Su cuenta
1. Debe tener 18 años o más (`[CONFIRMAR EDAD MÍNIMA]`) y dar un correo que sea suyo. Es responsable de su contraseña; no la comparta.
2. Puede compartir una vivienda con otras personas invitándolas por correo; quien invita decide su rol y puede retirarlas.
3. Puede cerrar sus sesiones en otros dispositivos y **borrar su cuenta** en cualquier momento desde «Mi cuenta» (ver §7).

## 4. Uso aceptable
No use el servicio para: acceder a cuentas o viviendas ajenas, subir contenido ilegal o con malware, sobrecargar o atacar el servicio,
extraer datos masivamente ni eludir los límites de seguridad. Podemos limitar o suspender una cuenta por abuso, avisando cuando sea posible.

## 5. Su contenido
Las facturas, fotos, lecturas y demás datos que sube siguen siendo suyos. Nos autoriza solo a **almacenarlos, procesarlos y mostrárselos**
para prestarle el servicio (incluida la lectura OCR local), según la Política de Privacidad. Los originales de factura se guardan cifrados.
Si sube datos de otras personas (p. ej. una factura a nombre de un familiar), declara que tiene derecho a hacerlo.

## 6. Avisos y notificaciones
Podemos enviarle **avisos por correo y notificaciones push** sobre alertas de su vivienda (variación de consumo, anomalías, pagos por
vencer). Son genéricos, sin cifras. Usted elige qué recibir en «Mi cuenta»; los avisos operativos de seguridad (p. ej. recuperar la
contraseña) no se pueden desactivar.

## 7. Cierre y borrado
Puede borrar su cuenta (se pide su contraseña). Se borran de inmediato sus datos personales y las viviendas donde usted es el único
miembro; en las compartidas, se conservan para las demás personas sin su vínculo. Las copias de seguridad cifradas conservan datos hasta que
expiran (`[PLAZO, propuesta 35 días]`). Ver la Política de Privacidad.

## 8. Disponibilidad y cambios
El servicio se ofrece «tal cual», sin garantía de disponibilidad continua; trabajamos para que sea confiable pero puede haber
interrupciones. Podemos cambiar el servicio o estos términos; si el cambio es relevante le pediremos que vuelva a aceptar.

## 9. Responsabilidad
`[A DEFINIR POR EL ABOGADO: límites de responsabilidad permitidos por la ley dominicana, en particular frente a decisiones tomadas con
estimaciones o proyecciones, y los derechos irrenunciables del consumidor.]`

## 10. Ley aplicable y contacto
Rigen las leyes de la República Dominicana; `[JURISDICCIÓN Y FORO]`. Contacto: `[CORREO]`.

---
### Notas para quien revise (no forman parte del texto)
- La aceptación se registra con versión y fecha (`users.terms_version`, `terms_accepted_at`); no se fuerza una nueva aceptación a cuentas
  existentes al cambiar de versión (pendiente: decidir la política).
- Decidir si los puntos 3.1 (edad), 6 (avisos) y 7 (plazos) coinciden con la política de privacidad.
