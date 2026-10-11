# ERD-ADM-RBAC — QA

Capa administrativa (roles, scopes, asignaciones, auditoría inmutable) separada por completo
de los permisos domésticos (`home_members`). Ejecutado en copia aislada; no se tocó el repo
canónico ni se hizo commit/push/merge.

## Alcance implementado

- Migración Alembic `0014_admin_rbac` (reversible): `admin_roles`, `admin_scopes`,
  `admin_role_scopes`, `admin_role_assignments`, `admin_audit_events` (inmutable por triggers
  `BEFORE UPDATE/DELETE/TRUNCATE`, mismo patrón que `bill_snapshots` en 0011).
- 5 roles seed: `super_admin`, `operations_admin`, `ocr_reviewer`, `support_readonly`, `auditor`.
- 8 scopes seed: `admin.roles.read`, `admin.roles.manage`, `admin.ocr.read`, `admin.ocr.retry`,
  `admin.ocr.review`, `admin.audit.read`, `admin.users.read`, `admin.system.read`.
- Servicio puro `app/services/admin.py` (sin FastAPI, pasa `scripts/check_architecture.py`):
  `effective_roles_and_scopes` (recalculado de la BD en cada request, nunca de claims del
  token), `assign_role`, `revoke_assignment` (bloquea revocar el último `super_admin` activo),
  `bootstrap_super_admin` (idempotente), `record_audit`, `list_audit_events`.
- Dependencias FastAPI `app/api/admin_deps.py`: `current_admin` (siempre exige bearer real,
  incluso con `AUTH_ENABLED=False` en modo piloto doméstico) y `require_scope(scope)` (deniega
  por defecto y audita tanto éxito como denegación de cada endpoint).
- Rutas `app/api/v1/admin.py`: `GET /admin/me`, `GET /admin/roles`, `GET /admin/scopes`,
  `GET/POST /admin/role-assignments`, `POST /admin/role-assignments/{id}/revoke`,
  `GET /admin/audit-events` (filtros + paginación).
- CLI de bootstrap `app/cli_bootstrap_admin.py` (`python -m app.cli_bootstrap_admin <email>`),
  sin endpoint HTTP equivalente.
- `apps/admin` (Next.js, mínima): login, verificación de sesión, nav protegida por scope real,
  "Mi acceso", gestión de roles/asignaciones (solo con `admin.roles.manage`), visor de
  auditoría con filtro por acción, estados loading/empty/error/forbidden+Retry, logout.

## Cómo se ejecutó

Copia aislada: `~/.hermes/cache/scratch/erd-adm-rbac/worker` (symlink de `node_modules` y
`.venv` del canónico, sin instalar nada). Base de datos de pruebas: `energy_rd_test` en el
Postgres local existente (puerto 5433, mismo servidor que el piloto pero base *distinta*,
validada por `tests/db_safety.py::validate_test_database_url`, que ya rechaza nombres que no
terminen en `_test` o que coincidan con la base de aplicación). Nunca se usó la base piloto.

## Resultados de pruebas — backend (`services/api`)

```
cd services/api && uv run pytest -q
598 passed, 1 warning in 138.46s
```

16 de esos tests son nuevos, en `tests/test_admin_rbac.py`, cubriendo exactamente la lista
exigida por el spec:

| Caso | Test |
|---|---|
| Usuario normal → 403 en rutas con scope | `test_normal_user_forbidden_on_scoped_routes` |
| Sin sesión → 401 | `test_no_session_is_401`, `test_admin_endpoints_ignore_pilot_no_auth_mode` |
| Cada rol usa solo sus scopes | `test_each_role_has_exactly_its_own_scopes` |
| Revocación inmediata | `test_assign_revoke_and_immediate_effect` |
| Rol expirado | `test_expired_role_assignment_has_no_effect` |
| Asignación duplicada | `test_duplicate_active_assignment_rejected` |
| Bootstrap idempotente | `test_bootstrap_super_admin_is_idempotent` (vía servicio y vía CLI, ver abajo) |
| Protección del último super_admin | `test_last_super_admin_cannot_be_revoked`, `test_second_super_admin_can_be_revoked_first_stays` |
| Auditoría de asignación/revocación | `test_audit_assign_and_revoke_recorded_without_sensitive_data` |
| Datos sensibles ausentes de auditoría | mismo test: verifica que password/token/refresh_token nunca aparecen en `admin_audit_events` |
| Aislamiento admin vs doméstico | `test_home_membership_does_not_grant_admin_and_vice_versa` |
| Tabla de auditoría inmutable | `test_audit_table_is_immutable` (UPDATE/DELETE/TRUNCATE rechazados) |
| No bypass `is_admin=true` / rol inventado | `test_assignment_role_name_must_exist` |
| Motivo obligatorio | `test_assign_requires_reason` |

