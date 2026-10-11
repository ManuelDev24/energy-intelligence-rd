# Hallazgos — Energy RD

## Estado inicial verificado (2026-10-02)
- Repositorio: `/Users/macbookpro/Desktop/energy-intelligence-rd`, rama `main`, rastrea `origin/main`.
- Últimos commits: `da7feb7 feat: initial project setup`; `f44359d feat: initial project structure for Energy RD Platform`.
- Árbol no limpio antes de esta planificación: `docs/SPECIFICATION.md` modificado; `.agents/`, `.claude/`, `docs/architecture/`, `skills-lock.json` y cachés Python sin seguimiento.
- Estructura observada: `apps/mobile` (Expo/TypeScript), `services/api` (FastAPI/Python), documentación en `docs/`, y `docker-compose.yml`.

## Estado verificado tras la inspección
- Mobile y API son esqueletos: el móvil conserva la pantalla plantilla y la API solo tiene `/` y `/health`.
- La web no está implementada: `apps/web` no contiene un workspace funcional, aunque el script raíz la referencia.
- No hay modelos, routers, migraciones, seeds ni pruebas funcionales para el dominio energético.
- El MVP viable es factura manual → historial mensual → dashboard → proyección lineal/reglas, para cinco viviendas piloto.
- El backend debe ser la única fuente de cálculos; UI móvil/web solo consumen contratos versionados.
- Hallazgos y asignación completa: `docs/SPRINT_PLAN_2026-10-02.md`.

## Continuación integral — 2026-10-04
- La descripción de esqueletos anterior es histórica: hoy existe piloto funcional web/móvil/API, con 197 entradas de cambios locales en Dev.
- Baseline actual: 134 pruebas API pasan en base local dedicada energy_rd_baseline_test; core 29, contratos 2, cliente 4, web 68, móvil 57; omitidas 5 web y 8 móvil de integración. Typecheck/lint/build web exit 0.
- Claude Code no está autenticado. Se delegó mediante agentes disponibles sin cambiar cuentas ni habilitar gastos de API.
- Implementación de seguridad y dependencias separadas en copias sin secretos bajo ~/.hermes/cache/scratch/energy-fullscope-20261004/{auth-backend,dependencies}; no integradas aún.
- Nunca interpretar baseline verde como autenticación, OCR, despliegue, CI remoto o integraciones completadas.

## Hallazgos del Módulo 1 (2026-10-11)
- **React Query oculta los mocks de red en pruebas E2E**: el panel precarga facturas y panel (`staleTime` 60 s), así que `page.route` sobre una pantalla ya visitada no se ejecuta. Las pruebas de estados (loading/error/Reintentar) deben registrar la ruta *antes* de elegir la vivienda. «Entrar a una pantalla» no siempre vuelve a pedir datos: Ahorro y Energy Score usan `staleTime: 0` + `refetchOnMount: "always"` a propósito.
- **`next dev` y `next build` comparten `.next`**: hay que borrarla entre un build de producción y una corrida E2E, y nunca correr dos servidores a la vez.
- **La web no renueva la sesión en silencio** (decisión de diseño): al vencer el acceso se redirige a `/login`; la rotación del token de renovación se prueba contra la API.
- **Correos `.test` los rechaza el validador**: los datos sintéticos usan `@example.com`.
- **Restricciones de exclusión + Alembic**: `EXCLUDE USING gist` con `tstzrange(... coalesce(ended_at,'infinity'))` no genera deriva en `alembic check` y el solape se bloquea tanto en el servicio (409 con mensaje) como en la base.
- **Convención de agregados**: los apagones se cuentan enteros en el mes en que empezaron (hora de RD); un apagón que cruza el cambio de mes no se parte.
- **Plan vs. implementación (SAVE-01)**: el plan menciona dificultad y «Aplicar objetivo»; no se implementaron (ver el análisis de brechas).
- **Maestro**: los flujos `auth-flow`/`pilot-flow` recorren Perfil y Panel, que ahora tienen un botón y dos tarjetas más; si algún flujo asume la altura de la pantalla puede necesitar un `scroll`. No se pudo comprobar sin emulador.
- **Contenedor efímero**: los commits del módulo viven solo en este contenedor hasta que se empujen.

