# Auditoría 03 — Seguridad integral (las 20 leyes, OWASP, MASVS)

**Modo:** análisis estático + pruebas dinámicas **locales y acotadas** (API en `127.0.0.1` contra la base de pruebas, datos sintéticos propios, sin carga destructiva, sin tocar sistemas ajenos ni producción). El repositorio no se modificó.
**Árbol:** `Dev` @ `5e761c6`. **Fecha de las consultas a bases de vulnerabilidades:** 11-oct-2026.
Pruebas dinámicas hechas: ver §6. Lo que depende de producción, GitHub, Render/Neon o de dispositivos reales queda **NO VERIFICADO**.

---

## 1. Resumen ejecutivo

La base de seguridad de aplicación es **sólida para un piloto** (Argon2id, JWT con reclamos obligatorios y revocación inmediata, rotación de *refresh* con detección de reutilización, BFF con lista blanca estricta, documentos cifrados, redacción de PII en telemetría, 1 082 pruebas incluida una matriz de autorización de las 63 operaciones privadas bajo `/homes`). Lo que **falta** son capas de defensa en profundidad y controles operativos.

| Resultado de las 20 leyes | Cantidad |
|---|---:|
| APROBADA | 4 |
| PARCIAL | 14 |
| FALLIDA | 1 |
| NO APLICABLE | 1 |
| NO VERIFICADA | 0 |

**Riesgos que recomiendo tratar como bloqueantes antes de datos reales de clientes:**
1. **SEC-01 / DB-01 (ALTA)** — sin RLS ni roles de mínimo privilegio: el aislamiento entre hogares depende de una sola capa.
2. **SEC-02 (ALTA)** — el endpoint OCR síncrono **bloquea todo el servidor**: demostrado (una imagen de 1.3 s dejó a `/health/live` 1 267 ms sin respuesta). Con una imagen real y varias subidas, el *health check* de Render puede reiniciar la instancia.
3. **SEC-03 (MEDIA-ALTA)** — la autenticación **está apagada por defecto**; un despliegue que olvide `ENVIRONMENT` queda abierto.
4. **ERD-LEGAL-FINAL** — los textos de privacidad y términos siguen en **borrador** sin revisión legal.

Totales: 2 altas, 8 medias, 5 bajas, 2 informativas. Ninguna se explotó fuera de un entorno local de pruebas.

---

## 2. Matriz de las 20 leyes

