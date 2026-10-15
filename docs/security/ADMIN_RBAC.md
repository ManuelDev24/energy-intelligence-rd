# ADMIN_RBAC — diseño de seguridad

## Objetivo

Capa administrativa con acceso denegado por defecto, scopes granulares, revocación
inmediata y auditoría inmutable — completamente separada de los permisos domésticos
(`home_members`, `authorize_home`). Nada en este módulo puede otorgar acceso doméstico, y
nada doméstico otorga acceso administrativo.

## Modelo de datos

```
admin_roles            (id, name único, description, created_at)
admin_scopes           (id, name único, description)
admin_role_scopes       (role_id, scope_id)                     -- qué puede hacer cada rol
admin_role_assignments  (id, user_id, role_id, assigned_by_user_id, reason NOT NULL,
                         granted_at, expires_at NULL, revoked_at NULL,
                         revoked_by_user_id NULL, revoke_reason NULL)
admin_audit_events      (id, actor_user_id NULL, action, resource, scope_used NULL,
                         reason NULL, result IN (success|denied|error), request_id NULL,
                         metadata jsonb NULL, created_at)        -- INMUTABLE
```

Invariantes aplicados por la base de datos, no solo por la aplicación:

- `CHECK (length(trim(reason)) > 0)` en `admin_role_assignments`: nunca se puede asignar un
  rol sin motivo.
- `CHECK` de pares: `revoked_at`/`revoke_reason`/`revoked_by_user_id` van siempre juntos o
  ninguno — no hay revocación "silenciosa" sin motivo ni autor.
- Índice único parcial `(user_id, role_id) WHERE revoked_at IS NULL`: una sola asignación
  *activa* del mismo rol por usuario (bloquea duplicados a nivel de BD, no solo de API).
- `admin_audit_events` tiene triggers `BEFORE UPDATE OR DELETE` y `BEFORE TRUNCATE` que
  siempre lanzan excepción (mismo patrón que `bill_snapshots`, migración 0011). La API
  no ofrece mutaciones de auditoría; el dueño de la base/superusuario conserva control
  de DDL y triggers fuera de este límite de seguridad.
- `actor_user_id` en auditoría no tiene FK a `users`: un `ON DELETE SET NULL` intentaría
  actualizar una fila inmutable al borrar la cuenta y devolvería 500. El UUID se retiene
  como identificador seudónimo para trazabilidad; su plazo de retención y base legal
  necesitan revisión legal antes de producción.

## Roles y scopes mínimos (seed de la migración 0024, no constantes de la app)

| Rol | Scopes |
|---|---|
| `super_admin` | todos |
| `operations_admin` | `admin.ocr.read`, `admin.ocr.retry`, `admin.ocr.review`, `admin.users.read`, `admin.system.read` |
| `ocr_reviewer` | `admin.ocr.read`, `admin.ocr.review` |
| `support_readonly` | `admin.users.read` |
| `auditor` | `admin.audit.read`, `admin.roles.read` |

Separación de funciones: soporte (lectura de usuarios) no puede tocar OCR; OCR reviewer no
ve auditoría ni roles; auditor no puede asignar/revocar (`admin.roles.manage` solo lo tiene
`super_admin`). Esto es deliberado y se prueba en `test_each_role_has_exactly_its_own_scopes`.

Los 8 scopes existen como filas en `admin_scopes`; cada endpoint declara el suyo vía
`Depends(require_scope("admin.x.y"))` en `app/api/v1/admin.py` — nunca hay una ruta admin sin
scope explícito.

## Deny-by-default, en cada capa

1. **Sin asignación activa → sin scopes.** `effective_roles_and_scopes()` en
   `app/services/admin.py` solo cuenta `admin_role_assignments` con `revoked_at IS NULL` y
   (`expires_at IS NULL` o `expires_at > now()`), recalculado de la base en cada llamada.
   Nunca se cachea ni se deriva de claims del JWT.
