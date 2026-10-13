# Compartir vivienda (ERD-SHARE-01)

Invitar, aceptar, revocar, expulsar, salir y transferir la propiedad. Migración `0015` (`home_invitations`).
Roles: `owner` y `member` (los miembros ven y usan la vivienda; solo el propietario la administra). Sin cuentas
(`AUTH_ENABLED=false`) estas rutas no existen (404).

| Ruta | Quién | Resultado |
|---|---|---|
| `GET /homes/{id}/members` | propietario | `[{user_id, email, role, joined_at}]` |
| `POST /homes/{id}/invitations` `{email}` | propietario | 201 `{id,email,created_at,expires_at}`; envía el correo después de responder |
| `GET /homes/{id}/invitations` | propietario | solo pendientes (no aceptadas, revocadas ni vencidas) |
| `DELETE /homes/{id}/invitations/{inv}` | propietario | 204; el token deja de servir |
| `POST /invitations/accept` `{token}` | cualquier sesión | 200 `HomeOut`; solo si el correo de la cuenta es el invitado |
| `DELETE /homes/{id}/members/{user}` | propietario | 204; no a sí mismo ni a otro propietario |
| `DELETE /homes/{id}/members/me` | cualquier miembro | 204; el único propietario recibe 409 |
| `POST /homes/{id}/transfer-ownership` `{user_id,password}` | propietario | 204; el destino pasa a propietario y el solicitante a miembro, en una transacción |

Respuestas con `Cache-Control: no-store`. No propietarios: 403 en rutas de propietario; no miembros: 404 (igual que una
vivienda inexistente). El inventario de rutas privadas (`tests/test_authorization.py`) cubre las nuevas.

## Seguridad
- **Token**: 32 bytes aleatorios (43 caracteres URL-safe), solo se guarda `sha256`; un solo uso; caduca a los
  `INVITATION_TTL_DAYS` (7). Viaja en el **fragmento** `#token=…` del enlace (no llega a logs ni a `Referer`); la página
  `/invitacion` lo borra de la barra antes de cualquier petición y no lo guarda en el navegador.
- **Aceptar** exige sesión y que el correo de la cuenta sea el de la invitación. Token desconocido, caducado, usado,
  revocado o de otro correo dan el **mismo** `400 invitation_invalid` (no es un oráculo). Un intento ajeno no quema el token.
- **Transferir** reautentica con la contraseña (comparte el presupuesto anti-fuerza-bruta de `/login`).
- **Abuso de correo**: máximo `INVITATION_MAX_PENDING_PER_HOME` (10) pendientes por vivienda y `INVITATION_DAILY_LIMIT_PER_USER`
  (20) invitaciones por usuario cada 24 h; una invitación activa por (vivienda, correo) (índice único parcial).
- El correo no incluye el correo de quien invita; el nombre de la vivienda va escapado en HTML.
- La auditoría (`audit_events`) registra altas/bajas/cambios de rol sin correos ni tokens.
- **Concurrencia**: aceptar bloquea la fila de la vivienda (misma regla que borrar cuenta, transferir y expulsar).

## Borrado de cuenta
El conflicto `409 ownership_transfer_required` de `DELETE /auth/me` ahora tiene salida: transferir la propiedad o
expulsar a los demás miembros. Las invitaciones se borran con su vivienda; si el invitador borra su cuenta, la invitación
sigue válida (`invited_by` pasa a NULL).

## Configuración
`INVITATION_URL` (si está vacía: el origen de `PASSWORD_RESET_URL` + `/invitacion`; en despliegues debe ser HTTPS y sin `?`/`#`),
`INVITATION_TTL_DAYS`, `INVITATION_MAX_PENDING_PER_HOME`, `INVITATION_DAILY_LIMIT_PER_USER`.

## Web (hecho) y móvil (pendiente)
Web: BFF (rutas declaradas y mensajes locales, `apps/web/src/lib/auth/bff.ts`), cliente `lib/auth/sharing.ts`, panel
«Compartir» en «Mis viviendas», página pública `/invitacion`. Móvil: pantalla «Compartir vivienda» (Perfil) y «¿Le invitaron?» (Elegir vivienda, se pega el enlace del correo),
construidas con ERD-PROF-01 pero **sin verificar en dispositivo**.