| # | Ley | Estado | Evidencia principal | Hallazgos |
|--:|---|---|---|---|
| 1 | API keys y secretos | **PARCIAL** | Historial completo (137 commits) sin claves de alta confianza, sin `.env`/`.pem`/volcados; solo `.env.example`; `NEXT_PUBLIC_*` solo contiene URL, bandera de auth y DSN de Sentry (público por diseño); guardas de producción rechazan claves débiles (`config.py:131-201`). **No verificado:** variables de Render/GitHub, imágenes Docker, *bundles* compilados web/móvil | — |
| 2 | Permisos de BD y RLS | **FALLIDA** | 0 políticas RLS, un único rol dueño de las 32 tablas (superusuario en local/CI); una política simulada es ignorada por ese rol | DB-01 |
| 3 | Autenticación y sesiones | **PARCIAL** | Argon2id (t=3, m=64 MiB, p=4); JWT HS256 con `exp/iat/nbf/sub/sid/jti/iss/aud/type` obligatorios, 15 min; sesión verificada en BD en cada petición (revocación inmediata); *refresh* rotativo con detección de reutilización; JWT manipulado (alg=none, payload alterado, firma recortada) → 401. Faltan: **verificación de correo**, MFA, autenticación apagada por defecto | SEC-03, SEC-04, SEC-16 |
| 4 | Unicidad, autorización por recurso y aislamiento | **PARCIAL** | Matriz de autorización (3 roles × 63 operaciones privadas bajo `/homes`: 401 sin token, 404 ajeno, ids hijos de otro hogar → 404); 20 hilos con facturas solapadas → 19 rechazadas. Faltan: capa de BD (DB-01) y unicidad de correo sin distinguir mayúsculas | DB-01, DB-02 |
| 5 | Inyecciones (SQLi, XSS…) | **APROBADA** | Sin SQL crudo con datos del usuario (solo `SELECT 1`, `SET LOCAL` fijos y migraciones); sin `dangerouslySetInnerHTML`/`innerHTML`/`eval` en web ni móvil; nombre de vivienda `<img onerror…>'; DROP TABLE…` se guarda y devuelve como dato inerte y la tabla sigue existiendo. *Observación:* falta CSP como defensa en profundidad (SEC-09) | SEC-09 |
| 6 | Rate limiting y abuso | **PARCIAL** | Límites persistentes (HMAC) en registro, login, *refresh*, recuperación y reset; cuota de invitaciones; tope de OCR activos (3) y documentos sin confirmar (20) por vivienda. **No hay** límite general por usuario/IP ni tope de tamaño de cuerpo: un cuerpo de 25 MB sin autenticar se lee completo (422 en 0.3 s) | SEC-06 |
| 7 | Dependencias y cadena de suministro | **PARCIAL** | `pip-audit` sobre 152 paquetes de runtime: **sin vulnerabilidades conocidas**; `npm audit` producción: 15 paquetes afectados por **2 avisos únicos** (braces, node-forge) aceptados con alcance "solo compilación/Metro" y vencimiento 2026-11-04 (`audit:monitor`: OK); *lockfiles* `package-lock.json` y `uv.lock` con CI `npm ci`/`uv sync --frozen`. Faltan: acciones de GitHub sin fijar a SHA, sin SBOM, imágenes sin digest | SEC-08, SEC-13 |
| 8 | Seguridad y diseño de endpoints | **PARCIAL** | Errores sanitizados (sin trazas al cliente), 422 sin eco en `/auth`, `Cache-Control: no-store` en respuestas sensibles, CORS con orígenes explícitos (origen ajeno → sin `Allow-Origin`). Fallos: **`/docs`, `/redoc` y `/openapi.json` públicos** (200), endpoint OCR síncrono sin uso, cabeceras de seguridad ausentes en la API | SEC-02, SEC-05, SEC-12 |
| 9 | Errores, transacciones, reintentos e idempotencia | **PARCIAL** | Patrón `write_transaction` único, 55 bloqueos `FOR UPDATE`/`lock=True`, `SAVEPOINT` para que un fallo del motor nunca deshaga la escritura del usuario, cola de trabajos con `idempotency_key` y `SKIP LOCKED`, claves de deduplicación únicas, política de reintentos del cliente (no reintenta 4xx). Falta: tiempos de espera en la base | DB-06 |
| 10 | Información sensible, cifrado y privacidad | **PARCIAL** | Originales cifrados AES-GCM con claves versionadas; tokens (reset, invitación, *refresh*) guardados solo como hash; IP/par como HMAC; descarga con enlace firmado de 60 s que revalida membresía; exportación y borrado de cuenta. Fallos: PII (número de cuenta, dirección) **en claro** y copiada a la auditoría; retención incompleta | DB-03, DB-04, DB-05 |
| 11 | Pruebas de login, recuperación y autorización | **APROBADA** | `test_auth*`, `test_auth_abuse`, `test_password_recovery(_races)`, `test_password_change`, `test_authorization`, `test_account_deletion`, `test_home_sharing`, ~20 archivos de prueba del BFF, E2E (registro, sesión, recuperación, cambio de contraseña, autorización entre cuentas, CSRF por origen). *Pendiente:* el E2E aún no corrió en CI remoto | — |
| 12 | Pagos | **NO APLICABLE** | Sin código de pagos, pasarelas ni webhooks (`paid_at` es una marca de factura del hogar) | — |
| 13 | Backups y recuperación | **PARCIAL** | Respaldo cifrado `age` + restauración verificada: **autoprueba 10/10** (incluye clave equivocada, archivo manipulado, sin manifiesto). Sin programación, sin copia externa, sin PITR/RTO medidos en producción | DB-07 (+ auditoría 07) |
| 14 | Responsive y compatibilidad | **PARCIAL** | Tailwind responsive y pruebas de navegación; E2E solo en Chromium de escritorio; sin pruebas en WebKit/Firefox ni en dispositivos | Auditoría 05 |
| 15 | Llamadas API y comunicación | **APROBADA** | Cliente con validación Zod en ejecución y comprobación de pertenencia (vivienda/id) en cada respuesta; BFF con lista blanca, cuerpos `.strict()`, filtros de consulta cerrados y origen exigido en escrituras; HTTPS obligatorio fuera de desarrollo (web `next.config.mjs:6-15`, móvil `config.ts`) | SEC-06, SEC-07 (observaciones) |
| 16 | Rendimiento y consumo de recursos | **PARCIAL** | Índices correctos en los accesos por vivienda (EXPLAIN con 110 k lecturas: 0.09–0.26 ms). **Defecto demostrado:** OCR síncrono bloquea el bucle de eventos; pool 5+5 y cuerpos sin límite. Sin pruebas de carga | SEC-02, SEC-06 (→ 08) |
| 17 | Accesibilidad | **PARCIAL** | Web: pruebas con axe, foco, teclado y diálogos (vitest + Playwright); móvil: etiquetas y áreas táctiles verificadas por estructura. Sin lectores de pantalla nativos | ERD-A11Y-NATIVE |
| 18 | Analytics y privacidad | **APROBADA** | Sin analítica de terceros (GA, Mixpanel, Segment, PostHog… ausentes); la telemetría (Sentry, opcional) redacta cuerpos, cookies, cabeceras, query, IP, usuario, correos, JWT y tokens **antes de salir** (`telemetry.ts` / `telemetry.py`, `send_default_pii=False`, con pruebas). *Condición:* si se activa Sentry hay que declararlo en la política de privacidad | — |
| 19 | Monitorización de errores e incidentes | **PARCIAL** | `X-Request-ID` en cada respuesta y log, `/health` y `/health/live`, Sentry con redacción listo pero **sin DSN real configurado** (ERD-OBS-01 bloqueada); sin alertas ni *runbook* de incidentes comprobados | SEC-14 |
| 20 | Legal y cumplimiento | **PARCIAL** | Consentimiento versionado (`terms_version`, fecha), exportación y borrado de cuenta implementados; textos en **borrador** (`status: draft`, Ley 172-13 sin revisión legal), retenciones sin aprobar. *No es una certificación de cumplimiento* | ERD-LEGAL-FINAL, DB-05, DB-07 |

