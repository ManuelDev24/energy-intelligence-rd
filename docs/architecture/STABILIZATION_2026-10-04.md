# Estabilización — primer incremento

Fecha: 4 de octubre de 2026. Decisión del usuario: mantener el piloto privado y posponer autenticación.

## Cambios de este incremento

- Guardas antes de conectar/crear/recrear DB de pruebas: PostgreSQL, nombre seguro de hasta 63 caracteres terminado en `_test` y distinto de DB de aplicación. Configuración inválida falla, no se omite. En CI PostgreSQL es obligatorio.
- Alembic de pruebas recibe explícitamente la URL dedicada, además del override de settings.
- GET de umbrales devuelve valores vigentes/default sin insertar ni hacer commit.
- Migración `0004` y modelo de alertas: `kwh_pct` pasa de `Numeric(8,2)` a `Numeric(18,2)`. Probado con variación `99999999999800.00`. Downgrade rechaza valores que no caben, sin perder datos.
- Seed del contenedor opt-in. Compose sin configuración no siembra; `.env.example` activa explícitamente la demo local. Guías de demo actualizadas.
- Configuración de staging/production rechaza seed demo, credenciales locales y CORS sin HTTPS explícito. Config se valida antes de migrar desde el entrypoint.

La invalidación web ya estaba implementada en el checkout al iniciar este incremento. Se conservaron los cambios y se verificaron sus dos pruebas de regresión. También había cambios previos en UI, CI, observabilidad, Docker y paquetes compartidos; no se atribuyen a este incremento.

## Verificación

Se usó un contenedor PostgreSQL 16 temporal con puerto aleatorio en loopback, sin volumen persistente, separado de la base del piloto.

- Suite completa API tras los cambios iniciales: **124 pasan**, ninguna omitida.
- Tras añadir el caso de nombre largo y la prueba de downgrade con porcentajes extremos: suite dirigida de seguridad DB/migraciones, **17 pasan**.
- Web: pruebas existentes de invalidación de cache, **2 pasan**.
- Sintaxis del entrypoint y `git diff --check`: pasan.

El contenedor temporal se eliminó al terminar. No se migró la base activa del piloto ni se realizó despliegue, commit o push.

## Aplicación al piloto y siguiente trabajo

Al desplegar este código, aplicar `uv run alembic upgrade head` en `services/api` usando la URL de la base prevista; el contenedor sigue migrando al arrancar. Las pruebas únicamente migraron su base temporal.

Quedan para los siguientes incrementos el control de concurrencia de facturas/umbrales, extracción de servicios, contratos canónicos y optimizaciones medidas. La autenticación queda pospuesta por decisión explícita; la configuración de producción añadida no convierte la API actual en un servicio público con control de acceso.
