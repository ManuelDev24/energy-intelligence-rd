# Progreso — Planificación Energy RD

## 2026-10-02
- Se inició la planificación del MVP y la asignación de trabajo para tres personas.
- Se verificó el repositorio canónico, rama y estado de Git.
- Se crearon `task_plan.md`, `findings.md` y este archivo.
- Se delegó en paralelo el análisis de especificación, mobile/API y web; se verificaron los puntos centrales en los archivos del repositorio.
- Se creó `docs/SPRINT_PLAN_2026-10-02.md` con alcance de MVP, 21 tareas, branches, dependencias, responsables, criterios de aceptación, calendario y protocolo de Telegram.

## 2026-10-03
- Se verificaron tres PRs reales ya integrados en `ManuelDev24/energy-intelligence-rd`: #1 (base de datos), #2 (dashboard web) y #3 (foundation web).
- La suite API pasó 19 pruebas. GitHub no reportó checks para los tres PRs; la web no pudo ejecutar Vitest porque no está disponible en el entorno local.
- Se cerraron las tres tarjetas iniciales en el tablero `energy-rd` y se asignaron por Telegram tres entregables grandes: `ERD-CORE-API`, `ERD-WEB-SHELL-BILLS` y `ERD-WEB-ENERGY`.
- Se activó el cron de recordatorios de inactividad del perfil `energyrd-team` (job `08f495f5ea02`), probado manualmente sin avisos prematuros; documentación en `docs/TASK_REMINDERS.md`.
- Se verificaron PR #4 (`ERD-CORE-API`) mergeado a `main` y PR #7 (`ERD-MOB-PILOT`) mergeado a `Dev`; API actual: 68 pruebas pasan. El despachador asignó automáticamente `ERD-API-INSIGHTS` a Manuel.
- El toolchain móvil fue corregido: `npm run test --workspace frontend-mobile/app` pasó 39 pruebas y `npm run typecheck --workspace frontend-mobile/app` pasó; API 68 pruebas, web 35 pruebas/lint/typecheck/build verdes.
- Se consolidó la contabilidad del MVP en `docs/REMAINING_WORK_ORDERED.md`: 13 tareas totales, 7 completadas y 6 pendientes; cuatro tareas completadas adicionales llevan el MVP a 84.6%.

## 2026-10-10 — Auditoría del producto completo
- Se verificó `origin/Dev` en `92d39f5`, CI `38082199280` verde y cero PR abiertos.
- Se revisaron plan maestro, API/BD, web, móvil, QA, infraestructura y fases 4–8 en tres auditorías paralelas y comprobaciones directas.
- Se creó `docs/COMPLETE_PROJECT_GAP_ANALYSIS_2026-10-10.md` con 59 paquetes ordenados por dependencia: 19 parciales y 40 no construidos.
- Validación mecánica: numeración 1–59 continua, 59 IDs únicos y `git diff --check` limpio.
- `pygount` no estaba instalado; se omitió el conteo LOC porque no es necesario para el inventario funcional.