---

## 3. Registro de vulnerabilidades y debilidades

Formato: ID · severidad · confianza · evidencia · escenario · impacto · causa raíz · remediación · prueba de regresión.

**SEC-01 · ALTA · (ver DB-01)** — Sin RLS ni mínimo privilegio en la base. Detalle y plan en la auditoría 04.

**SEC-02 · ALTA · alta (demostrado)** — *El endpoint OCR síncrono bloquea el servidor y lee el archivo completo antes de validar el tamaño.*
Evidencia: `backend/api/app/api/v1/bills.py:26-37` — `async def` que llama a `extract_text()` (Tesseract, bloqueante) y hace `await file.read()` sin límite previo. **Prueba:** una factura sintética de 768 px tardó 1.3 s en `POST /bills/ocr` y durante ese tiempo `GET /health/live` esperó **1 267 ms** (base 2 ms; solo 2 sondeos completados). Los clientes web y móvil ya usan `ocr-jobs` (`hooks.ts`), por lo que la ruta síncrona es superficie sin uso.
Escenario: cualquier usuario autenticado (o cualquiera, si la autenticación está apagada) envía varias fotos grandes seguidas; el bucle de eventos queda ocupado, todas las peticiones se encolan y el *health check* de Render falla → reinicio de la instancia.
Impacto: caída del servicio para todos los hogares con un solo usuario.
Remediación: **eliminar** `POST /bills/ocr` (cambio de contrato; el cliente genérico `ocr` queda sin uso) o, como mínimo, convertirla en función normal (`def`, hilo del *threadpool*), leer con tope (`read(limit+1)`) y limitarla con las cuotas de `ocr-jobs`.
Prueba: 3 subidas simultáneas no retrasan `/health/live` más de 200 ms; un cuerpo mayor que el límite se rechaza sin cargarse completo.

