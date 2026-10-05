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
