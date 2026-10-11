# ERD-PROF-01 — perfil y ajustes de la cuenta

Fecha: 2026-10-10 · Rama `claude/elegant-ptolemy-sdr69r`.

## Alcance (y lo que NO se construyó, a propósito)
| Pedido | Estado |
|---|---|
| Cambio de contraseña | ✅ API (ERD-AUTH-06), web y móvil. Cierra las demás sesiones; la actual recibe tokens nuevos |
| Preferencias de notificación | ✅ API + web + móvil. **Solo se guardan** (correo y teléfono, por defecto activadas): los envíos llegan con ERD-ALERT-02 y la pantalla lo dice |
| Seguridad (sesiones) | ✅ listar, cerrar una, cerrar las demás (API, web, móvil) |
| Acceso a mis datos (ARCO) | ✅ «Descargar mis datos» en web (JSON). Móvil: no (guardar un archivo requiere permisos/módulos nativos); se hace desde la web |
| Documentos | ⛔ no hay archivos que listar hasta ERD-STORE-01 (la tabla `documents` ya existe) |
| Idioma y unidades | ❌ **No se hicieron.** Solo existe español y las unidades son kWh y RD$ fijas; un selector de una sola opción sería decorativo. Se indica en la pantalla del móvil |
| Integraciones | ❌ No existen integraciones (IoT/solar son módulos posteriores) |
| Cambiar el correo | ⛔ no existe (necesita verificación del correo nuevo); se declara como hueco ARCO en `docs/legal/` |

## API (migración 0016)
`GET/PUT /auth/me/preferences` (dos booleanos estrictos; sin fila = activadas), `GET /auth/sessions` (marca la actual; oculta
cerradas y vencidas), `DELETE /auth/sessions/{id}`, `POST /auth/sessions/revoke-others`. Solo sesiones de la propia cuenta
(ajena o ya cerrada = 404 indistinguible). 14 pruebas (`test_account_settings.py`); el inventario de rutas autenticadas se actualizó.

## Web (verificado en navegador real contra la API real: 13/13)
`/account` ahora incluye Cambiar contraseña, Notificaciones, Sesiones activas y Descargar mis datos
(`components/account-settings.tsx`, 14 pruebas). El BFF permite estas rutas con cuerpos estrictos y **renueva las cookies de
sesión** tras cambiar la contraseña (33 pruebas en `bff-account-settings.test.ts`). Se verificó con un recorrido real
(`evidence/profile-2026-10-10/web-profile.py`): dos sesiones, cerrar la otra al instante, contraseña actual incorrecta (no
cambia nada), cambio correcto (esta sesión sigue, la otra se cierra, la vieja ya no entra, la nueva sí), preferencias que
persisten al recargar y descarga del JSON sin secretos. Se comprobó con una mutación que la prueba del doble envío falla si
se quita el guardián.

## Móvil (SIN verificar en dispositivo)
`api/account.ts` (33 pruebas con transporte falso: validación local, 204, errores locales, tiempo agotado, puntos de código),
`authSession.replaceTokens` (3 pruebas: adopta el par nuevo con garantía de época y nunca resucita una sesión cerrada),
modelos puros (13 pruebas), pantallas `AccountSettingsScreen`, `ShareHomeScreen` y `AcceptInvitationSection`, rutas y botones
en Perfil. Verificado: **typecheck, 422 pruebas y compilación Metro/Hermes de Android**. **No** se ejecutó en simulador ni
dispositivo: faltan Maestro (ERD-E2E-MAESTRO-AUTH) y la revisión de accesibilidad (ERD-A11Y-NATIVE). Si el cambio de contraseña
tiene éxito en la API pero falla el guardado seguro del par nuevo, la app cierra la sesión local con un mensaje claro (la API ya
cerró todas).

## Hallazgos
- `Button` móvil no aceptaba `accessibilityLabel`; se añadió (los botones por fila, como «Sacar», necesitan un nombre accesible).
- El mensaje de conflicto de propiedad decía «función aún no disponible»; ya existe la transferencia (SHARE-01) y se actualizó
  en API, BFF y móvil.
