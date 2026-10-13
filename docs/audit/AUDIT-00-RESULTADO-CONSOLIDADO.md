# Auditoría completa del monorepo Energy RD — Resultado consolidado

**Árbol:** `Dev` @ `5e761c6` (merge del PR #22), 11-oct-2026 · **Modo:** solo lectura sobre el repositorio (git limpio antes y después; ningún archivo del repo se modificó, nada se instaló, nada se subió) · **Evidencia dinámica:** solo en bases desechables y puertos locales, ya eliminados.
**Informes de detalle** (cada hallazgo con archivo:línea, severidad, escenario y corrección): `AUDIT-01-DESCUBRIMIENTO`, `AUDIT-02-ARQUITECTURA`, `AUDIT-03-SEGURIDAD-20-LEYES`, `AUDIT-04-BASE-DE-DATOS`, `AUDIT-05-WEB-MOVIL`, `AUDIT-06-BACKEND-API`, `AUDIT-07-DEVSECOPS-INFRA`, `AUDIT-08-QA-RENDIMIENTO`.
No ejecutados, por regla: Prompt 09 (remediación; espera tu aprobación del backlog) y Prompt 10 (Go/No-Go; solo tras remediar y re-auditar). **Este documento no certifica seguridad ni cumplimiento legal.**

---

## 1. Veredicto ejecutivo (preliminar)

| Pregunta | Respuesta |
|---|---|
| ¿Está bien construido? | **Sí, para su etapa.** Arquitectura en capas protegida por una prueba automática; 0 `any`/`@ts-ignore`; 87/87 rutas con pruebas; 2 607 pruebas unitarias/integración + 61 E2E, todas verdes hoy; autenticación seria (Argon2id, JWT con reclamos obligatorios, refresh rotativo con detección de reutilización, BFF con lista blanca y CSRF por origen, cookies `__Host-` HttpOnly); documentos cifrados; telemetría con redacción; borrado y exportación de cuenta. |
| ¿Se puede usar con datos de clientes reales hoy? | **No todavía.** Hay 2 hallazgos altos, 1 media-alta y 2 bloqueos operativos/legales (§3). |
| ¿Se puede seguir con piloto cerrado / staging con datos DEMO? | **Sí**, con las cuentas y datos de prueba, sabiendo que `AUTH_ENABLED` está apagado por defecto en desarrollo y que no hay monitorización real. |
| ¿Qué lo bloquea? | (1) Sin RLS ni roles de BD de mínimo privilegio; (2) un endpoint OCR heredado que congela el servidor (y otro cálculo legítimo, el consumo anual, que lo degrada); (3) autenticación apagada por defecto; (4) sin observabilidad ni simulacro de recuperación reales; (5) textos legales en borrador sin revisión. |

Cifras: **2 altas · 3 media-alta/bloqueos (1 técnica + 2 operativo-legales) · 14 medias · 8 bajas agrupadas · informativas** (registro deduplicado en §3; los 8 informes suman 105 observaciones brutas que colapsan en 27 hallazgos únicos).

## 2. Resultado de las 20 leyes (AUDIT-03, actualizado con 05–08)

| Estado | Cantidad | Leyes |
|---|---:|---|
| APROBADA | 4 | 5 Inyecciones · 11 Pruebas de login/recuperación/autorización · 15 Llamadas API · 18 Analytics y privacidad |
| PARCIAL | 14 | 1 Secretos · 3 Autenticación · 4 Aislamiento · 6 Rate limiting · 7 Dependencias · 8 Endpoints · 9 Errores/idempotencia · 10 Datos sensibles · 13 Backups · 14 Responsive/compat. · 16 Rendimiento · 17 Accesibilidad · 19 Monitorización · 20 Legal |
| FALLIDA | 1 | 2 Permisos de BD y RLS |
| NO APLICABLE | 1 | 12 Pagos |

Cambios de matiz tras 05–08 (sin cambiar el estado): ley 16 suma el hallazgo de consumo anual (F08-01); ley 1 suma que no hay escaneo de secretos continuo en CI (aunque el barrido local de patrones sobre 1 109 archivos dio 0 coincidencias y el historial de 137 commits está limpio); ley 14/17 suman que no hay verificación en WebKit/Firefox ni en dispositivos.

## 3. Registro consolidado de hallazgos (deduplicado)

Severidad = impacto potencial con la evidencia citada. «Dem.» = demostrado dinámicamente en entorno local. Entre paréntesis, los IDs de los informes de origen.

### ALTA
| ID | Hallazgo | Dem. | Origen | Corrección | Esf. |
|---|---|:-:|---|---|:-:|
| **C-01** | **Sin RLS y un único rol de BD que es dueño de las 32 tablas y sirve la aplicación.** El aislamiento entre hogares depende solo de la capa de aplicación; añadir RLS sin separar roles no protegería (probado). | ✔ | DB-01, SEC-01, R-01, R-14 | Roles migrador/aplicación/lectura; `ENABLE`+`FORCE RLS` por `home_id` con `SET LOCAL app.home_id`; matriz de pruebas por tabla | L |
| **C-02** | **`POST /bills/ocr` (síncrono, `async def`) ejecuta Tesseract en el bucle de eventos:** congela *todo* el servidor (`/health/live` esperó 1 267 ms con una imagen de 1,3 s) y lee el cuerpo sin tope. Los clientes ya usan `ocr-jobs`. Riesgo: reinicio de la instancia por el *health check* de Render. | ✔ | SEC-02, F06-01, F06-02 | Eliminar la ruta (cambio de contrato) o `def` + `read(limit+1)` + cuotas | S |

### MEDIA-ALTA / bloqueos operativos y legales
| ID | Hallazgo | Origen | Corrección |
|---|---|---|---|
| **C-03** | **Autenticación apagada por defecto** (`AUTH_ENABLED=False`, `ENVIRONMENT="development"`): un despliegue sin `ENVIRONMENT` queda abierto. | SEC-03, R-02 | Invertir el valor por defecto; rechazar arranque ambiguo (plataforma detectada sin `ENVIRONMENT`) |
| **C-04** | **Textos de privacidad y términos en borrador, sin revisión legal** (Ley 172-13). *Externo.* | Ley 20, ERD-LEGAL-FINAL | Revisión por abogado; retenciones aprobadas |
| **C-05** | **Sin monitorización real ni recuperación probada en producción:** Sentry sin DSN, sin alertas ni runbook probado; backups/restauración solo probados en local (10/10), sin PITR/RTO medidos ni versionado del bucket. *Parte externa.* | SEC-14, F07-18, F07-19, DB-07 | Configurar Sentry + alertas mínimas; simulacro real en Neon y bucket |

### MEDIA
| ID | Hallazgo | Dem. | Origen | Corrección |
|---|---|:-:|---|---|
| C-06 | **La web no envía CSP ni cabeceras de seguridad** (`next.config.mjs` sin `headers()`): clickjacking posible y sin defensa en profundidad ante XSS futuro (hoy hay 0 sumideros XSS). | código | SEC-09, F05-01, F05-03, R-05 | CSP, `frame-ancestors 'none'`, HSTS, `Permissions-Policy`, `poweredByHeader:false` |
| C-07 | **`/docs`, `/redoc`, `/openapi.json` públicos** y la API sin cabeceras de seguridad. | ✔ | SEC-05, SEC-12, F06-05, R-03 | Desactivarlos fuera de desarrollo; cabeceras en middleware |
| C-08 | **Sin límites generales de tamaño de cuerpo/abuso ni tiempos de espera en BD; pool 5+5 frente a 40 hilos** (500 genérico tras 10 s al agotarse). Un cuerpo de 25 MB sin autenticar se lee completo. | parcial | SEC-06, DB-06, F06-03 | Límite de cuerpo, `statement/lock_timeout`, mapear fallo de pool a 503, semáforo de Argon2 |
| C-09 | **El token de descarga firmado queda en el log de acceso de uvicorn** (vive 60 s y exige membresía). | ✔ | SEC-07, F07-14 | `--no-access-log` o filtro de `token=` |
| C-10 | **Sin verificación de correo:** se pueden registrar correos ajenos y enviar avisos a terceros. | código | SEC-04 | Token de verificación antes de enviar avisos |
| C-11 | **CI sin `permissions:`, acciones por etiqueta (no SHA), sin CodeQL/escaneo de secretos/SBOM/imagen, sin `timeout-minutes`, sin Dependabot/CODEOWNERS/SECURITY.md.** | código | SEC-08, F07-01/02/03/05/06, R-04 | `permissions: contents: read`, SHAs, CodeQL + gitleaks + Trivy, timeouts |
| C-12 | **Imagen base sin digest** (`python:3.12-slim`, `uv:0.9`), sin `HEALTHCHECK`, `apt` sin versiones. | código | F07-11/12/13, R-09 | Fijar digest, escanear, `HEALTHCHECK` |
| C-13 | **Consumo O(cubetas × intervalos) y recalculado 3 veces por petición:** el atajo «12 meses» tarda ≈600 ms (p50) y el diario anual ≈850–980 ms con lecturas diarias; 4 en paralelo → ≈3,9 s y `/health/live` p95 202 ms. No hay pruebas de rendimiento con presupuesto. | ✔ | F08-01, F08-02 | O(n+m) con búsqueda binaria; reutilizar el cálculo en la comparación; prueba de rendimiento en CI |
| C-14 | **Móvil: permisos y metadatos de tienda.** El plugin de `expo-image-picker` se aplica por defecto: añade `RECORD_AUDIO` sin necesidad y textos iOS genéricos en inglés; falta `usesNonExemptEncryption`; `allowBackup` sin fijar. (R-06 de AUDIT-01 se **reclasificó**: el plugin sí se aplica, el problema es su configuración por defecto.) | ✔ (config resuelta) | F05-07/08/09/11, R-06 | Configurar el plugin (`microphonePermission:false`, textos ES), bloquear `RECORD_AUDIO`, `allowBackup:false` |
| C-15 | **PII en claro** (`account_number`, dirección), **auditoría sin atribución** (`actor` = `pilot`) con copias de PII, y **retención incompleta** (sesiones, invitaciones con correos de terceros, notificaciones…). | ✔ | DB-03/04/05 | Cifrado de columnas o decisión formal, `actor_user_id`, purga programada |
| C-16 | **Unicidad de correo sensible a mayúsculas en la BD** (la app normaliza, la base no). | ✔ | DB-02 | `UNIQUE (lower(email))` + `CHECK` |
| C-17 | **Sin linter, tipado estático ni cobertura de líneas en Python** (ni cobertura en TS); no se puede fijar umbral. | código | F06-06, F07-04, F08-04 | `ruff`, `mypy` gradual, `pytest-cov`/`vitest --coverage` |
| C-18 | **El job `e2e-web` de CI nunca se ha visto verde en GitHub Actions** (localmente 61/61). | — | F08-03 | Vigilar la primera ejecución real en `Dev` |
| C-19 | **Entornos:** staging en planes Free (duermen) con migración manual; una sola instancia por servicio; worker de pago. | código | F07-16/17 | Decidir plan antes del QA de staging; documentar RTO/RPO |

### BAJA (agrupadas)
| ID | Hallazgo | Origen |
|---|---|---|
| C-20 | **Mantenibilidad:** `parse_bill_text` (198 líneas, complejidad 103), `bff.ts` (546 líneas, 8 responsabilidades), fechas RD duplicadas web/móvil con APIs distintas, interfaz `Api` monolítica, ciclo `equipment↔recommendations`. | F02-01…07, R-11 |
| C-21 | **Contrato API:** 4 listas sin `limit`, `extra="forbid"` en 20/83 modelos, límites decimales no reflejados en OpenAPI, modelo de roles (propietario/miembro) sin documentar. | F06-04/07/08/09 |
| C-22 | `source_url` de tarifa se usa en `<a href>` sin validar esquema (hoy solo datos sembrados). | F05-02 |
| C-23 | Seguridad menor: cookie de refresh con `Path=/` (exigido por `__Host-`), una sola clave para JWT y HMAC, enumeración de cuentas en el registro, IP detrás del proxy para clientes móviles sin verificar en el despliegue. | F05-04, SEC-11, SEC-10, SEC-15/R-13 |
| C-24 | BD menor: 8 FKs sin índice, reglas de negocio solo en la app, `downgrade` destructivos sin política *expand/contract*, `homes.code` global, sin tope de viviendas por usuario. | DB-08…DB-12 |
| C-25 | **Sin verificar:** WebKit/Firefox, dispositivos, TalkBack/VoiceOver, render nativo, Maestro (7 flujos), OCR con facturas reales. *Externo (tareas bloqueadas).* | F05-13, F08-05/06, ERD-A11Y-NATIVE, ERD-E2E-MAESTRO-AUTH, ERD-OCR-REAL-QA |
| C-26 | **Higiene del repo:** README contradice la realidad (dice «sin autenticación/OCR»), workspace `mcp/*` inexistente, `.agents/` y 149 capturas de evidencia versionadas, Node 22 vs 24 dispersos. | R-07/08/12, F07-07/08, F08-08 |
| C-27 | Los 2 avisos de npm aceptados (`braces`, `node-forge`) **caducan el 2026-11-04**: hay que revisarlos o el monitor semanal fallará. | SEC-13 |

### Informativas
MFA ausente (SEC-16) · sin *certificate pinning* (F05-12) · servicio `redis` sin uso en compose (F07-15) · el worker ya gestiona SIGTERM (F07-21, sin hallazgo) · aviso de obsolescencia `httpx`/starlette (F08-09) · pytest ≈8 min y E2E ≈6 min (F08-07).

## 4. Qué está bien (verificado, para no perderlo en la remediación)

- **Autorización:** matriz de 3 roles × operaciones privadas bajo `/homes` (401 sin token, 404 ajeno); 0 rutas privadas sin autenticación; descarga de documentos con token de un solo uso que revalida la membresía.
- **Integridad de datos:** 3 restricciones de exclusión (20 hilos con facturas solapadas → 1 aceptada, 19 rechazadas), `CHECK`/`UNIQUE`/FK con acción explícita, fechas con zona, `numeric` para importes, migraciones reversibles y sin deriva.
- **Honestidad de datos:** etiquetas REAL/ESTIMADO/PROYECTADO/INFERIDO y derivados idempotentes por `dedupe_key`.
- **Sin N+1:** 1–11 sentencias SQL por petición, constantes aunque las listas devuelvan 27–100 filas. Índices correctos (EXPLAIN con 110 k lecturas: 0,09–0,26 ms).
- **Rendimiento base sano:** 4–14 ms p50 en la mayoría de endpoints; ≈150 peticiones/s en un proceso; 0 errores hasta 16 clientes simultáneos.
- **Código limpio:** 0 `any`, 0 `@ts-ignore`, 0 TODO reales, 12 de 527 funciones Python > 40 líneas.
- **Cliente:** web sin sumideros XSS, tokens fuera de JS; móvil con SecureStore (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`), refresh de un solo vuelo, HTTPS fail-closed.
- **Despliegue declarativo:** `render.yaml` con secretos `sync:false`, producción con auto-deploy apagado y migración como paso único de release; `check_deploy_config.py`: 0 errores, 0 avisos.

## 5. Plan de remediación propuesto (Prompt 09 — NO ejecutado, requiere tu aprobación)

| Ola | Contenido | Hallazgos | Riesgo / notas |
|---|---|---|---|
| **0 — rápido, solo código** (≈1–2 días) | Eliminar o corregir `POST /bills/ocr` (regenerar contratos, quitar de la lista blanca del BFF y del cliente); invertir `AUTH_ENABLED` y rechazar arranque ambiguo; `/docs` fuera de staging/prod + cabeceras en la API; `--no-access-log`; cabeceras y CSP en la web; `permissions: contents: read`, SHAs y timeouts en CI; configurar plugin de `expo-image-picker`, `allowBackup`, cifrado iOS; consumo O(n+m) + prueba de rendimiento | C-02, C-03, C-06, C-07, C-09, C-11 (parcial), C-13, C-14 | Cambios de contrato en C-02 y de comportamiento por defecto en C-03 (hay que avisar a quien use el modo piloto) |
| **1 — días** | Límite de cuerpo, `statement/lock_timeout`, fallo de pool → 503; verificación de correo; `UNIQUE (lower(email))`; ruff + mypy + cobertura; digest de imagen + Trivy; CodeQL + gitleaks; Dependabot/CODEOWNERS/SECURITY.md | C-08, C-10, C-11, C-12, C-16, C-17 | Verificación de correo toca el producto (decidir alcance) |
| **2 — 1–2 semanas** | Roles de BD + RLS con `FORCE` y matriz de pruebas; PII/auditoría/retención; refactor de `parse_bill_text`, `bff.ts`, fechas RD a `core` | C-01, C-15, C-20 | C-01 exige decidir la estrategia de roles en Neon y cambiar `render.yaml` (URL de migración distinta de la de servicio) |
| **Externo** | Revisión legal; Sentry + alertas; simulacro real de restauración (Neon + bucket); plan de staging; QA en dispositivos (Maestro, TalkBack/VoiceOver, OCR real); revisar los 2 avisos de npm antes del 4-nov | C-04, C-05, C-19, C-25, C-27 | Necesita cuentas/dispositivos que no están en esta sesión |

Regla de ejecución (Prompt 09): un commit por hallazgo con prueba de regresión, verificación completa antes/después, sin tocar `main`/`QA`, sin push sin tu autorización expresa; luego re-auditoría independiente (otra instancia) y recién entonces el Prompt 10 (Go/No-Go).

## 6. Decisiones que necesito de ti antes de la remediación

1. ¿Elimino `POST /bills/ocr` (cambio de contrato) o la convierto en `def` con cuotas? *(recomiendo eliminar: nadie la usa)*
2. ¿Apruebo invertir el valor por defecto de `AUTH_ENABLED` (el modo piloto local pasaría a pedir un indicador explícito)?
3. RLS: ¿hay que mantener un único `DATABASE_URL` en Render o aceptas dos (migración y servicio)? Depende de cómo esté configurado Neon.
4. Verificación de correo: ¿entra en el alcance del piloto o se pospone dejando los avisos por correo desactivados para cuentas no verificadas?
5. ¿Versiono estos 8 informes en `docs/audit/` (commit en `Dev`)? **No lo hice**; los commits y cualquier push requieren tu autorización expresa.
6. ¿Apruebo la Ola 0 como primer lote del Prompt 09?

## 7. Limitaciones globales (qué NO se verificó)

GitHub (protección de ramas, permisos por defecto de Actions, push protection, CI remoto); Render/Neon/R2/Resend/EAS (roles reales, cifrado en reposo, PITR, variables, TLS/HSTS); Docker (sin daemon: imagen y compose solo leídos); dispositivos y emuladores (Maestro, permisos reales, TalkBack/VoiceOver); OCR con facturas reales; WebKit/Firefox; carga sostenida o picos (regla: sin DoS); cobertura de líneas; tamaño de *bundle* y tiempos de carga en navegador; historial de Git más allá del barrido de patrones del AUDIT-03 (137 commits, limpio). Las mediciones de rendimiento son locales, de un proceso, con datos sintéticos y sin red: no extrapolables a producción.
