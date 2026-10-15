# Prompt 10 — Re-auditoría y decisión Go/No-Go

Fecha: 2026-10-12 · Commit auditado: `Dev` en `dd48359` (CI verde en GitHub para `6aed471`). **No es una certificación de seguridad ni de cumplimiento legal.**

## Método y límites
- Tres revisores independientes de solo lectura (seguridad/RLS/datos, superficies/CI/cadena de suministro, operación/calidad/privacidad) recibieron el código y los informes originales **sin** mis conclusiones de estado ni `REMEDIACION-ESTADO.md`. Sus hallazgos se contrastaron con mi evidencia; los que aquí figuran como «verificado» los comprobé yo en el código o en ejecución.
- Evidencia de ejecución propia (sesión): API 1292 pasan (+ 326 con roles RLS), web 837, móvil 545, paquetes 179, admin 17, E2E 67/67, ruff/mypy/contratos/arquitectura limpios; GitHub Actions en `6aed471`: CI 4/4 y Security 4/4 jobs verdes.
- **No verificable aquí:** Neon (roles, pooler), Render/Cloudflare reales, Sentry, restauración real, dispositivos, TalkBack/VoiceOver, tiendas, protección de ramas, revisión legal. Ningún revisor ejecutó PostgreSQL; el comportamiento real de las políticas RLS lo cubre mi suite, no ellos.

## Decisión: **NO-GO para producción**

Justificación (bloqueantes sin resolver, según el criterio del Prompt 10):
1. **Recuperación no demostrada (C-05/C-13-ley):** no hay respaldo programado, PITR ni simulacro real en Neon+bucket; las autopruebas de respaldo no corren en CI; no hay alertas ni DSN de Sentry; el worker (OCR, avisos, retención, purga de archivos) no tiene monitorización y si cae falla en silencio.
2. **Textos legales en borrador (C-04)** y nada impide arrancar en producción con `status: draft`; plazos de retención sin aprobación; faltan URL de privacidad y etiquetas de datos para las tiendas.
3. **Roles de BD de mínimo privilegio (C-01) sin crear en Neon:** el API se niega a arrancar sin ellos (correcto), pero el despliegue real no está probado.
4. **`frontend-web/admin` sin CSP ni cabeceras de seguridad** (verificado: no hay middleware ni `headers()`); gestiona asignación de roles → clickjacking. Además no está en `render.yaml` ni en la CI de seguridad.
5. **Evasión de límites anti-abuso** si el origen del API es alcanzable sin pasar por Cloudflare (`CF-Connecting-IP` se acepta sin firma, `auth_abuse.py:46-51`). Depende de la topología real, no verificable aquí.

Camino a **GO CON CONDICIONES** (piloto acotado): cerrar 1–5 con responsable y fecha; hasta entonces, solo staging/QA con datos sintéticos.

