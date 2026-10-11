# ERD-SHARE-01 — compartir vivienda

Fecha: 2026-10-10 · Rama `claude/elegant-ptolemy-sdr69r`. Diseño y reglas: `services/api/HOME_SHARING.md`.

## Resultados
| Criterio | Resultado | Evidencia |
|---|---|---|
| Invitar por correo, aceptar con el enlace, ver la vivienda como miembro | ✅ API y web real | `test_home_sharing.py` (17), `evidence/share-2026-10-10/web-share.py` (14/14) |
| Token hasheado, un solo uso, caduca, revocable | ✅ | `test_token_is_stored_hashed_and_single_use`, `test_expired_and_revoked_…` |
| Solo el correo invitado acepta; errores indistinguibles | ✅ | `test_only_the_invited_email_can_accept_…` |
| Límites contra spam de correo (pendientes por vivienda, diario por usuario, una activa por correo) | ✅ | `test_pending_and_daily_limits_…`, `test_0015_roundtrip_…` |
| Solo propietarios administran; ajenos ven 404; todo requiere sesión | ✅ | inventario `test_authorization.py` + `test_only_owners_manage_sharing_…` |
| Expulsar, salir, transferir (con contraseña) | ✅ | pruebas de API y recorrido web |
| El único propietario no puede salir; borrar cuenta ya tiene salida | ✅ | `test_sole_owner_deletion_conflict_is_resolved_…` |
| Token fuera de la URL y del DOM; sin sesión no se guarda | ✅ | `app/invitacion/page.test.tsx` |
| BFF: rutas y cuerpos estrictos, mensajes locales sin texto de la API | ✅ | `bff-sharing.test.ts` (41) |
| Panel: propietario vs. miembro, confirmaciones, errores | ✅ | `share-panel.test.tsx` (11); se verificó con mutaciones que las pruebas fallan si se rompe |
| Móvil (iOS/Android) | 🔶 construido, sin verificar en dispositivo | `ShareHomeScreen` y `AcceptInvitationSection` (ver `ERD-PROF-01.md`): typecheck, pruebas de la API móvil y de sus modelos y compilación Metro de Android; **sin simulador** |
| Correo real (Resend) y enlace de producción | ⛔ | requiere ERD-DEPLOY-01 (dominio verificado) |

## Hallazgos durante la implementación
- Una variable obligatoria nueva (`INVITATION_URL`) habría roto la validación de configuración de staging/producción;
  ahora se deriva de `PASSWORD_RESET_URL`.
- La prueba de migraciones fijaba la revisión cabeza; ya es dinámica (se había corregido en 0014, también aplica aquí).

## Límites conocidos
- El propietario ve los correos de los miembros; los miembros no ven a los demás (solo el propietario lista).
- Sin límite de tamaño de nombre de vivienda en el correo más allá de los 120 caracteres del modelo.
- No hay notificación al invitado cuando se revoca la invitación, ni al expulsado.
