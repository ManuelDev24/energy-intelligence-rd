# Borrado de cuenta (ERD-AUTH-03)

`DELETE /api/v1/auth/me` — requiere access token **y** reautenticación con contraseña.

```http
DELETE /api/v1/auth/me
Authorization: Bearer <access>
Content-Type: application/json

{"password": "<contraseña actual>"}
```

| Resultado | Estado | `code` |
|---|---|---|
| Cuenta borrada | `204` sin cuerpo, `Cache-Control: no-store` | — |
| Sin token / token inválido | `401` + `WWW-Authenticate: Bearer` | `http_401` |
| Contraseña incorrecta | `403`, mismo texto genérico que un login fallido | `reauthentication_failed` |
| Cuerpo inválido (falta `password`, campos extra, 12–128 fuera de rango, UTF-8 inválido) | `422` sin eco de valores | `validation_error` |
| Propietario único de una vivienda con otros miembros | `409`, **nada se borra** | `ownership_transfer_required` |
| Demasiados intentos | `429` + `Retry-After` | `auth_rate_limited` |
| Modo piloto (`AUTH_ENABLED=false`) | `404` | `http_404` |

Se usa `403` (no `401`) para la contraseña errónea: el token sí es válido y un `401` haría que
los clientes intenten refrescar sesión o cerrarla. Cada intento (válido o no) consume el
presupuesto `login` de `AUTH_ABUSE_PROTECTION.md` (mismo bucket por peer que `/auth/login`), así
la ruta no sirve para adivinar contraseñas más rápido que el login.

## Regla por membresía

Evaluada con las viviendas bloqueadas (`SELECT … FOR UPDATE`, mismo bloqueo que usan las escrituras
autorizadas, en orden de id para evitar interbloqueos), dentro de **una sola transacción**:

1. **Único miembro** de la vivienda (sea owner o member) → se borra la vivienda y todos sus datos:
   facturas, detalle (`bill_items`), originales (`bill_snapshots`), alertas, ajustes de alerta,
   equipos, lecturas, meta, contrato/onboarding y membresías (todo por `ON DELETE CASCADE`).
2. **Owner único** y existen otros miembros → `409 ownership_transfer_required`. Se aborta todo,
   incluidas las viviendas que sí se habrían borrado; no se revoca ninguna sesión. Hoy no existe
   endpoint de transferencia: el owner debe resolverlo fuera de banda (pendiente de producto).
3. **Miembro** (o co-owner, si queda otro owner) → solo se elimina su fila en `home_members`.

Después: se revocan todas las sesiones (`revoked_at`) y se borra la fila `users`; sesiones y
refresh tokens caen en cascada. El access token y el refresh token devuelven `401` a partir de ese
momento (el usuario ya no existe). El correo queda libre para registrarse de nuevo como cuenta
nueva sin datos previos.

Cualquier error a mitad (p. ej. al seudonimizar auditoría) revierte la transacción completa
(prueba `test_failure_mid_erasure_rolls_back_everything`).

## Originales inmutables (`bill_snapshots`)

No se añadió ninguna vía nueva de escritura. La migración 0011 ya define el trigger
`BEFORE UPDATE OR DELETE` que solo permite `DELETE` de un original cuando **su factura ya no
existe** (borrado en cascada desde `bills`/`homes`). El borrado de cuenta elimina las viviendas
con `DELETE FROM homes`, y la cascada `homes → bills → bill_snapshots` pasa por esa regla.

Se descartó un interruptor del tipo `SET LOCAL energyrd.erasure = 'on'`: cualquier sesión SQL
con acceso a la tabla puede fijar una GUC personalizada, por lo que abriría el borrado de
originales de facturas **vivas**, que hoy es imposible. Siguen bloqueados y con regresión:

- `UPDATE bill_snapshots …` y `DELETE` de originales con factura existente (`23514`);
- `TRUNCATE bill_snapshots` (trigger de sentencia de 0011);
- fijar `energyrd.erasure` no habilita nada (`test_snapshot_immutability_survives_erasure_path`).

## Auditoría (`audit_events`)

`audit_events` nunca guardó la identidad del usuario: `actor` es una etiqueta de contexto
(`pilot`) y no hay email/user_id en las filas. Lo que sí contienen son instantáneas
`before`/`after` de la vivienda (nombre, dirección, contrato…), que son datos personales.

- Viviendas **borradas**: las filas se **conservan** (entidad, operación, ids, fechas) pero se
  seudonimizan: `actor='deleted-user'`, `before=NULL`, `after=NULL`. Se añade un evento
  `entity='home', operation='erase'` con el mismo actor.
- Viviendas **compartidas** que el usuario abandona: la historia del hogar no se reescribe (es
  de los demás miembros); se añade `entity='home_member', operation='delete',
  actor='deleted-user'` sin identificar al usuario.

## Fuera de alcance (riesgos abiertos)

- **Copias de seguridad / réplicas / dumps**: el borrado no alcanza backups existentes; caducan
  según su propia retención (ver `docs/legal/PRIVACY_AND_RETENTION_DRAFT.md`). Una restauración
  debe re-aplicar los borrados posteriores al backup (no automatizado).
- **Logs** de la API y del proxy: contienen ruta (con ids de vivienda), estado y `request_id`; no
  se purgan al borrar la cuenta.
- **Buckets de abuso** (`auth_abuse_buckets`): HMAC del peer, sin email; no se vinculan a la cuenta
  y no se borran aquí.
- **DDL / superusuario**: `ALTER TABLE … DISABLE TRIGGER`, `session_replication_role=replica` o un
  rol propietario pueden saltarse la inmutabilidad; se controla con privilegios de BD, no con código.
- **Transferencia de propiedad**: no existe endpoint; el `409` es la única salida.
- **Clientes**: el BFF web y la app móvil aún no exponen esta acción (ver informe de ERD-AUTH-03).