También se corrigieron 2 tests existentes que fallaban solo porque fijaban la revisión
`"0013"` como `head` (`tests/test_migrations.py`) y uno (`tests/test_authorization.py`) que
afirmaba el conjunto completo de rutas públicas fuera de `/homes` — se amplió para excluir
`/admin/*` explícitamente (no es pública: siempre exige bearer) en vez de contarla como tal.

## Migraciones

`uv run pytest tests/test_migrations.py` incluye upgrade desde cero, downgrade de `0014` a
`0013` y upgrade de vuelta a `head`, además de `test_models_match_migration` (los modelos
SQLAlchemy coinciden exactamente con el esquema generado por Alembic, incluido el índice
único parcial `uq_admin_role_assignments_active`).

## CLI de bootstrap (smoke test manual)

```
$ uv run python -m app.cli_bootstrap_admin cli-bootstrap@example.com
super_admin creado para cli-bootstrap@example.com (assignment_id=...)
$ uv run python -m app.cli_bootstrap_admin cli-bootstrap@example.com
cli-bootstrap@example.com ya es super_admin activo (assignment_id=...); nada que hacer
```
Mismo `assignment_id` en ambas ejecuciones: idempotente confirmado contra la base de pruebas real.

## Architecture check

```
python3 scripts/check_architecture.py
Architecture boundaries passed
```
`app/services/admin.py` no importa FastAPI; `app/api/v1/admin.py` no controla transacciones
(el commit/rollback vive en `app/services/transactions.write_transaction`, igual que el resto
del código existente).

## Frontend (`apps/admin`)

- `npx vitest run` → 4/4 (lógica pura de control de acceso: deny-by-default, visibilidad de
  navegación por scope).
- `npx tsc --noEmit` → sin errores.
- `npx next build` → compila y genera las 6 rutas estáticas/cliente sin errores.
- **No se ejecutó E2E contra un backend real corriendo** (fuera de alcance de esta pasada:
  requeriría levantar API + Postgres + esta app simultáneamente). Las páginas se probaron por
  tipos, build y lógica unitaria; la integración real queda para que el coordinador la
  verifique en un entorno con ambos servicios arriba, o para una fase posterior con Playwright.

## Pendiente / decisiones para el coordinador

- **apps/admin es intencionalmente mínima** (como pide el spec): no incluye gestión de
  usuarios/viviendas/tarifas. Estilo visual es básico (sin Tailwind ni design system) — se
  priorizó correctitud funcional y de permisos sobre pulido visual, dado el alcance ya grande
  de la tarea.
- **No hay E2E automatizado** (Playwright/Cypress) para el flujo completo login → ver mi
  acceso → asignar rol → ver auditoría. Recomendado como siguiente paso si se quiere cobertura
  total del spec ("tests de ... E2E").
- **Rotación/expiración de sesión del admin**: reutiliza el mismo mecanismo de
  `/api/v1/auth/login` y `/refresh` que el resto de la app (no se creó un login administrativo
  separado); es intencional para no duplicar lógica de autenticación, pero significa que un
  usuario doméstico normal también puede loguearse en `apps/admin` — simplemente no verá nada
  (ver "Mi acceso" vacío) porque la autorización vive 100% en el backend, no en el login.
- **Ningún endpoint nuevo para convertir usuarios en admin**: cumplido a propósito; el único
  camino es el CLI de bootstrap (solo para el primer `super_admin`) o `POST
  /admin/role-assignments` por alguien que ya tenga `admin.roles.manage`.