## 2026-10-04 — Continuación integral autorizada
- Revalidación ejecutada bajo Node24: npm test/typecheck/lint y build web exit 0. API pytest 134 pasan usando energy_rd_baseline_test; datos piloto no se usan para pruebas destructivas.
- Evidencia: ~/.hermes/cache/scratch/energy-fullscope-20261004/baseline-results.json y baseline-*.log.
- Se inició ERD-AUTH-01/02 en copia aislada: usuarios/sesiones y permisos por vivienda, con pruebas negativas y migración (pendiente recibir/verificar/integrar resultado).
- Se inició ERD-SEC-DEPS en otra copia aislada: auditoría y actualización mínima compatible (pendiente recibir/verificar/integrar resultado).
- Sin commit/push/merge ni despliegue. Claude Code informó loggedIn false; alternativa de agentes disponible aplicada.
- Backend auth recibido: coordinador reejecutó 186 tests sin skips y uv lock --check exit0 en copia; revisión independiente activa, aún no integrado.
- UUID override integrado y validado en canónico; 21 hallazgos altos (braces/node-forge) siguen pendientes upstream. SecureStore SDK57 instalado para auth móvil; pruebas JS/typecheck/lint siguen verdes.
- Clientes web/móvil de auth en copias aisladas en ejecución. Notificación final por bot personal default al DM validado, nunca team/grupo.
- Error de herramienta execute_code/read_file: KeyError content; registro sustituido por escritura directa de informe acotado, sin inventar contenido del trabajador.
- Revisión independiente encontró 3 defectos: logs SQL con hash/email, code404 distinto para vivienda ajena/inexistente, surrogate Unicode password→500. Se reprodujeron con tests RED y corrigieron: hide_parameters, NotFound uniforme, validator UTF-8.
- Clientes auth web (BFF cookies HttpOnly, 89 tests) y móvil (SecureStore, 83 tests) integrados en canónico desde copias; respaldo de archivos previos en ~/.hermes/cache/scratch/energy-fullscope-20261004/canonical-backup-before-clients (40 archivos nuevos listados en NEW_FILES.json). Sin conflictos salvo tsbuildinfo ignorado.
- CI habría fallado en 2 puntos tras integrar; ambos corregidos y verificados: (1) next build de producción falla cerrado sin auth → ci.yml pasa NEXT_PUBLIC_AUTH_ENABLED=true y orígenes HTTPS de marcador; (2) check_architecture rechazaba fastapi en services/auth.py → excepción de dominio Unauthorized (sobre idéntico http_401 + WWW-Authenticate, test RED→GREEN). API 198 pasan, arquitectura y contratos OK.
- Revisión de seguridad web/móvil con Codex CLI (suscripción ChatGPT, solo lectura) en curso: proc_f5be6a46fd37.
- Regresión nativa: Metro relanzado con EXPO_PUBLIC_AUTH_ENABLED=false (obligatorio para el recorrido piloto, documentado en run-smoke.sh); simulador iOS se había apagado y se rearrancó.
- Maestro tras integrar auth: iOS 1ª pasada falló en tapOn keyboard-done porque el simulador rearrancado sin GUI no mostró teclado de software (BillFormScreen usa Field local, no tocado por agentes). Paso marcado optional (intención: cerrar teclado si existe). iOS PASA 75 completados/0 fallos (2 opcionales WARNED); Android PASA 77/77. No hay Simulator.app GUI instalada para forzar teclado; camino con teclado visible quedó probado en las 2 pasadas de las ~11:10 con el mismo BillFormScreen.
- Pantalla de login nativa iOS renderizada contra API aislada :8011 (Metro :8082 auth=true): evidencia docs/qa/evidence/ios-auth-login-2026-10-04.png. Datos piloto intactos 5/13/13.
- Codex 1er intento: límite de uso de suscripción (sin comprar créditos); 2º intento tras ventana en curso (proc_00d954a3527f), adelanta carreras logout (web login tardío reinstala cookies; móvil re-publica authenticated).
- Codex terminó: pedir cambios, 0 críticos, 4 requeridos (web login tardío tras logout; web respuesta de cuenta anterior tras cambio; móvil identidad resucitada tras logout; ambos muestran texto libre del servidor) + 1 opcional (móvil HTTPS fuera de dev). CSRF/SSRF/traversal/cookies/fugas de tokens limpios. Informe en docs/qa/CODEX_AUTH_CLIENT_REVIEW_2026-10-04.md.
- Correcciones TDD en curso con 2 agentes paralelos (deleg_6c784bab): web en frontend-web/app, móvil en frontend-mobile/app, carpetas disjuntas. Pendiente: reverificar gates completos + Maestro iOS/Android tras sus cambios, luego enviar resumen por bot personal.
- Correcciones terminadas y reverificadas por el coordinador sobre el estado final: API 198, core 29, contratos 4, cliente 4, web 100 (+5 omitidas), móvil 174 (+9 omitidas); typecheck, lint, build web producción, contratos y arquitectura OK. Maestro final: Android 77/77, iOS 75/0 fallos (2 opcionales de teclado). Piloto 5/13/13. Servidor :8011 detenido; Metro iOS piloto sigue en :8081.
- Resumen enviado por bot personal (perfil default) a DM telegram:8565144373, message_id 10. No se envió al bot del equipo ni al grupo.
- Fundación auth integrada en canónico mediante 23 archivos revisados (sin conflicto contra baseline), 196 pytest pasan en canónico; auth del piloto NO activada. Generador/OpenAPI actualizado: contratos auth4 tests + typecheck completo verde.
- API autenticada de integración arrancada en http://127.0.0.1:8011, proceso proc_f30b7276ccfc, DB local dedicada energy_rd_auth_integration_test. /health healthy, homes sin token401. Piloto8000 healthy sin cambios. Clientes web/móvil avisados para pruebas reales aisladas.
- Error contracts test desde backend/api: npm no encontró workspaces por ruta relativa; reejecutado raíz correctamente. Error dedup read_file en integración: reutilizado archivo ya leído sin imprimir contenido y completada escritura verificada.

