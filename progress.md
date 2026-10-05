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
- El toolchain móvil fue corregido: `npm run test --workspace apps/mobile` pasó 39 pruebas y `npm run typecheck --workspace apps/mobile` pasó; API 68 pruebas, web 35 pruebas/lint/typecheck/build verdes.
- Se consolidó la contabilidad del MVP en `docs/REMAINING_WORK_ORDERED.md`: 13 tareas totales, 7 completadas y 6 pendientes; cuatro tareas completadas adicionales llevan el MVP a 84.6%.

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
- Correcciones TDD en curso con 2 agentes paralelos (deleg_6c784bab): web en apps/web, móvil en apps/mobile, carpetas disjuntas. Pendiente: reverificar gates completos + Maestro iOS/Android tras sus cambios, luego enviar resumen por bot personal.
- Correcciones terminadas y reverificadas por el coordinador sobre el estado final: API 198, core 29, contratos 4, cliente 4, web 100 (+5 omitidas), móvil 174 (+9 omitidas); typecheck, lint, build web producción, contratos y arquitectura OK. Maestro final: Android 77/77, iOS 75/0 fallos (2 opcionales de teclado). Piloto 5/13/13. Servidor :8011 detenido; Metro iOS piloto sigue en :8081.
- Resumen enviado por bot personal (perfil default) a DM telegram:8565144373, message_id 10. No se envió al bot del equipo ni al grupo.
- Fundación auth integrada en canónico mediante 23 archivos revisados (sin conflicto contra baseline), 196 pytest pasan en canónico; auth del piloto NO activada. Generador/OpenAPI actualizado: contratos auth4 tests + typecheck completo verde.
- API autenticada de integración arrancada en http://127.0.0.1:8011, proceso proc_f30b7276ccfc, DB local dedicada energy_rd_auth_integration_test. /health healthy, homes sin token401. Piloto8000 healthy sin cambios. Clientes web/móvil avisados para pruebas reales aisladas.
- Error contracts test desde services/api: npm no encontró workspaces por ruta relativa; reejecutado raíz correctamente. Error dedup read_file en integración: reutilizado archivo ya leído sin imprimir contenido y completada escritura verificada.