**SEC-03 · MEDIA-ALTA · alta** — *Autenticación apagada por defecto (fallo abierto).* `AUTH_ENABLED=False` y `ENVIRONMENT="development"` por defecto (`config.py:21-22`); `auth_deps.py:25-26,35-36` devuelve `None` (sin usuario) y `authorize_home` no valida nada. Las guardas solo se activan si `ENVIRONMENT` ≠ `development` (`config.py:177-178`).
Escenario: un despliegue sin la variable `ENVIRONMENT` (o con un error tipográfico) publica toda la API sin autenticación ni aislamiento.
Remediación: invertir el valor por defecto (`AUTH_ENABLED=True`), exigir un indicador explícito para el modo piloto local y rechazar el arranque si detecta una plataforma (`RENDER`, `PORT`, `DATABASE_URL` con host remoto) sin `ENVIRONMENT` declarado.
Prueba: arrancar con `RENDER=true` y sin `ENVIRONMENT` → falla; con `AUTH_ENABLED` omitido → 401 en `/homes`.

**SEC-04 · MEDIA · alta** — *No hay verificación de correo.* No existe `email_verified` ni flujo equivalente. Cualquiera puede registrar un correo ajeno; las alertas y avisos (`notifications.py:131`) se envían a `user.email` sin comprobar que sea de quien se registró → la plataforma puede usarse para enviar correos no solicitados (con contenido parcialmente controlado: nombre de vivienda) y para *squatting* de cuentas.
Remediación: token de verificación (un solo uso, hash, caducidad corta) antes de enviar avisos o aceptar invitaciones; hasta entonces, sin correos de alertas.
Prueba: cuenta sin verificar no recibe correos de alerta; el enlace caduca y no se reutiliza.

**SEC-05 · MEDIA · alta (demostrado)** — *Documentación interactiva pública:* `GET /docs`, `/redoc` y `/openapi.json` → **200 sin autenticación** (`main.py:19-23` no define `docs_url=None`). Facilita el reconocimiento de las 86 operaciones. Remediación: `docs_url=None, redoc_url=None, openapi_url=None` fuera de `development`. Prueba: 404 en `staging/production`.

**SEC-06 · MEDIA · alta (demostrado en parte)** — *Sin límites generales de abuso ni de tamaño de cuerpo.* Solo hay límites en auth e invitaciones; `POST /auth/login` con **25 MB** sin autenticar fue leído por completo (422 en 0.3 s); `AUTH_ABUSE_PROTECTION.md:84-85` reconoce que "límites globales en borde, tamaño de body/headers y concurrencia de Argon2 siguen siendo requisitos operativos". Escenario: agotamiento de memoria/CPU (también por el costo de Argon2 sin tope de concurrencia). Remediación: límite de cuerpo (p. ej. 256 KB JSON / 25 MB uploads) en un *middleware*/proxy, límite por usuario en escrituras, semáforo de Argon2. Prueba: cuerpo mayor → 413 sin leerse; ráfaga de escrituras → 429.

**SEC-07 · MEDIA · alta (demostrado)** — *Los enlaces de descarga firmados quedan en el registro de acceso de uvicorn.* `GET /api/v1/documents/download?token=…` → el token completo aparece en el log (1 línea con el valor de prueba); el log propio sí omite la query (`observability.py:55,69`) pero el de uvicorn no está desactivado (`docker-entrypoint.sh`). Mitigante: el token vive 60 s y exige membresía vigente. Remediación: `--no-access-log` (o filtro que elimine `token=`), o canjear con `POST`. Prueba: ninguna línea de log contiene el token.

**SEC-08 · MEDIA · alta** — *CI/CD:* `ci.yml` sin `permissions:` (hereda el valor del repositorio), acciones por etiqueta mutable (`@v4`, `@v6`), sin escaneo de secretos en CI, sin SBOM. Detalle en auditoría 07.

