# Política de seguridad

## Cómo reportar una vulnerabilidad

**No abras un issue público** con detalles de una vulnerabilidad ni incluyas datos personales reales en ningún reporte.

Usa el reporte privado de GitHub: pestaña **Security → Report a vulnerability** de este repositorio
(requiere que «Private vulnerability reporting» esté activado en *Settings → Code security*).

Incluye, si puedes: qué parte del sistema (web, móvil o API), pasos para reproducirlo con datos sintéticos, el impacto que ves y la
versión o commit. No pruebes con cuentas ni datos de otras personas, no hagas pruebas de denegación de servicio y no accedas a más
datos de los necesarios para demostrar el problema.

## Qué esperar

- Acuse de recibo en un plazo razonable y comunicación del estado del reporte.
- Corrección y, si aplica, aviso a las personas afectadas según la gravedad.
- El proyecto es un **piloto**: aún no se ofrece recompensa económica.

## Alcance y estado conocido

Los hallazgos y el plan de corrección de las auditorías internas están en `docs/audit/`. Los avisos de dependencias aceptados de forma
temporal (con fecha de revisión) están en `docs/security/accepted-advisories.json` y se revisan con `npm run audit:monitor` (y `pip-audit` en `backend/api`) antes de cada despliegue; ya no hay workflows de GitHub que lo hagan.