2. **El JWT de sesión no lleva roles ni scopes.** El token de acceso (`app/services/auth.py`)
   solo prueba *quién* es el usuario (`sub`, `sid`); *qué puede hacer* se resuelve siempre
   contra la base en el momento de la petición. Un token de larga duración robado no sirve de
   nada si el rol fue revocado un segundo antes.
3. **`current_admin` nunca usa el modo piloto sin auth.** Las rutas domésticas permiten
   `AUTH_ENABLED=False` para el piloto local; `app/api/admin_deps.py::current_admin` ignora
   esa bandera y siempre exige un bearer válido — comprobado en
   `test_admin_endpoints_ignore_pilot_no_auth_mode`.
4. **No hay bypass `is_admin=true`.** No existe esa columna ni ese campo en ningún modelo;
   la única fuente de verdad es `admin_role_assignments` JOIN `admin_role_scopes`.
5. **No hay endpoint público para crear admins.** El primer `super_admin` se crea con
   `app/cli_bootstrap_admin.py`, ejecutado desde una shell de operador de confianza
   (`uv run python -m app.cli_bootstrap_admin <email>`), nunca por HTTP. Un bloqueo sobre
   el rol serializa invocaciones simultáneas; repetirlo para la misma asignación activa es
   idempotente, pero el CLI rechaza agregar otra persona cuando ya existe un
   `super_admin` activo. Altas posteriores pasan por `admin.roles.manage`.
6. **Último `super_admin` protegido.** La revocación cuenta dentro de una transacción
   bloqueando la fila compartida del rol para impedir la carrera entre dos revocaciones;
   el borrado de cuenta también bloquea y protege la última asignación activa. Las pruebas
   concurrentes y el flujo real de borrado cubren ambos casos.
7. **Navegador sin tokens legibles.** `frontend-web/admin` envía login/refresh/logout por un BFF
   de mismo origen con cookies `HttpOnly`, `SameSite=Strict`, `Secure` en producción y
   `__Host-` cuando es HTTPS. No usa `localStorage` para tokens; exige `Origin` en escrituras,
   lista blanca de rutas/métodos y errores fijos. Logout revoca el refresh en el backend
   y rota una cookie de época que invalida respuestas tardías. Los refresh concurrentes
   de una misma pestaña se agrupan en una sola llamada.

## Auditoría

Cada chequeo de scope (éxito o denegación) y cada asignación/revocación escribe una fila en
`admin_audit_events` con: `actor_user_id`, `action`, `resource` (método + ruta), `scope_used`,
`reason` (cuando aplica), `result`, `request_id` (correlacionado con los logs de
`app.observability`), y `metadata` mínima y saneada (solo ids de usuario/rol como string,
nunca objetos completos).

**Nunca se registra:** contraseñas, hashes, tokens (acceso/refresh), cookies, cuerpos de
petición/respuesta completos, documentos o imágenes, ni PII más allá del `user_id` ya
necesario para la trazabilidad. Verificado en
`test_audit_assign_and_revoke_recorded_without_sensitive_data` (busca literales de contraseña,
`password_hash`, `Bearer `, `refresh_token` en toda la tabla y falla si aparecen).

## Separación admin / doméstico

`app/api/admin_deps.py` y `app/api/auth_deps.py` son módulos independientes; ningún scope
administrativo afecta `authorize_home`, y ser propietario de una vivienda no otorga ningún
scope `admin.*`. Probado explícitamente en
`test_home_membership_does_not_grant_admin_and_vice_versa`.

## Qué NO se construyó todavía (fuera de alcance de ERD-ADM-RBAC)

- Administración completa de usuarios, viviendas o tarifas desde `frontend-web/admin` (pedido
  explícitamente fuera de alcance por el spec; es trabajo de Módulo 4).
- Gestión de roles *personalizados* más allá de los 5 fijos (se puede insertar un rol nuevo en
  `admin_roles`/`admin_role_scopes` por migración, pero no hay UI/API para crear roles al
  vuelo — intencional: los roles mínimos están fijados por spec, no son de autoservicio).
- E2E automatizado (Playwright) del flujo completo en `frontend-web/admin`; ver docs/qa/ERD-ADM-RBAC.md.