## Registro de hallazgos originales
| ID | Estado | Evidencia / lo que falta |
|---|---|---|
| C-01 | **Parcialmente corregido** | RLS por vivienda en 11+3 tablas, roles NOLOGIN/NOBYPASSRLS, contexto por transacción, guarda de arranque; matriz de pruebas real y prueba de cobertura (corre en CI con `TEST_RLS_ROLE=1`). Falta: `audit_events` y `home_invitations` (tienen `home_id`) sin RLS por decisión; sin `FORCE RLS`; identidad, RBAC admin, `jobs`, sesiones y datos por usuario sin RLS; las políticas no distinguen propietario/miembro (solo `require_home_owner`); roles no creados en Neon; pooler no verificado. |
| C-02 | Cerrado con evidencia | Ruta retirada, subidas con tope por flujo; prueba de inexistencia de la ruta. |
| C-03 | Cerrado con evidencia | Default `True`, `ENVIRONMENT` explícito, claves fuertes, HTTPS obligatorio, RBAC admin sin bypass. |
| C-04 | **Abierto (externo)** | Borrador, marcadores sin rellenar, sin revisión legal. |
| C-05 | **Abierto (parcial en código)** | Sentry con redacción y request-id; sin DSN, alertas, respaldo programado ni restauración real. |
| C-06 | Cerrado con evidencia | CSP con nonce + `strict-dynamic`, HSTS, etc.; pruebas de middleware. Residual: `style-src 'unsafe-inline'`. |
| C-07 / C-09 | Cerrado con evidencia | Docs solo en desarrollo, cabeceras API, `--no-access-log`. |
| C-08 | Cerrado con evidencia (matices) | Topes de cuerpo, timeouts, 503, Argon2 acotado. Matices: `SET` por sesión y PgBouncer; el `statement_timeout` de 30 s también aplica al worker; flood de login puede degradar por 503. |
| C-10 | **Parcialmente corregido** | Verificación robusta y avisos solo a verificados. Falta: invitar y aceptar invitaciones no la exigen (N-1/N-2). |
| C-11 / C-12 | Cerrado en repo y **verificado en GitHub** (ejecución) | SHAs, permisos mínimos, CodeQL, gitleaks, Trivy+SBOM, Dependabot, Docker por digest. No verificable: protección de ramas, secret scanning, CODEOWNERS obligatorio. Trivy solo bloquea CRITICAL. |
| C-13 | Cerrado (algoritmo) / parcial (carga) | Oráculo aleatorio de 36 casos + prueba de reloj; la carga concurrente que motivó el hallazgo no se volvió a medir en CI. |
| C-14 | Cerrado en configuración; **no verificado en dispositivo** | Falta `aapt dump permissions` del APK/IPA. |
| C-15 | **Parcialmente corregido** | Auditoría con autor, redacción con HMAC, purga diaria. Abierto: cifrado de `account_number`/dirección (decisión pendiente de Manuel); redacción solo de 6 campos (`homes.name`, notas y marcas van en claro); sin retención de `admin_audit_events`, tokens vencidos de usuarios inactivos, `device_tokens` ni `document_ocr.draft`. |
| C-16 | Cerrado con evidencia | UNIQUE(lower(email)) + CHECK; aborta ante duplicados. |
| C-17 | **Parcialmente corregido** | ruff (E9,F,B) y `fail_under=92` (medido 97 %); **mypy cubre 5 de ~11.500 líneas** (sin auth, RLS, documentos, OCR, worker); sin cobertura TS. |
| C-18 | Cerrado con evidencia | E2E web verde en Actions (CI #59). Solo Chromium. |
| C-19 | **Parcialmente corregido** | `render.yaml` con prod manual y `preDeployCommand`; una instancia por servicio; staging se migra a mano; sin CD ni pruebas de humo; nada desplegado. |
| C-20 | Parcialmente corregido | `parse_bill_text` y `bff.ts` divididos; faltan fechas RD, interfaz `Api`, ciclo equipment↔recommendations. |
| C-21 | Cerrado con evidencia | `extra="forbid"` en entradas, `limit/offset` en documentos. Sin prueba que obligue a nuevos modelos a usarlo. |
| C-22 | Cerrado con evidencia | `safeHttpUrl` + pruebas. |
| C-23 | **Parcialmente corregido** | `Path=/` aceptado (lo exige `__Host-`); clave única JWT/HMAC **abierta**; enumeración en el registro (409) **abierta**; IP tras proxy parcial (ver N-3). |
| C-24 | Cerrado con evidencia (lectura) | 11 índices, tope de viviendas, `code` ignorado, política expand/contract. Los `downgrade` siguen siendo destructivos (documentado). |
| C-25 | **No verificado (externo)** | Dispositivos, lectores de pantalla, Maestro, WebKit/Firefox, OCR con facturas reales. |
| C-26 | Parcialmente corregido | `.nvmrc`, README, workspace; siguen `.agents/` y ~186 capturas versionadas. `.coverage` se coló en un commit mío y se retiró (`3b55a55`, local). |
| C-27 | **Aceptado formalmente como riesgo residual, con fecha** | `braces`/`node-forge` sin parche (confirmado); revisión antes del **2026-11-04**; el monitor falla si caduca. |

## Hallazgos nuevos de la re-auditoría
| ID | Sev. | Hallazgo | Verificado por mí |
|---|---|---|---|
| N-1 | Alta | `frontend-web/admin` sin CSP/cabeceras (clickjacking sobre asignación de roles); fuera de `render.yaml` y de la CI de seguridad | Sí (sin middleware ni `headers()`) |
| N-2 | Alta (no verificable) | `CF-Connecting-IP` aceptado sin firma → evasión de límites si el origen es accesible; el BFF admin comparte un único cubo de IP | Código sí; topología no |
| N-3 | Media | Cuentas sin verificar pueden invitar y aceptar invitaciones (retransmisor de correo con la marca del dominio) | Sí (`sharing.py` no consulta `email_verified_at`) |
| N-4 | Alta (doc) | `DEPLOY_GUIDE.md` (política expand/contract, escrita por mí) cita `scripts/backup_pilot.sh`, que respalda el Postgres **local**, sin cifrar; no respalda Neon | Sí |
| N-5 | Alta (privacidad) | Sin rotación de respaldos (política promete ~35 días) y restaurar resucita cuentas borradas sin procedimiento de re-borrado | Doc |
| N-6 | Media | Staging puede quedar con código que espera una migración no aplicada; `/health` solo hace `SELECT 1` | Doc/código |
| N-7 | Media | Worker sin monitorización ni latido | Código |
| N-8 | Media | Retención parcial frente a la política (tokens, `device_tokens`, `document_ocr.draft`, `admin_audit_events`); regla `notifications` sin afirmar en su prueba | Código |
| N-9 | Media | Tiendas: sin URL de privacidad en `app.json`/`eas.json` ni etiquetas de datos (App Privacy / Data safety) | Código |
| N-10 | Baja | `register_device` permite reasignar un token push a otra cuenta; token de descarga reutilizable 60 s (el doc dice un solo uso); `expires_at` naive/pasado en asignaciones admin → 500; logs con `exc` sin depurar; `pip-audit` sin versión fijada; documentación contradictoria (`JOBS.md`, comentario de CI) | Revisores |

## Matriz final de las 20 leyes
| # | Ley | Antes | Ahora | Motivo |
|---|---|---|---|---|
| 1 | Secretos | Parcial | **Aprobada con reservas** | gitleaks en CI verde, historial limpio; no verificable: secretos reales en Render |
| 2 | Permisos de BD y RLS | Fallida | **Parcial** | RLS y roles implementados y probados; falta Neon, `FORCE`, RLS en identidad/audit/invitaciones |
| 3 | Autenticación y sesiones | Parcial | **Parcial** | Fail-closed y verificación de correo; clave única JWT/HMAC y enumeración abiertas |
| 4 | Aislamiento y autorización | Parcial | **Parcial → mejor** | Doble barrera (app + RLS); tablas sin RLS y políticas sin distinguir propietario |
| 5 | Inyecciones | Aprobada | **Aprobada** | Sin cambios; CodeQL verde |
| 6 | Rate limiting | Parcial | **Parcial** | Evasión posible por `CF-Connecting-IP` sin firma (N-2) |
| 7 | Dependencias y cadena de suministro | Parcial | **Parcial → mejor** | SHAs, Dependabot, Trivy, monitor; 2 avisos aceptados hasta 2026-11-04 |
| 8 | Endpoints | Parcial | **Parcial → mejor** | Cabeceras, `forbid`, docs off; admin sin cabeceras |
| 9 | Errores, transacciones, idempotencia | Parcial | **Parcial** | 503 por saturación; el `statement_timeout` del worker puede chocar con retención por lotes |
| 10 | Datos sensibles y privacidad | Parcial | **Parcial** | PII de auditoría resuelta; cifrado de columnas pendiente, retención incompleta |
| 11 | Pruebas de login/recuperación/autorización | Aprobada | **Aprobada** | Ampliadas (RLS, verificación, admin) |
| 12 | Pagos | N/A | **N/A** | — |
| 13 | Backups y recuperación | Parcial | **Parcial (insuficiente)** | Sin programación, sin PITR, sin simulacro real, fuera de CI |
| 14 | Responsive y compatibilidad | Parcial | **Parcial** | Solo Chromium |
| 15 | Llamadas API | Aprobada | **Aprobada** | Sin cambios |
| 16 | Rendimiento | Parcial | **Parcial → mejor** | Consumo O(n+m); carga concurrente no re-medida en CI |
| 17 | Accesibilidad | Parcial | **Parcial** | Sin lectores de pantalla |
| 18 | Analytics y privacidad | Aprobada | **Aprobada** | Sin analítica de terceros |
| 19 | Monitorización e incidentes | Parcial | **Parcial (insuficiente)** | Sin DSN, sin alertas, worker sin vigilancia |
| 20 | Legal y cumplimiento | Parcial | **Parcial (bloqueante)** | Borrador; faltan revisión, URL de privacidad, etiquetas de tiendas |

## Riesgos residuales (necesitan aceptación formal de Manuel)
`braces`/`node-forge` hasta 2026-11-04 · `style-src 'unsafe-inline'` · cookie `Path=/` por `__Host-` · `downgrade` destructivos (rollback = restaurar) · una instancia por servicio · reglas de negocio solo en la aplicación (DB-09) · plazos de retención «propuestos».

## Requisitos pendientes antes de producción
1. Crear `erd_app`/`erd_worker` en Neon, repartir URLs, probar con el pooler (`docs/ops/DB_ROLES.md`).
2. Respaldo programado y cifrado hacia bucket externo con ciclo de vida, PITR, **simulacro real** de restauración con procedimiento de re-borrado; mover `backup_pilot.sh` fuera de la política de despliegue.
3. Sentry con DSN, alertas (5xx, latido del worker, cola de jobs), runbook probado.
4. Revisión legal; guarda técnica que impida producción con `status: draft`; URL de privacidad y etiquetas de tiendas.
5. Cabeceras/CSP en `frontend-web/admin`, servicio admin en `render.yaml`, bloqueo del origen directo del API o verificación firmada de IP.
6. Exigir correo verificado para invitar/aceptar; decidir cifrado de `account_number`/dirección; ampliar retención y redacción.
7. QA en dispositivos (Maestro, TalkBack/VoiceOver, OCR con facturas reales); `aapt dump permissions` del APK.
8. Ampliar mypy a auth/RLS/documentos/OCR/worker; cobertura TS.

## Checklist de despliegue
- [ ] Roles de BD creados; `DB_REQUIRE_RESTRICTED_ROLE=true`; `MIGRATION_DATABASE_URL` aparte
- [ ] Migraciones 0024–0031 aplicadas en un paso de release (no al arrancar)
- [ ] `ENVIRONMENT`, `AUTH_ENABLED=true`, claves ≥43 caracteres, CORS HTTPS, secretos solo en el proveedor
- [ ] Respaldo previo verificado **de la base real** (no `backup_pilot.sh`) y rollback = restaurar
- [ ] Sentry/alertas activos; latido del worker vigilado
- [ ] Textos legales aprobados (`status` ≠ draft); retención aprobada
- [ ] CI de `Dev` verde; protección de rama y CODEOWNERS obligatorios en GitHub
- [ ] Revisión de la fecha 2026-11-04 (`braces`/`node-forge`)
