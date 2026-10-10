# ERD-AUTH-05 — recuperación de contraseña WEB

## Resultado

- BFF: POST exactos `/auth/password/forgot` y `/auth/password/reset`, cuerpos estrictos, sin Authorization upstream, sin consulta, Origin/Sec-Fetch-Site/JSON obligatorios. Forgot exige 202 `{status:"accepted"}` y reset exige 204 sin cuerpo. Respuestas inesperadas: 502 local.
- Errores: mensajes españoles por estado/código/nombre de campo, nunca `detail/msg` upstream; `reset_token_invalid` allowlisted. Retry-After solo delta-seconds 1–86400 en 429.
- `/olvide-contrasena`: correo normalizado por el cliente compartido, confirmación idéntica para cualquier cuenta, 429 separado, bloqueo síncrono de doble envío.
- `/restablecer-contrasena`: primer layout effect lee el fragmento y elimina la URL con history.replaceState antes de efectos pasivos; token solo en estado del componente, no storage/DOM/query. StrictMode no vuelve a consumir el fragmento. Contraseña 12–128 sin recortar + confirmación; enlace inválido/caducado con solicitud de otro; 204 → navegación completa `/login?restablecida=1` para descartar toda la memoria de la página.
- Reset confirmado borra cookies access/logout y rota epoch de forma síncrona; no añade un segundo write upstream después de consumir el token. La API es quien revoca todas las sesiones de la cuenta.
- `resetPassword` invalida las solicitudes de cuenta y avisa a otras pestañas mediante la misma clave de cambio de cuenta ya usada por SessionProvider (solo UUID, nunca token/contraseña).
- Ambas páginas públicas. Reset tiene encabezado Referrer-Policy no-referrer y Cache-Control no-store desde middleware, más metadata no-referrer/noindex. No se añaden scripts de terceros.
- Piloto: páginas no disponibles y enlace oculto en login.

## Decisiones

- Sin handshake epoch para estas dos rutas públicas: no crean sesiones ni emiten cookies de sesión; no necesitan el 428 de login/register. Se mantienen las mismas protecciones Origin/CSRF/JSON de todos los POST auth.
- El reset rota epoch incluso sin sesión previa; una respuesta tardía de login anterior quedará ligada a una época vieja y el BFF existente la rechazará.
- Se reutilizan forgotPassword/resetPassword de @energyrd/api-client con un fetch exclusivo de recuperación a dos rutas BFF. No se modifican packages ni se instalan dependencias.
- Navegación completa, no Next router.replace: reinicia también SessionProvider, caché y memoria local al volver a login.

## Pruebas y gates (Node 24)

- Base: 37 archivos pasados + 1 omitido; 374 pruebas pasadas + 5 omitidas (379).
- Final: 43 archivos pasados + 1 omitido; 460 pruebas pasadas + 5 omitidas (465). Incremento neto: 86 pruebas.
- vitest run: exit 0.
- tsc --noEmit -p .: exit 0.
- npm run lint: exit 0.
- Evidencia RED BFF antes de implementación: 28 fallos y 4 pruebas de protecciones existentes pasadas (32). RED UI/cliente antes de implementación: 3 módulos ausentes y 4 aserciones fallidas (middleware, enlace, confirmación). Los nuevos tests se escribieron primero por lotes, no con un ciclo vertical por cada aserción; el RED inicial de los módulos nuevos fue de resolución de imports, no de comportamiento. Esta limitación debe distinguirse de TDD estricto por comportamiento.
- Revisión posterior detectó un segundo write de logout innecesario tras reset, que podía exceder el timeout después de consumir el token. Regresión RED: esperaba 1 llamada upstream, recibió 2. Se eliminó ese write y sus dos pruebas especulativas; resultado final verde.
- Correcciones de harness: token fixture inicialmente de 42 caracteres corregido a 43; búsqueda del botón pendiente corregida para su etiqueta «Restableciendo contraseña…».

## Archivos

Modificados:
- src/lib/auth/bff.ts
- src/lib/auth/client.ts
- src/lib/session.tsx
- src/middleware.ts
- src/components/account-form.tsx
- src/components/account-form.test.tsx
- src/app/login/page.tsx

Creados:
- src/lib/auth/bff-password-recovery.test.ts
- src/lib/auth/recovery.ts
- src/lib/auth/recovery.test.ts
- src/lib/navigation.ts
- src/middleware-recovery.test.ts
- src/app/login/page.test.tsx
- src/app/olvide-contrasena/page.tsx
- src/app/olvide-contrasena/page.test.tsx
- src/app/restablecer-contrasena/page.tsx
- src/app/restablecer-contrasena/page.test.tsx
- src/app/restablecer-contrasena/layout.tsx
- PASSWORD_RECOVERY.md

## Límites / pendientes

- Sin next build, servidores, DB, live HTTP ni QA visual/navegador por las restricciones de la tarea. El coordinador debe ejecutar integración real, confirmar revocación server-side y revisar ambas pantallas visualmente.
- Las 5 pruebas live omitidas ya existían; no se cuenta integración como verificada.
- No hay `.agents/skills/interface-review` dentro de la copia proporcionada; se revisaron controles/labels/estados/UI kit desde fuente y tests, sin certificar layout visual.
- Los symlinks node_modules resuelven los paquetes compartidos del árbol canónico; se comprobó que ya contienen los dos métodos y contratos de recuperación. No se escribieron symlinks ni packages ni node_modules.
- Operación aislada en apps/web; sin instalaciones, commits, pushes, cambios de piloto o DB.
