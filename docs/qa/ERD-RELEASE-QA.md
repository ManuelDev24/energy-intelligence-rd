# ERD-RELEASE-QA — verificación previa a la promoción (2026-10-11)

**La promoción `Dev → QA → main` la decide y ejecuta Manuel** (`docs/WORKFLOW_RULES.md`). Este documento solo reúne la evidencia.
Rama verificada: `claude/elegant-ptolemy-sdr69r` (no se ha abierto PR). **GitHub Actions no se ha ejecutado sobre estos commits**:
lo de abajo se corrió localmente replicando los pasos del workflow.

## Resultado de las suites (local, contra PostgreSQL 16 real)
| Comprobación | Resultado |
|---|---|
| API `pytest` (incluye migraciones ida y vuelta, autorización por ruta, almacenamiento, jobs, OCR, anomalías, alertas, equipos) | **923 pasan** |
| `scripts/check_architecture.py` (los servicios no importan FastAPI) | pasa |
| `npm run contracts:check` (contratos generados sin deriva) | pasa |
| `packages/core` / `api-contracts` / `api-client` (vitest) | 63 / 17 / 52 pasan |
| `apps/web` vitest (sin API) / con `LIVE_API_URL` contra API piloto real | 765 pasan (5 omitidas) / **770 pasan, 0 omitidas** |
| `apps/mobile` vitest (sin API) | 521 pasan (11 omitidas: recorridos que piden API) |
| `apps/mobile` recorridos `src/e2e` contra API piloto (:8000) y API con auth (:8011) | **10 pasan**, 1 omitida (la sonda de Fase 2 que CI también omite) |
| `tsc --noEmit` web, móvil, api-client, core | sin errores |
| `eslint` web | sin avisos |
| `next build` (web, con las variables de marcador del CI) | compila |
| `expo export --platform android` (Metro) | empaqueta |
| `infrastructure/deploy/check_deploy_config.py` | 0 errores, 0 avisos |
| `pip-audit` sobre las dependencias exportadas de la API | sin vulnerabilidades conocidas |
| `scripts/audit-monitor.mjs --offline` (npm) | OK: 20 altas, todas aceptadas, vigentes y **sin parche publicado** (revisión hasta 2026-11-04) |

## Un fallo real que esta corrida encontró (corregido)
Los recorridos piloto fallaban al hoy (2026-10-11): ALERT-02 añadió alertas por el paso del tiempo (factura faltante) y el recorrido
afirmaba «ninguna alerta» tras descartar la crítica. Era una prueba frágil a la fecha, no un fallo del producto. Se corrigió en
`pilotFlow.e2e.test.ts` (solo mira alertas de variación) y en `maestro/pilot-flow.yaml` (verifica que desaparezca la crítica); se
documentó en `DEMO_GUIDE.md`. **Sin esta réplica local del job de CI, GitHub Actions habría fallado.**

## NO verificado (no hay forma desde este entorno)
| Qué | Por qué | Quién |
|---|---|---|
| CI de GitHub Actions en verde sobre estos commits | no se ejecuta aquí | Manuel (al abrir el PR) |
| Maestro iOS/Android (`pilot-flow`, `auth-flow`), VoiceOver/TalkBack, push en teléfono | sin simuladores ni dispositivos | quien tenga los equipos |
| `docker compose up` desde un clon limpio (sección 4 del checklist) | sin demonio de Docker | Manuel |
| OCR con facturas reales (EDESUR/EDENORTE/EDEESTE) | no hay facturas anonimizadas | Manuel (`docs/qa/OCR_REAL_QA.md`) |
| Despliegue (Render, Neon, bucket real, Resend, EAS, TLS), Sentry/APM, PITR | requieren cuentas | propietario |
| Revisión legal | requiere asesoría | propietario |
| Calibración de umbrales de anomalías/alertas con datos reales | no hay datos | tras el piloto |

## Estado por criterio del plan de cierre
Todo lo que es **código y se puede probar en local** está hecho y probado. Lo pendiente es, sin excepción, de cuentas, dispositivos,
datos reales o personas (lista arriba). La checklist `docs/RELEASE_CHECKLIST.md` queda actualizada (§5b) para quien promueva.

## Actualización 2026-10-11 (tarde): simulaciones
Se añadieron un simulacro local del despliegue (17/17), el autoensayo de respaldo (10/10), 7 pruebas de facturas sintéticas con Tesseract real y
Sentry web contra un servidor local (7/7). Detalle, límites y qué NO cierran: `docs/qa/ERD-SIMULACIONES-2026-10-11.md`. El CI de GitHub sigue
sin haberse ejecutado sobre estos commits.
