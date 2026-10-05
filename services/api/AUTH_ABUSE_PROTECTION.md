# Protección de abuso de autenticación — primer tramo

## Alcance y diseño

Solo `POST /api/v1/auth/register`, `/login` y `/refresh`. Las respuestas de éxito,
rutas, Argon2, rotación/revocación de refresh y membresías no cambian. Logout,
`/me`, salud, tarifas y demás rutas no consumen este presupuesto. Auth desactivado
sigue devolviendo 404 en desarrollo, sin consultar el limitador.

El presupuesto es **por operación + peer de transporte**, no por email, cuenta,
refresh token, cookie o proceso. Cambiar email, token, cliente o worker no reinicia
el presupuesto del mismo peer. No hay consultas de existencia de cuentas para
decidir un 429. Los errores 429 son genéricos (`auth_rate_limited`), incluyen
`Retry-After` entero positivo y `Cache-Control: no-store`, sin identificadores.
No se expone el contador, la clave ni el límite en el cuerpo.

`auth_abuse_buckets` guarda únicamente HMAC-SHA256 hexadecimal de 64 caracteres,
inicio de ventana UTC y contador. HMAC usa `AUTH_SIGNING_KEY`, validada al activar
auth tanto en desarrollo como producción, con dominio separado
`energy-rd:auth-abuse:v1:<operación>:<peer>`. No se almacenan IPs/emails crudos en
keys; no se necesitan secretos nuevos. La clave debe ser CSPRNG y compartida por
todas las réplicas. Es seudonimización, no anonimización: proteger también DB,
backups y secreto. No activar SQL echo ni loggear cuerpos/headers/env.

Una sesión/transacción separada de la autenticación hace INSERT ON CONFLICT DO
NOTHING, bloquea la fila con FOR UPDATE, lee `clock_timestamp()` **después** del
bloqueo y confirma el intento antes de consultar/verificar credenciales. No usa
memoria local. Un fallo de contraseña, rollback de registro, worker nuevo o
reinicio no devuelve el intento. El contador se satura en el límite; un rechazo
no aumenta el contador ni extiende la ventana.

Ventana fija anclada al primer intento (no ventana deslizante): se admiten N
intentos durante W segundos; `now >= inicio + W` reinicia a un intento.
`Retry-After = max(1, ceil(inicio + W - now))`. El reloj lo determina PostgreSQL,
no el cliente ni el reloj de cada worker. Cuerpos inválidos que alcanzan la
resolución de dependencias también consumen presupuesto; JSON mal formado puede
ser rechazado por FastAPI antes de las dependencias, así que el borde debe limitar
bytes/peticiones antes de parsear. No se mantiene bloqueo mientras Argon2 trabaja.

ERD-AUTH-05 añade los presupuestos `forgot` y `reset` (`/auth/password/forgot` y `/reset`) con
el mismo mecanismo; el cooldown por cuenta de recuperación vive en `password_reset_tokens`, no aquí
(ver `PASSWORD_RECOVERY.md`).

## Variables y comportamiento fail-closed

| Variable | Default | Rango |
|---|---:|---:|
| `AUTH_REGISTER_LIMIT` | 10 | 1–10000 |
| `AUTH_LOGIN_LIMIT` | 20 | 1–10000 |
| `AUTH_REFRESH_LIMIT` | 60 | 1–10000 |
| `AUTH_FORGOT_LIMIT` (ERD-AUTH-05) | 5 | 1–10000 |
| `AUTH_RESET_LIMIT` (ERD-AUTH-05) | 10 | 1–10000 |
| `AUTH_ABUSE_WINDOW_SECONDS` | 60 | 1–86400 |

No existe switch para desactivar límites cuando auth está activo. Config inválida
falla al iniciar; auth fuera de desarrollo continúa siendo obligatorio. Missing
schema, fallo DB/pool, timeout o error SQL devuelve 503 genérico
`auth_unavailable`, sin ejecutar auth, sin bypass en memoria, sin traza SQL ni
parámetros. `hide_parameters=True` continúa en el engine de aplicación.
Timeout transaccional: lock 2 s, statement 3 s; el pool conserva sus límites
configurables existentes. No se modifica estado de una transacción auth ajena.
Una caída DB naturalmente también afecta las rutas que ya dependían de DB, pero
el limitador no se añade a salud/tarifas ni otras rutas.

## Proxy y despliegue

El código no interpreta `X-Forwarded-For` ni `Forwarded`. El entrypoint y el
comando local documentado usan **`--no-proxy-headers`**: Uvicorn de otro modo puede
confiar implícitamente en conexiones loopback. Cualquier runner alternativo debe
mantener esa opción para obtener peer de transporte por defecto.