## 2026-10-11 — Módulo 1 (núcleo residencial restante)
- Se implementaron, en orden y con un commit independiente cada una (local en `Dev`, sin publicar): ERD-E2E-PLAYWRIGHT, ERD-SAVE-01, ERD-SCORE-01 y ERD-INT-01. Detalle y evidencia en `docs/qa/ERD-*.md` y `docs/COMPLETE_PROJECT_GAP_ANALYSIS_2026-10-10.md`.
- E2E: suite Playwright (61 pruebas) que levanta PostgreSQL exclusivo (`_e2e`), API, worker y web reales y borra la base al terminar; job `e2e web` añadido a CI (no ejecutado aún en GitHub).
- Migraciones nuevas `0022` (recomendaciones) y `0023` (apagones, con restricción de exclusión contra solapes); ida y vuelta verificadas, sin deriva (`alembic check`).
- Verificación: API 1082 pasan; web 816 (+5 omitidas); móvil 541 (+11 omitidas); core 85; contratos 17; cliente 66; `next build`, `tsc`, `eslint`, contratos y arquitectura OK.
- No ejecutado: flujos Maestro (sin emulador), CI remoto del job nuevo. Las 8 tareas externas (OCR real, Maestro, a11y nativa, release, legal, deploy, observabilidad, DR) siguen abiertas.

## 2026-10-11 — Módulo 2: ERD-ADM-RBAC + ERD-OCR-03 (local en `Dev`, sin publicar)
- Capa administrativa separada de los permisos domésticos: roles/scopes fijos (migración `0024`), auditoría inmutable (triggers `BEFORE UPDATE/DELETE/TRUNCATE`), bootstrap CLI del primer `super_admin` (sin endpoint HTTP), rutas `/api/v1/admin/*`, consola `frontend-web/admin` (Next.js) con BFF de mismo origen y cookies `HttpOnly`/`SameSite=Strict` (nunca tokens en `localStorage`).
- Cola administrativa de OCR (`ERD-OCR-03`, migración `0025`): proyección saneada de estados (`queued/processing/completed/failed_retryable/failed_permanent/dead_letter/cancelled`), reintento idempotente con motivo obligatorio saneado contra patrones de credenciales/PII, fencing por generación para evitar que un resultado tardío del worker pise un reintento o una confirmación.
- Trabajo hecho con delegación en paralelo (implementación + revisión de seguridad independiente + port a `Dev` actual tras detectar que la primera pasada se había basado en un commit local desactualizado) y verificado por el coordinador, no solo reportado por los workers.
- Hallazgos corregidos con prueba RED→GREEN: carrera de revocación del último `super_admin` (dos revocaciones concurrentes podían dejar cero activos), bootstrap que permitía promover un segundo `super_admin` tras el primero, auditoría que marcaba éxito de autorización como si fuera éxito de la operación, filtro `active` que incluía asignaciones vencidas, FK de auditoría que chocaba con la inmutabilidad al borrar la cuenta del actor.
- Bug real encontrado SOLO al ejecutar el E2E Playwright contra el stack vivo (Postgres + FastAPI + Next, no mocks): en `next dev`, `request.url` reporta el host `localhost` aunque el servidor escuche en otro host; el BFF debía confiar en el header `Host`, no en `url.origin`, para el chequeo de mismo origen (si no, todo devolvía 403). Corregido con prueba de regresión.
- Verificación final sobre canónico (tras fast-forward `Dev` a `origin/Dev` `5e761c6`, 53 commits): API 1081 pasan (omitidos solo `test_ocr_prod`/`test_ocr_synthetic_layouts` por falta de la fuente DejaVu en este Mac, no relacionado al cambio); arquitectura y contratos OK; migraciones `0024`→`0025` reversibles; typecheck/lint/test de todos los workspaces OK; build de producción de `frontend-web/app` y `frontend-web/admin` OK; consola admin 17/17 unit + **E2E real 2/2** (usuario normal → 403, admin asigna/revoca/audita/cierra sesión por UI, nunca localStorage).
- Pendiente: revisión legal de retención del `actor_user_id` seudónimo en auditoría; el saneado del campo `reason` es heurístico (no prueba formal de ausencia de PII); CI remoto del job nuevo `frontend-web/admin` no ejecutado en GitHub todavía.

