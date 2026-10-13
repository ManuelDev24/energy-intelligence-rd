# Riesgos de seguridad aceptados (C-23)

Registro de los hallazgos de baja severidad de la auditoría (`docs/audit/AUDIT-03-SEGURIDAD-20-LEYES.md`) que **no se corrigen
en código** y por qué. Cada uno tiene qué lo compensa y qué hecho obliga a revisarlo. Decisiones del responsable del
proyecto, 2026-10-13.

| ID | Hallazgo | Decisión | Revisar cuando |
|---|---|---|---|
| SEC-10 | Enumeración de cuentas en el registro | Aceptado | Antes del lanzamiento público o si se observa abuso |
| SEC-11 | Una sola clave HS256 para JWT y HMAC | Aceptado | Antes de escalar o si se necesita rotar sin cerrar sesiones |
| F05-04 | Cookie de refresco con `Path=/` | Aceptado (inherente) | Solo si se abandona el prefijo `__Host-` |
| SEC-15 | IP del cliente detrás del proxy | **Abierto: verificar en el despliegue** | En el primer despliegue a staging |

## SEC-10 — Enumeración de cuentas en el registro

**Qué pasa:** registrar un correo que ya existe responde 409 y la web muestra «Ya existe una cuenta con este correo
electrónico». Quien pruebe correos puede saber cuáles tienen cuenta.

**Por qué se acepta:** severidad baja. El login y la recuperación de contraseña **sí** son uniformes (mismo 401 y mismo
mensaje; la recuperación responde 202 idéntico). El registro tiene límite de peticiones (`AUTH_REGISTER_LIMIT`). El piloto es
privado y los correos no son un dato secreto por sí solos. Responder genérico y enviar un correo de aviso cambiaría web,
móvil y sus pruebas, y empeoraría la experiencia de quien se equivoca de formulario.

**Qué lo compensa:** límite de registro (`AUTH_REGISTER_LIMIT`, 10 por defecto); login y recuperación uniformes; verificación de correo antes de enviar avisos.

**Se revisa si:** se abre el registro al público, si el volumen de registros fallidos sube, o si aparecen intentos masivos.
La alternativa evaluada es respuesta genérica + correo «ya tienes cuenta».

## SEC-11 — Una sola clave para JWT y HMAC

**Qué pasa:** `AUTH_SIGNING_KEY` firma los JWT y también es la clave de los HMAC de los cubos anti-abuso. No hay `kid` ni dos
claves activas, así que **rotarla cierra todas las sesiones y reinicia los contadores anti-abuso**.

**Por qué se acepta:** con pocos usuarios, cerrar sesiones en una rotación es tolerable. Los HMAC de abuso ya separan el
dominio con un prefijo propio, de modo que un valor válido para un uso no lo es para el otro. La clave se valida al arrancar
(mínimo 43 caracteres, al menos 16 distintos, sin palabras como `secret` o `change_me`) y es distinta por entorno.

**Procedimiento de rotación (documentado en `docs/ops/DISASTER_RECOVERY.md`):** generar una nueva
(`python3 -c 'import secrets;print(secrets.token_urlsafe(48))'`), actualizar `AUTH_SIGNING_KEY` en el entorno y reiniciar la API.
Efecto: todas las personas deben volver a iniciar sesión. Rotar de inmediato si se sospecha que la clave se filtró.

**Se revisa si:** el número de usuarios hace costoso cerrar todas las sesiones, o si se exige rotación periódica sin
interrupción. Entonces: subclaves por propósito (HKDF) y dos claves activas con `kid`.

## F05-04 — Cookies de sesión con `Path=/`

**Qué pasa:** las cookies de sesión de la web (`__Host-erd-access`, `__Host-erd-logout`, `__Host-erd-epoch`) usan el prefijo `__Host-`, que **exige** `Path=/` y prohíbe `Domain`. No se puede
acotar a una ruta sin renunciar a esa protección.

**Por qué se acepta:** el prefijo `__Host-` (solo HTTPS, sin subdominios, sin sobrescritura desde otros subdominios) es más
valioso que acotar la ruta. Las cookies son `HttpOnly`, `Secure` y `SameSite=Strict`.

## SEC-15 — IP del cliente detrás del proxy (abierto)

**Qué pasa:** la API se ejecuta con `--no-proxy-headers` a propósito. Para la web, el BFF firma la IP real del navegador
(`X-Forwarded-Client-Ip`, HMAC con `BFF_API_SHARED_SECRET`, ventana de 60 s; `ERD-SEC-PROXY-01`). Los clientes que hablan
**directo** con la API (la app móvil) comparten el cubo de la IP del proxy.

**Por qué no está cerrado:** el diseño está implementado y con pruebas unitarias (`tests/test_client_ip.py`), pero **no se ha verificado en un despliegue real**: depende
de la topología (Cloudflare delante de Render para `CLIENT_IP_SOURCE=cf-connecting-ip`).

**A comprobar en el primer despliegue a staging:**

1. `CLIENT_IP_SOURCE` coincide con la topología: `socket` si no hay proxy de confianza; `cf-connecting-ip` solo con Cloudflare
   directamente delante de la API. La API no arranca en producción con `cf-connecting-ip` sin un `BFF_API_SHARED_SECRET` fuerte.
2. Desde dos redes distintas, repetir intentos de login fallidos hasta alcanzar el límite (`AUTH_LOGIN_LIMIT`, 20 por defecto) con cada una: los límites deben ser **independientes** por red (web).
3. Desde la app móvil en dos redes: anotar si comparten cubo (esperado hoy) y decidir si es aceptable con el número de usuarios.
4. Un `X-Forwarded-For` falsificado desde fuera **no** cambia el cubo.

Hasta que se haga, SEC-15 sigue abierto y es una comprobación del entorno, no un cambio de código.