Detrás de un proxy, este default agrega a todos sus clientes en el presupuesto
del proxy. No desplegar detrás de BFF/proxy sin decidir explícitamente esa
agregación y calibrar los límites. Si operaciones decide usar IP de usuario:

1. API accesible solo desde proxies controlados (ACL/firewall).
2. Proxy descarta headers de forwarding entrantes y escribe su propia cadena.
3. Reemplazar explícitamente la opción de arranque por `--proxy-headers` y
   `--forwarded-allow-ips=<IPs/CIDRs exactos de proxies>`; nunca `*`.
4. Verificar spoofing directo y cadenas multi-hop en ese despliegue. En este modo
   `request.client` ya es identidad traducida por Uvicorn, no peer TCP puro.

No se configura ningún proxy, cuenta o servicio externo en este tramo.
HTTPS, límites globales en borde, tamaño de body/headers y concurrencia de Argon2
siguen siendo requisitos operativos. CORS no sustituye controles de acceso.

Ejecutar `alembic upgrade head` como paso único de release autorizado antes de
arrancar replicas: `0010` depende de `0009`, añade solo esta tabla y su constraint;
no backfill ni cambios de cuentas/piloto. Todas las réplicas deben compartir DB,
secreto, límites y ventana. Downgrade autorizado a `0009` elimina solo los
presupuestos, pero **reinicia protección**: detener auth antes del downgrade; no
servir el código nuevo sin tabla. No se ejecutó sobre producción ni piloto.

## Riesgos y trabajo pendiente

- Primer tramo per-peer, no defensa completa: botnets, rotación de IP/IPv6 y
  credential stuffing distribuido requieren capas adicionales.
- NAT/proxy/BFF compartidos pueden bloquear usuarios legítimos; no se hace lockout
  por cuenta para evitar que un atacante bloquee un email objetivo.
- Una ventana fija permite ráfagas alrededor de su frontera; no se promete límite
  deslizante. El cambio de secreto reinicia keys y JWTs. Rotación/config debe ser
  coordinada, nunca distinta por réplica.
- Tabla crece por peer/operación. No se añade job ni borrado automático. Diseñar
  retención y limpieza operativa antes de exposición pública: borrar solo ventanas
  vencidas según reloj DB y la mayor ventana de todas las réplicas, coordinando
  locks; jamás truncar presupuestos activos.
- El contrato previo de registro duplicado (409 vs éxito 201) **sigue permitiendo
  inferir existencia** por el resultado de registro. Este tramo no lo empeora ni
  revela existencia en 429; no promete anti-enumeración integral ni timing
  indistinguible. Resolverlo requiere diseño explícito de registro/verificación,
  sin inventar envío de email o recovery.
- No CAPTCHA, MFA, recovery/email, proveedor pago, bloqueo de cuentas ni entrega
  de correo ficticia. La tarea integral ERD-AUTH-01 sigue abierta.

## Verificación y TDD

Comando usado, sin servidores persistentes ni puertos API:

```sh
.venv/bin/python tests/run_isolated.py -q --tb=short
```

Runner apunta únicamente a `energy_rd_auth_test`; sus fixtures recrean schema y
permiten upgrade/downgrade sobre sus propios datos. Nunca ejecutar dos suites
contra esa misma DB a la vez. App engine permanece en la DB sentinel no conectada;
health y get_db se sustituyen por fixture.

Baseline real: **338 passed**. Resultado final: **364 passed, 0 skipped**, 1 warning
previo de Starlette/httpx, en 63.14 s. `scripts/check_architecture.py` devuelve
`Architecture boundaries passed`; compileall y `git diff --check -- services/api`
terminan sin errores. RED/GREEN vertical observado antes de añadir cada
ruta protegida: login 401→429 (dos intentos), registro 201→429 (un intento), refresh
200→429 (un intento). RED/GREEN adicional: entrypoint carecía de
`--no-proxy-headers`, después pasa. La primera ejecución login tuvo un error de
fixture Pydantic; se corrigió el fixture y se volvió a observar el RED esperado
antes de implementación. Las otras pruebas son verificación de aceptación de
esos tramos, no se presentan como RED individuales.

`tests/test_auth_abuse.py` verifica ventanas/retry-after deterministas, saturación,
16 peticiones concurrentes sobre 3 engines independientes (4 admitidas), dos apps
TestClient sin bypass, spoofing de headers, payload inválido, claves/logs redacted,
503 fail-closed, rutas ajenas y autorización, configuración y roundtrip 0010.
La suite existente verifica IDOR/membresías, concurrencia refresh/logout y paridad
modelo/migración. Al añadir 0010 se detectó el assertion legado de head 0009 y se
actualizó a 0010, conservando la prueba de rollback sin pérdida.

Existe un warning previo de Starlette/httpx TestClient; no se instalaron paquetes
ni se modificaron lockfiles.