**SEC-09 · MEDIA · media (a confirmar en 05)** — *La web no define CSP ni cabeceras de seguridad* (`next.config.mjs` sin `headers()`; `git grep` sin coincidencias). Sin CSP, un XSS futuro no tendría contención. Remediación: CSP con nonce, `frame-ancestors 'none'`, `X-Content-Type-Options`, `Referrer-Policy`, HSTS en el borde.

**SEC-10 · BAJA · alta** — *Enumeración de cuentas en el registro:* correo existente → 409 (la API dice "Registro duplicado…") y la web lo traduce a "Ya existe una cuenta con este correo electrónico" (`bff.ts`); el login y la recuperación sí son uniformes (probado: mismo 401/mensaje, 85 vs 76 ms; recuperación 202 idéntico). Mitigante: límite de registro. Decisión de producto: aceptar o responder genérico + correo de aviso.

**SEC-11 · BAJA · media** — *Una sola clave simétrica (HS256) para JWT y para los HMAC de abuso/IP,* sin `kid` ni rotación escalonada: rotar `AUTH_SIGNING_KEY` cierra todas las sesiones y reinicia los cubos de abuso. Remediación: derivar subclaves por propósito y soportar dos claves activas.

**SEC-12 · BAJA · alta** — *La API no envía cabeceras de seguridad* (`X-Content-Type-Options`, etc.; solo las respuestas de descarga las llevan) y anuncia `Server: uvicorn`. JSON-only, riesgo bajo; añadir en *middleware*/borde.

**SEC-13 · INFORMATIVO** — Dependencias: ver ley 7. Los 2 avisos aceptados vencen el **2026-11-04** (24 días): deben revisarse o el monitor semanal fallará.

**SEC-14 · MEDIA · alta** — *Sin monitorización operativa real:* Sentry sin DSN (ERD-OBS-01), sin alertas de disponibilidad/errores/latencia, sin *runbook* de incidentes probado.

**SEC-15 · BAJA · media** — *IP de cliente detrás de Render:* `--no-proxy-headers` (deliberado) hace que, para clientes que hablan directo con la API (móvil), todos compartan el cubo del proxy; el diseño `ERD-SEC-PROXY-01` está documentado pero **no verificado en el despliegue**.

**SEC-16 · INFORMATIVO** — Sin MFA; los roles `admin`/`support` existen en el esquema pero **no tienen rutas** (no hay superficie de escalada vertical hoy; las pruebas confirman 404 para ambos roles).

Hallazgos de la capa de datos (DB-01…DB-13) están en `AUDIT-04-BASE-DE-DATOS.md`. Hallazgos de clientes (CSP, permisos móviles, `allowBackup`) se confirman en la auditoría 05.

---

## 4. Modelo de amenazas (resumen)

**Activos:** cuentas y credenciales; facturas, lecturas y consumo por hogar (revelan presencia/ausencia en casa); número de cuenta de la distribuidora y dirección; fotos/PDF de facturas; tokens de sesión y de dispositivo; claves de firma/cifrado.
**Actores:** persona autenticada hostil (BOLA/IDOR, abuso de recursos), atacante anónimo (fuerza bruta, enumeración, DoS), miembro invitado con rol reducido, atacante con *token* de descarga filtrado, insider/CI comprometido, dependencia comprometida (cadena de suministro).
**Fronteras de confianza:** navegador↔BFF (cookies httpOnly + época + origen), BFF↔API (Bearer + secreto compartido + IP firmada), móvil↔API (Bearer; *refresh* en SecureStore), API↔PostgreSQL (un rol), API↔S3/R2, worker↔cola, API↔Resend/Expo/Sentry.

