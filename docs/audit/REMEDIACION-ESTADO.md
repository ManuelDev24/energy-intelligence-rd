# Estado de la remediación de la auditoría (Prompt 09)

Informes originales: `AUDIT-00-RESULTADO-CONSOLIDADO.md` y `AUDIT-01…08`. Cada corrección es un commit `[AUDIT-C-xx]` en `Dev`
(sin push hasta autorización expresa) con su prueba de regresión. «Verificado» = comprobado en el entorno de la sesión.

| ID | Estado | Qué se hizo / qué falta |
|---|---|---|
| C-01 | **Hecho (código y pruebas)**; pendiente externo | RLS + roles `erd_app`/`erd_worker` (migración 0027, matriz de pruebas, E2E con roles restringidos). **Falta en Neon:** crear los roles y repartir URLs según `docs/ops/DB_ROLES.md`; el arranque con `DB_REQUIRE_RESTRICTED_ROLE` falla si no se hace. No hay `FORCE RLS` (el dueño de las tablas lo ignora; las migraciones usan `MIGRATION_DATABASE_URL`). |
| C-02 | Hecho | `POST /bills/ocr` retirado; handlers de subida `def`; regla de arquitectura contra `async def` sin `await`. |
| C-03 | Hecho | `AUTH_ENABLED` por defecto encendido; `ENVIRONMENT` explícito obligatorio. |
| C-04 | **Externo** | Revisión legal (Ley 172-13) de textos y retenciones. |
| C-05 | **Externo (parcial)** | Falta DSN de Sentry/alertas y simulacro real de restauración (Neon + bucket). |
| C-06 | Hecho | CSP con nonce y `strict-dynamic`, cabeceras de seguridad; verificado en build de producción y E2E. |
| C-07 / C-09 | Hecho | `/docs` solo en desarrollo; cabeceras en la API; sin token en el log de acceso. |
| C-08 | Hecho | Topes de cuerpo (413), timeouts de BD, pool agotado → 503 `service_busy`, Argon2 acotado. |
| C-10 | Hecho | Verificación de correo (0029); sin verificar no se envían avisos; web, móvil y E2E. |
| C-11 / C-12 | Hecho y **verificado en GitHub** (2026-10-12, commit `6aed471`) | Permisos mínimos, acciones por SHA, CodeQL (python y js/ts), gitleaks, Trivy + SBOM, Dependabot, CODEOWNERS, SECURITY.md, imagen. Security #1: 4/4 jobs verdes. |
| C-13 | Hecho | Consumo O(n+m): «12 meses» 600→39 ms (p50). |
| C-14 | Hecho (config) | Sin `RECORD_AUDIO`, textos iOS en español, `allowBackup` apagado. Falta probarlo en dispositivo. |
| C-15 | Hecho; decisión pendiente | Auditoría con autor y sin PII, retención escrita (`docs/security/DATA_RETENTION.md`). **Pendiente:** decidir cifrado de columna de `account_number`/dirección (DB-03). |
| C-16 | Hecho | `UNIQUE (lower(email))` (0026). |
| C-17 | Hecho (cobertura 97 %, umbral 92 %) | ruff, mypy gradual y `pytest-cov` en CI. |
| C-18 | **Cerrado** | El job `e2e web (Playwright vs PostgreSQL + API + worker reales)` pasó en GitHub Actions (CI #59, commit `6aed471`, 4/4 jobs verdes: api con cobertura, web+core, recorridos vs API real y e2e web). |
| C-19 | **Externo** | Plan de staging y RTO/RPO. |
| C-20 | **Hecho** | `parse_bill_text` partido en pasos; `bff.ts` 549→389 líneas (rutas/esquemas a `bff-routes.ts`). Fechas RD unificadas en `packages/core/src/rdTime.ts` (2026-10-13; antes había tres copias). Interfaz `Api` web dividida en 12 interfaces por recurso (`lib/api/types.ts`) y ciclo `equipment↔recommendations` eliminado (`shares_pct` → `calculations.py`), ambos 2026-10-13. **C-20 queda completo.** |
| C-21 | Hecho (parcial) | `limit/offset` en documentos, `extra="forbid"` en las entradas restantes, modelo de roles documentado (`services/api/README.md`). **Sin hacer:** reflejar límites decimales en OpenAPI (F06-08). |
| C-22 | Hecho | `safeHttpUrl` para `source_url`. |
| C-23 | **Sin hacer** | Cookie `Path=/` (exigido por `__Host-`), clave única JWT/HMAC (el bucket anti-abuso ya separa dominio por prefijo), enumeración en registro, IP tras proxy en el despliegue. |
| C-24 | Hecho (parcial) | Índices de 11 FKs (0030), tope de viviendas por persona (`MAX_HOMES_PER_USER`), `code` ajeno ignorado con cuentas, política expand/contract en `docs/deploy/DEPLOY_GUIDE.md`. **Sin hacer:** triggers de reglas de negocio (DB-09, decisión documentada). |
| C-25 | **Externo** | WebKit/Firefox, dispositivos, TalkBack/VoiceOver, Maestro, OCR con facturas reales. |
| C-26 | Hecho (parcial) | README al día, workspace `mcp/*` fuera, `.nvmrc`. **Sin hacer:** `.agents/` y 149 capturas versionadas (decisión de limpieza de historial). |
| C-27 | **Externo, con fecha** | `braces` y `node-forge` siguen sin parche (comprobado 2026-10-12); revisar antes del **2026-11-04** o el monitor semanal fallará. |

Siguiente paso: auditoría independiente (Prompt 10) y decisión Go/No-Go de Manuel.
