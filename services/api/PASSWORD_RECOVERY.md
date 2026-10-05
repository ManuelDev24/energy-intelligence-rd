# Recuperación de contraseña (ERD-AUTH-05)

Backend de "olvidé mi contraseña" con tokens de un solo uso, sin enumeración de cuentas y con un
backend de correo intercambiable (`console` en desarrollo, `resend` en staging/producción).
Solo backend + contratos + `@energyrd/api-client`; las pantallas web/móvil están pendientes.

## Flujo

```text
1. Cliente  POST /api/v1/auth/password/forgot {"email": "..."}
            → 202 {"status": "accepted"}  (siempre igual, exista o no la cuenta)
2. API      si la cuenta existe, está activa y no superó el cooldown:
            token = 32 bytes CSPRNG (43 car. URL-safe); guarda SOLO sha256(token); caduca en 30 min;
            invalida los tokens anteriores sin usar de esa cuenta;
            tras responder, envía el correo con  PASSWORD_RESET_URL#token=<token>
3. Web      la página de PASSWORD_RESET_URL lee el token del FRAGMENTO (location.hash),
            lo borra de la barra (history.replaceState) y pide la nueva contraseña
4. Cliente  POST /api/v1/auth/password/reset {"token": "...", "new_password": "..."}
            → 204: nuevo hash Argon2id, token marcado usado, TODAS las sesiones revocadas
            → 400 reset_token_invalid: desconocido, caducado, usado o cuenta inactiva (mismo cuerpo)
```

| Ruta | Éxito | Errores |
|---|---|---|
| `POST /auth/password/forgot` `{email}` | `202 {"status":"accepted"}`, `Cache-Control: no-store` | `422` email inválido/campos extra; `429 auth_rate_limited`; `503 auth_unavailable`; `404` en modo piloto |
| `POST /auth/password/reset` `{token,new_password}` | `204` sin cuerpo, `no-store` | `400 reset_token_invalid` (`no-store`); `422` token mal formado (≠ 43 car. URL-safe), contraseña fuera de 12–128 o UTF-8 inválido, campos extra — sin eco de valores; `429`; `503`; `404` piloto |

Ambas rutas son públicas (sin `Authorization`) y están en la lista explícita
`PUBLIC_AUTH_ROUTES` de `tests/test_authorization.py`. Esquemas estrictos (`extra="forbid"`).
La política de contraseña es la del registro (12–128, valor exacto, UTF-8 estricto → 422 redactado).

Cliente compartido: `forgotPassword(email)` exige exactamente `202` + cuerpo `accepted`;
`resetPassword(token, newPassword)` exige `204` sin cuerpo. Cualquier otra respuesta 2xx es
`ContractError`. Ambos validan localmente antes de enviar (el contrato generado no impone formato
de email; el cliente hace una validación básica y el servidor la definitiva).

## Sesiones y access tokens tras el reset

En la misma transacción se marca `revoked_at` en **todas** las `auth_sessions` del usuario. Los
access tokens llevan el claim `sid` y cada petición protegida comprueba la sesión en PostgreSQL,
así que **los access tokens anteriores fallan con 401 inmediatamente** (no hay ventana residual de
TTL). Los refresh tokens anteriores también devuelven 401. El reset no inicia sesión: el cliente
debe pedir login con la nueva contraseña.

## Correo (`app/services/email.py`, sin FastAPI)

- Interfaz `EmailSender.send(EmailMessage) -> bool`; **nunca lanza**. `deliver()` es el punto de
  entrada de la tarea en segundo plano y además atrapa cualquier excepción.
- `console` (solo `ENVIRONMENT=development`): no registra token, enlace ni destinatario; guarda el
  mensaje en `DEV_OUTBOX` (memoria, máx. 100, lo usan los tests) y, si `EMAIL_DEV_OUTBOX` tiene una
  ruta, agrega una línea JSON para pruebas manuales locales. **Ese archivo contiene enlaces
  válidos**: no compartirlo ni versionarlo.
- `resend`: `POST https://api.resend.com/emails` con `Authorization: Bearer RESEND_API_KEY`,
  `from=EMAIL_FROM`, `httpx` con timeout de 10 s. Fallo de red, timeout o estado ≠ 2xx se registra
  como `email_delivery_failed` con solo el motivo (`timeout`, `transport_error`, `http_<código>`):
  sin clave, destinatario, token ni cuerpo de respuesta. Nunca cambia el 202. No hay reintentos ni
  cola persistente: un fallo transitorio pierde ese correo y el usuario debe pedir otro enlace.
- Texto en español, versión texto plano + HTML simple; sin imágenes, píxeles de seguimiento, scripts
  ni enlaces de tracking. `httpx` pasó de dependencia de desarrollo a dependencia de ejecución
  (`uv.lock` actualizado offline, misma versión 0.28.1).

## Configuración

