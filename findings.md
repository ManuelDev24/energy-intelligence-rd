# Hallazgos — Energy RD

## Estado inicial verificado (2026-10-02)
- Repositorio: `/Users/macbookpro/Desktop/energy-intelligence-rd`, rama `main`, rastrea `origin/main`.
- Últimos commits: `da7feb7 feat: initial project setup`; `f44359d feat: initial project structure for Energy RD Platform`.
- Árbol no limpio antes de esta planificación: `docs/SPECIFICATION.md` modificado; `.agents/`, `.claude/`, `docs/architecture/`, `skills-lock.json` y cachés Python sin seguimiento.
- Estructura observada: `frontend-mobile/app` (Expo/TypeScript), `backend/api` (FastAPI/Python), documentación en `docs/`, y `docker-compose.yml`.

## Estado verificado tras la inspección
- Mobile y API son esqueletos: el móvil conserva la pantalla plantilla y la API solo tiene `/` y `/health`.
- La web no está implementada: `frontend-web/app` no contiene un workspace funcional, aunque el script raíz la referencia.
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

## Auditoría integral verificada — 2026-10-10
- Baseline real: `origin/Dev` `92d39f5`, CI `38082199280` verde y ningún PR abierto.
- El piloto está bloqueado únicamente para promoción a QA por la aceptación OCR con fotos reales anonimizadas de EDESUR, EDENORTE y EDEESTE.
- El producto completo del plan no está próximo al 100%: quedan 59 paquetes finitos, 19 parciales y 40 no construidos.
- No existen implementaciones rastreadas en `frontend-web/admin`, `mcp/energy-rd-mcp` ni `packages/ui`; las carpetas están vacías.
- Fases 4–8 (Copilot/MCP, admin, IoT, solar, segmentos y plataforma nacional) son principalmente visión/documentación, no producto implementado.
- `npm audit` actual confirma 20 avisos altos y 0 críticos; Manuel aceptó temporalmente el riesgo, pero la vigilancia/actualización sigue pendiente.
- Backlog y dependencias: `docs/COMPLETE_PROJECT_GAP_ANALYSIS_2026-10-10.md`.

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

## ERD-ADM-RBAC + ERD-OCR-03 (Módulo 2, 2026-10-11)
- `frontend-web/admin` nuevo: Next.js con BFF de mismo origen, cookies `HttpOnly`/`SameSite=Strict`, nunca tokens en `localStorage`.
- **Quirk real de Next dev**: `request.url` puede reportar hostname `localhost` aunque el servidor escuche en otro host (`-H 127.0.0.1`); el chequeo de mismo origen del BFF debe confiar en el header `Host`, no en `url.origin`. Detectado y corregido ejecutando el E2E real contra el stack vivo — no lo habría encontrado ninguna prueba unitaria con mocks.
- Carrera de revocación del último `super_admin`: dos revocaciones concurrentes pueden contar cada una a la otra como activa y dejar cero; se serializa con `SELECT ... FOR UPDATE` sobre la fila del rol compartido dentro de la misma transacción, antes de contar.
- El borrado de cuenta (ERD-AUTH-03) puede chocar con la inmutabilidad de `admin_audit_events` si la FK de `actor_user_id` usa `ON DELETE SET NULL`: el trigger `BEFORE UPDATE` lo rechaza con 500. Se retiró la FK; el UUID queda como identificador seudónimo (pendiente de revisión legal de retención).

## Baseline actualizado de `origin/Dev` — 2026-10-15
- `git fetch --prune origin` confirmó `origin/Dev=f3cb2f42`; el worktree viejo `energy-intelligence-rd-web-start` sigue en `b1d9a9c` con cambios locales no publicados, y no se modificó ni se reseteará.
- `origin/Dev` contiene nueve commits posteriores, incluyendo `ERD-CLAIM-01`, `ERD-HELP-01`, `ERD-RPT-01`, `ERD-AI-CHAT-MOBILE`, actualizaciones de ahorro e idempotencia de onboarding. Por instrucción del propietario, estos módulos no se reportan como faltantes de desarrollo.
- `frontend-web/admin` en `origin/Dev` sí tiene login/RBAC/auditoría, OCR, resumen agregado y usuarios read-only. `admin.py` expone `/overview`, `/users`, `/ocr/*`, `/me`, `/roles`, `/scopes`, `/role-assignments` y `/audit-events`; no aparecen rutas/Scopes para acciones de usuario, viviendas/contratos, revisión de facturas, tarifas, operaciones, health real ni analytics AI agregados.
- Los scopes sembrados en `0024_admin_rbac.py` son `admin.roles.*`, `admin.ocr.*`, `admin.audit.read`, `admin.users.read` y `admin.system.read`; roles fijos `super_admin`, `operations_admin`, `ocr_reviewer`, `support_readonly`, `auditor`.
- `/admin/overview` llama a `admin_overview._jobs`; `worker_state` se deriva de trabajos vencidos sin job activo, explícitamente etiquetado INFERRED, no de un heartbeat. El health actual solo consulta DB/configuración de storage/email/Sentry; no prueba worker, latencia, backups/restores ni sondas.
- `OverviewCopilot` tiene provider, mensajes/tokens/personas/día; no costo, latencia o feedback. Usuarios administrativos son solo lectura. Menú admin contiene resumen, roles, usuarios, OCR y auditoría.
- Decisiones no aportadas y no inventables: copy legal aprobado; política para mostrar datos de vivienda/contrato a soporte; retención/tipos/tamaño de adjuntos; correo/responsable/SLAs de soporte; autorización de push/deploy y dominio/TLS de staging.