| STRIDE | Amenaza principal | Control actual | Brecha |
|---|---|---|---|
| Spoofing | robo/forja de token, registro con correo ajeno | JWT firmado con reclamos obligatorios, sesión en BD, rotación | SEC-04, SEC-11 |
| Tampering | modificar datos de otro hogar | `authorize_home`, filtros por `home_id`, restricciones en BD | DB-01 |
| Repudiation | no saber quién cambió qué | `audit_events` | `actor` siempre `pilot` (DB-04) |
| Information disclosure | BOLA, fuga por logs, docs públicas, PII en claro | pruebas de autorización, redacción, hashes | DB-01, SEC-05, SEC-07, DB-03 |
| Denial of service | OCR síncrono, cuerpos grandes, Argon2 | cuotas de OCR/documentos | SEC-02, SEC-06 |
| Elevation of privilege | de miembro a propietario, de anónimo a usuario | `require_home_owner`, guardas de configuración | SEC-03 |

---

## 5. Riesgos bloqueantes del lanzamiento

1. **DB-01/SEC-01** — aislamiento de hogares de una sola capa y rol dueño de todo.
2. **SEC-02** — DoS trivial con un usuario autenticado.
3. **SEC-03** — autenticación apagada por defecto.
4. **Textos legales en borrador** (ley 20) si se tratarán datos personales reales.
5. **Sin monitorización/alertas ni simulacro de recuperación en producción** (SEC-14, DB-07): no son vulnerabilidades, pero sin ellas no se detecta ni se resuelve un incidente.

## 6. Pruebas dinámicas realizadas (alcance y límites)

Entorno: API local (`uvicorn` en `127.0.0.1`), base `energy_rd_test`, usuario y datos sintéticos propios (`@example.com`), una factura sintética propia. Sin ataques de disponibilidad sostenidos ni fuerza bruta.
Ejecutadas: bloqueo del bucle por OCR (§SEC-02); token en log de acceso (SEC-07); `/docs`, `/redoc`, `/openapi.json`, cabeceras y CORS con origen ajeno y propio (SEC-05, SEC-12, ley 8); login con contraseña errónea vs correo inexistente, registro duplicado, recuperación con/sin cuenta (SEC-10, ley 3); JWT `alg=none`, payload alterado, firma recortada, sin token (ley 3); cuerpo de 25 MB sin autenticar (SEC-06); nombre de vivienda con XSS/SQLi (ley 5); `pip-audit` y `npm audit` (ley 7); autoprueba de respaldo (ley 13).
Nota: `uvx pip-audit` instaló la herramienta en la caché de `uv` (fuera del repositorio), igual que hace el CI.

## 7. Plan de corrección priorizado (propuesta; no se ha aplicado nada)

| Orden | Acción | Hallazgos | Esfuerzo |
|--:|---|---|---|
| 1 | Eliminar/rehacer `POST /bills/ocr`; tope de lectura de cuerpos | SEC-02, SEC-06 | S |
| 2 | Cambiar el valor por defecto de autenticación y rechazar arranques ambiguos | SEC-03 | S |
| 3 | `docs_url/redoc_url/openapi_url = None` fuera de desarrollo; `--no-access-log` o filtro de `token=` | SEC-05, SEC-07 | S |
| 4 | Roles de BD (migrador / aplicación) + RLS con `FORCE` + matriz de pruebas | DB-01 | L |
| 5 | Verificación de correo antes de enviar avisos | SEC-04 | M |
| 6 | CSP y cabeceras (web), cabeceras en API, CI con `permissions:` y SHA fijos | SEC-08, SEC-09, SEC-12 | M |
| 7 | Tiempos de espera en BD, límites por usuario, semáforo de Argon2 | DB-06, SEC-06 | M |
| 8 | Retención, auditoría con `actor_user_id`, cifrado de PII | DB-03/04/05 | M-L |
| 9 | Sentry con DSN, alertas y *runbook*; programar respaldos y simulacro en Neon | SEC-14, DB-07 | M |
| 10 | Revisión legal de los textos | ley 20 | externo |

## 8. Pruebas de seguridad pendientes
Matriz RLS con el rol real; prueba de carga con límites (auditoría 08); `mobsf`/revisión del binario y de los permisos (auditoría 05); verificación de CSP con navegador (05); comprobación de Render/Neon/GitHub (07); *pentest* externo antes del lanzamiento público.

*Este informe no certifica seguridad total ni cumplimiento legal. "APROBADA" significa "con la evidencia citada, sin hallazgos abiertos en esa ley dentro del alcance verificado".*