## 2026-10-15 — release web + panel administrativo
- Actualicé refs con `git fetch --prune`; `origin/Dev` avanzó desde la base del worktree anterior `b1d9a9c` hasta `f3cb2f42` (nueve commits). Creé `/Users/macbookpro/Desktop/energy-intelligence-rd-web-release` en ese commit; el worktree anterior se conserva intacto.
- Confirmé en el tree remoto que Claims, Help, Reports/PDF, Copilot móvil, Ahorro, OCR admin, admin summary y usuarios read-only ya existen; no se vuelven a crear ni a marcar como gaps.
- Auditoría inicial de admin muestra ocho scopes actuales y ausencia de pantallas/endpoints para users-write, homes/contracts, bills, tariffs, operations, live system health, AI aggregate analytics y soporte de reclamaciones.
- Siguiente: actualizar baseline de pruebas/CI en el nuevo worktree, portar solo los cambios locales solicitados no integrados (camera/offline/accessibility/cross-browser), construir release E2E y luego cerrar módulos admin en scopes/audit más decisiones de privacidad.
- Bloqueos: no llegó texto legal aprobado, política de visibilidad de vivienda/contrato, política de adjuntos, contacto/owner/SLAs de soporte ni autorización explícita para push/deploy.
- Preparé el worktree `origin/Dev`: `npm ci` y `uv sync --frozen` terminaron bien. Baseline `frontend-web/admin`: 42/42 unit, typecheck y E2E safety 2/2; build pasa con los mismos orígenes HTTPS de marcador de CI. Web: 901/901 unit + 5 omitidos en corrida secuencial; una corrida paralela previo dio un timeout aislado de `pilot-login`, que no reprodujo en focused ni suite completa.
- ERD-WEB-CAMERA-01: test de inputs separado primero falló como esperado, luego verde (7/7); controles explícitos `Tomar foto` (`accept=image/*`, `capture=environment`) y `Elegir foto o PDF`. E2E actualizado a selectores accesibles.
- ERD-WEB-OFFLINE-UX-01: aviso usa `useSyncExternalStore`, no desmonta contenido; React Query revalida lecturas al reconectar y ejecuta mutaciones en modo inmediato con `retry:false`, sin replay. Tests focused 13/13. E2E real offline/reconnect añadido, pendiente ejecutar.
- ERD-WEB-CROSS-BROWSER: proyectos Playwright para Chromium (suite), Firefox, WebKit, Pixel 7 e iPhone 13; spec nuevo cubre reflow 320/375/640(proxy zoom 200%)/768/1280, foco por teclado y red lenta con respuesta retenida. CI instala los 3 motores. `playwright --list` detecta 98 tests en 5 proyectos; aún falta ejecutar.
- OCR/fonts focused **39/39**, API complete **1363 passed**, web unit **904 passed / 5 skipped**; typecheck de workspaces, lint web y build web de producción OK. Playwright E2E local integral final **104/104 passed in 5.6m** against PostgreSQL/API/worker/BFF. It covers the full registration→profile route, all 16 cross-browser/mobile emulation smoke, axe/reflow and offline reconnection. No staging/physical-device/manual screen-reader acceptance.
- ERD-ADM-USERS-WRITE implementado localmente (migración 0043, antes 0038, API, BFF, scopes y UI `/solicitudes`/ficha). Solicitudes no ejecutan exportación ni borrado; cierre de sesiones/desactivación exigen motivo, auditoría y guards. API **1363 passed**; admin **48 unit**, E2E **13/13** con axe/responsive. La revisión externa encontró que la cola mostraba controles a lectores sin scope de gestión; se ocultaron y añadieron pruebas para lectores/operadores. Build, typecheck, contracts, arquitectura y diff-check OK. Evidencia: `docs/qa/ERD-ADM-USERS-WRITE.md`.
- Continúan decisiones/bloqueos: privacidad de viviendas/contratos y facturas, retención, contacto/SLA/adjuntos, costos Copilot aprobados, términos legales, staging/dominio/TLS. Sin datos reales, commit, push ni despliegue.