| Variable | Default | Regla |
|---|---|---|
| `EMAIL_BACKEND` | `console` | `console` \| `resend`; fuera de `development` debe ser `resend` |
| `RESEND_API_KEY` | vacío (`repr=False`) | obligatoria fuera de desarrollo; nunca en logs/errores |
| `EMAIL_FROM` | vacío | obligatoria fuera de desarrollo (dominio verificado en Resend) |
| `PASSWORD_RESET_URL` | `http://localhost:3000/restablecer-contrasena` | sin `?` ni `#` (el token se añade como `#token=`); HTTPS con host fuera de desarrollo |
| `EMAIL_DEV_OUTBOX` | vacío | solo desarrollo |
| `PASSWORD_RESET_TTL_MINUTES` | 30 | 5–60 |
| `AUTH_FORGOT_LIMIT` | 5 | 1–10000 por peer y `AUTH_ABUSE_WINDOW_SECONDS` |
| `AUTH_RESET_LIMIT` | 10 | 1–10000 por peer y `AUTH_ABUSE_WINDOW_SECONDS` |
| `PASSWORD_RESET_ACCOUNT_LIMIT` | 3 | 1–20 correos por cuenta y ventana |
| `PASSWORD_RESET_ACCOUNT_WINDOW_SECONDS` | 3600 | 60–86400 |

El validador rechaza al arrancar cualquier combinación insegura (probado en `tests/test_config.py`).

## Modelo de amenazas

| Amenaza | Mitigación | Residual |
|---|---|---|
| Enumeración de cuentas | 202 y cuerpo idénticos; el correo se envía en `BackgroundTasks` **después** de la respuesta; para correos desconocidos también se genera y hashea un token y se ejecuta la purga | La rama de cuenta existente hace unas consultas más (lock, conteo, insert): diferencia de pocos ms, no garantía formal de tiempo indistinguible. El **registro** sigue revelando existencia con 409 (ver `AUTH_ABUSE_PROTECTION.md`) |
| Robo del token en tránsito/logs | Solo se guarda SHA-256; token en el fragmento del enlace (no viaja a servidores, proxies ni `Referer`) y en el cuerpo JSON del reset (nunca en la URL de la API); logs de petición registran solo ruta; validación 422 sin `input`/`ctx`; `hide_parameters=True` en el engine | Quien controle el buzón del usuario controla la cuenta (igual que cualquier recuperación por email). La página web debe limpiar el fragmento y no cargar analítica de terceros |
| Reutilización / replay | `used_at` + `SELECT … FOR UPDATE` sobre usuario y token; dos resets concurrentes con el mismo token → uno 204, otro 400 (probado); nueva solicitud invalida tokens previos; un reset invalida el resto de tokens pendientes | — |
| Fuerza bruta del token | 256 bits de entropía; presupuesto `reset` por peer | — |
| Bombardeo de correos a una víctima | Cooldown por cuenta (3/h por defecto) que no altera la respuesta + presupuesto `forgot` por peer | Atacante distribuido puede igualmente provocar hasta N correos/h por cuenta |
| Secuestro de sesión previo | Reset revoca todas las sesiones y access tokens | Peticiones ya autorizadas en curso terminan |
| Fallo/lentitud del proveedor | Envío tras la respuesta, timeout 10 s, sin excepción hacia la ruta | Sin reintento: correo perdido |

Fuera de alcance: entregabilidad y DNS del dominio emisor (SPF, DKIM, DMARC, verificación del
dominio en Resend) — **lo configura el propietario en Resend**; plantillas de marca; reintentos/cola;
verificación de email en el registro; MFA; CAPTCHA; notificación "tu contraseña cambió".

## Datos y retención

Migración `0013` (`down_revision=0012`): tabla `password_reset_tokens(id, user_id FK users ON
DELETE CASCADE, token_hash UNIQUE, created_at, expires_at, used_at, requested_peer_hash)` con índices
en `user_id` y `expires_at`. `requested_peer_hash` es HMAC-SHA256 (clave `AUTH_SIGNING_KEY`, dominio
`password-reset-request`) del peer, no la IP. Los tokens sustituidos se marcan con `used_at`.
Cada solicitud de recuperación purga las filas cuyo `expires_at` venció hace más de 1 día (≥ ventana
máxima de cooldown). El borrado de cuenta elimina sus filas en cascada. Downgrade a `0012` elimina la
tabla (invalida enlaces pendientes, no toca usuarios/sesiones).

Despliegue: `alembic upgrade head` como paso de release; configurar las variables de correo antes de
arrancar (el validador impide arrancar staging/producción sin ellas).

## Verificación

`tests/test_password_recovery.py` (respuesta idéntica, trabajo comparable, fallo de correo, tokens
sustituidos, cooldown, presupuestos, revocación total, 400 único, payload estricto/UTF-8, concurrencia,
modo piloto, logs sin secretos, cascada, purga, migración 0013), `tests/test_email.py` (Resend con
`httpx.MockTransport`, sin red), `tests/test_config.py`, `tests/test_authorization.py`.
