# Energy RD — Plan de entrega

## Objetivo
Crear un backlog verificable y una asignación de trabajo para el MVP de Energy RD durante el fin de semana del 2–4 de octubre de 2026 y la semana del 5–11 de octubre de 2026.

## Alcance de esta planificación
- Propietario: app móvil Expo/React Native y base de datos/backend.
- Compañero A y Compañero B: aplicación web Next.js.
- Entregable: tareas con dependencias, branches, criterios de aceptación y responsable; no se implementa funcionalidad en esta fase.

## Fases
- [x] 1. Crear archivos de planificación y verificar estado del repositorio.
- [x] 2. Inventariar implementación, documentación y pruebas actuales.
- [x] 3. Definir el MVP alcanzable para las próximas dos ventanas.
- [x] 4. Descomponer y asignar tareas por dependencias.
- [x] 5. Guardar backlog y verificar su coherencia.

## Decisiones registradas
- El repositorio canónico es `/Users/macbookpro/Desktop/energy-intelligence-rd`.
- El MVP no incluye integraciones de hardware/IoT, solar en tiempo real ni IA conversacional autónoma; quedan como fases futuras salvo evidencia contraria en la especificación.
- La coordinación se enviará después mediante `@energyrd_team_bot`; el tablero/documento será la fuente de verdad.

## Continuación del plan integral — 2026-10-04
Fuente de alcance: `docs/PLAN_COMPLETO_ENERGY_RD.md`; conservar fases futuras sin marcarlas completas por construir esqueletos.

- [x] Fase 0: revalidar tests JS/API, typecheck, lint y build (todos con exit 0; API 134, JS core29/contracts2/client4/web68/mobile57; 13 integraciones JS omitidas).
- [ ] Fase 0: auditoría y corrección de dependencias (agente en copia aislada).
- [ ] Fase 0: inventario de cambios y agrupación por tareas; commit/push requieren confirmación explícita.
- [x] Fase 1: backend usuarios, sesiones, Argon2/JWT, permisos por vivienda y pruebas de aislamiento (fundación integrada, 196 tests pasan; recuperación/privacidad/abuso pendientes).
- [x] Fase 1: clientes y pantallas de autenticación web/móvil (BFF cookies HttpOnly + epoch; SecureStore + epoch; errores locales; HTTPS en release). Revisión Codex: 4 requeridos + 1 opcional corregidos con TDD. Pendientes reales de Fase 1: recuperación de contraseña/email, privacidad/borrado de cuenta (ERD-AUTH-03), rate limiting, despliegue (ERD-DEPLOY-01).
- [ ] Fases 2–4: avanzar por contratos verificables (lecturas/tarifas → OCR confirmado → ahorro/score → Copilot).
  - 🔄 Fase 2, tramo 1 (backend): migración 0007 lecturas/objetivos/tarifas, API de lecturas, consumo día/semana/mes desde lecturas (REAL/ESTIMATED), objetivos con progreso, motor de tarifas sin valores sembrados (deleg_a44ab80c). Respaldo: ~/.hermes/cache/scratch/energy-phase2/backup-before-phase2.tgz.
  - 🔄 Investigación tarifas oficiales SIE con fuentes vía Codex (proc_7e5c95b643c8). Solo se cargarán valores con URL/resolución verificada.
  - ✅ Tarifa BTS-1 oct–dic 2026 verificada: Codex localizó SIE-121-2026-TF pero no leyó el PDF escaneado; el coordinador lo descargó, renderizó y transcribió p9–11 visualmente. Valores, regla de bloques (≥701 kWh todo al 4º rango; cargo fijo 0–100 vs ≥101) y ejemplos de control en docs/architecture/TARIFF_BTS1_2026Q4.md. Agente backend corregido en caliente (steer) para modelar esa regla y cargarla en migración de datos 0008.
  - ⏭ Tramo 2: clientes web/móvil (pantalla Consumo con filtros, registrar lectura, objetivo), después onboarding y perfil.
  - ✅ Tramo 1 backend verificado por coordinador: 333 pytest, contratos/arquitectura OK; verificación independiente de tarifa cargada en BD vs PDF: 48/48 (3 distribuidoras × 16 consumos, bordes 100/101…700/701), fuera de vigencia → tariff_unavailable.
  - ✅ Cliente compartido (packages/api-client) ampliado por coordinador con TDD: lecturas, consumo, meta, progreso, tarifas (8 tests RED→GREEN; 12 total), typecheck OK.
  - ✅ Tramo 2 UI entregado (deleg_75fe49af): web BFF + Consumo + lecturas + meta; móvil tab Consumo + lecturas + meta con fallo suave en piloto. Verificación independiente: core29/contratos7/cliente12/web193/móvil245; typecheck/lint/build web OK, integración web Fase2/auth PASS, móvil e2e 2/2. Evidencia: docs/qa/ERD_PHASE2_COORDINATOR_2026-10-04.md. Sin commit/push.
  - ✅ QA nativo del tramo lecturas/consumo/metas cerrado (deleg_7d328ba0): dos recorridos consecutivos aprobados por plataforma; 4 flujos/112 aserciones-esperas comprobados por coordinador en JUnit/qa-summary y capturas Android/iOS revisadas. Corrección iOS textContentType=password para registro. Móvil245/11 omitidas y typecheck completo reejecutados limpios. Reporte: docs/qa/ERD_PHASE2_NATIVE_2026-10-04.md. Onboarding/perfil y resto de Fase 2/roadmap continúan pendientes; no cierre integral.
  - ⚠️ API piloto Docker :8000 corre código anterior (sin endpoints Fase 2). Para Maestro de Fase 2 hará falta una API con código nuevo; no migrar BD piloto sin avisar.
- [ ] Fases 5–8: administración/informes, integraciones y datos reales; no inventar telemetría ni tarifas.

Notificación de cierre del tramo enviada y confirmada por Hermes: perfil default, Telegram privado `8565144373`, `message_id=14`, `success=true`, `mirrored=true`. El aviso distingue el tramo lecturas/consumo/metas terminado del roadmap integral pendiente.
Aviso de avance (onboarding/perfil, abuso auth, ERD-BILL-02) enviado: `message_id=33`, `success=true`, mismo DM personal. No es cierre integral.

Notificación de cierre solicitada: enviar resumen final VERIFICADO por el bot personal del perfil default (`@hermes_ysvvetpxp7mrxoba_bot`) al DM `telegram:8565144373` con `hermes -p default send --to telegram:8565144373 --json ...`. Ruta validada con getMe/getChat (chat privado). No enviar al bot energyrd-team ni a grupos. No anunciar todo terminado si solo se completa una fase; distinguir hecho/bloqueado/pendiente y guardar ID real del mensaje enviado.

Restricciones: no tocar datos de producción, gateway ni otros perfiles; no push/merge/borrado/gasto sin confirmación. Mantener piloto operativo durante la implementación en copia aislada.
Bloqueo detectado: Claude Code informa `loggedIn: false`; usar agentes disponibles sin configurar API de pago ni bloquear la implementación.

## Continuación solicitada tras detener procesos
- ✅ Metro piloto8081, API integración8011 y emulador Android anteriores detenidos; comprobación puertos8081/8011/8083/8084 libres e iOS sin dispositivos booted.
- ✅ Descubrimiento: onboarding y migración0009 YA existen en árbol actual, aunque el resumen previo los trataba pendientes. Baseline reejecutado: core29/contratos7/cliente12/web218+5skip/móvil254+11skip, typecheck completo exit0. No rehacer lo existente; cerrar huecos y verificar.
- 🔄 Nueva unidad deleg_6a06b5dd: web onboarding/perfil (apps/web), móvil onboarding/perfil con flags triestado (apps/mobile), backend protección persistente contra abuso auth (services/api). Carpetas disjuntas; sin packages compartidos, instalaciones, commits, servidores/emuladores persistentes ni cambios piloto.
- ✅ Implementación deleg_6a06b5dd recibida: onboarding/perfil web y móvil, flags triestado y guardados con GET; backend rate limiter persistente atómico y migración0010. Reejecución independiente core29/contratos7/cliente12/web240+5skip/móvil279+11skip/API364+warning previo; typecheck/lint/build web/contratos/arquitectura/diff-check exit0.
- ⚠️ Revisión deleg_c6d326f2: REQUEST CHANGES, cuatro Required reproducidos R1/R2/R4 móvil y R3 BFF Retry-After; ningún Critical identificado. Informe docs/qa/ERD_ONB_PROFILE_ABUSE_REVIEW_2026-10-04.md.
- ✅ R3 corregido por coordinador con RED→GREEN: BFF conserva Retry-After429 validado1..86400 sin headers/cookies arbitrarios; web258+5skip,lint/typecheck exit0.
- ✅ R1/R2/R4 móvil corregidos y revalidados por coordinador: PATCH efectivo parcial+untouched actualizado; contrato canonical/dirty versionado; invalidación goal-progress origen. Suite móvil286+11skip/web258+5skip/shared29/7/12, harness componentes7/7,typecheck/lint/build web/diff-check exit0. R3 BFF corregido previamente. Sin aceptación live/visual/nativa todavía; puertos anteriores apagados.
- ✅ ERD-BILL-02 backend recibido y verificado por coordinador: API 403 passed (warning previo), arquitectura OK. bill_items + validate read-only (approval not_performed) + snapshots inmutables/legado "origen desconocido", migración0011. Ver services/api/BILL_DETAIL_VALIDATION.md.
- ✅ Coordinador: contratos regenerados (generador soporta dict libre y maxItems; 3 tests RED→GREEN) y cliente compartido getBillItems/putBillItems/assessBill con verificación bill_id (4 tests RED→GREEN). JS: core29/contratos10/cliente16/web258+5/móvil286+11; typecheck/lint exit0. Nota: BillCreate/Update ahora rechazan campos extra (422), documentado.
- ✅ UI ERD-BILL-02 recibida (deleg_b7df891c) y reverificada por coordinador: web351+5skip / móvil324+11skip / core29 / contratos10 / cliente16; typecheck, lint, build web, contratos --check, diff-check exit0; hashes pilot-flow/phase2-flow intactos; puertos cerrados. Docs apps/web/BILL_DETAIL_UI.md y apps/mobile/BILL_DETAIL_UI.md.
- ✅ Revisión ERD-BILL-02 (deleg_2e0574f2): 0 Critical, 3 Required corregidos por coordinador con RED→GREEN (TRUNCATE snapshots, caché tras PUT con fallo posterior web+móvil, texto historial). Gates finales: API404, contratos OK, arquitectura OK, web353+5/móvil327+11/core29/contratos10/cliente16, typecheck/lint/build/diff-check exit0. Optional/FYI abiertos en docs/qa/ERD_BILL_02_REVIEW_2026-10-04.md. Pendiente live/visual/nativo.
- ⏭ Tras revisión/correcciones: QA temporal aislado si necesario, detener al finalizar. Aviso personal Telegram al cierre verificado; no publicar sin autorización.
- ✅ Publicado por orden del owner: 6 commits en `Dev` (990acb2…cf14cc6), push sin force; PR #15 Dev → main https://github.com/ManuelDev24/energy-intelligence-rd/pull/15. Evidencia Maestro cruda/logcat excluida por .gitignore (solo corridas finales). CI remoto inicialmente falló (e2e piloto móvil: __DEV__/expo-secure-store en Node); corregido en cf14cc6 y reproducido localmente (web 358/358 vs API real, móvil 8/8). CI final: 3 jobs × push y PR = pass; PR MERGEABLE. Merge NO realizado (requiere confirmación).

## Riesgos
- El árbol de trabajo ya tiene cambios no versionados y cambios en documentación; este análisis no los modifica.
- Los nombres, capacidades y horas de los dos compañeros aún no están confirmados; se usan roles Compañero A/B hasta que se definan.
- ✅ 2026-10-05 PR #15 fusionado en main por el owner (b7e54a4). Dev local fast-forward a main (sin push).
- ✅ [ERD-CI-01] ci.yml: uvicorn desde .venv con PID + paso `if: always()` que detiene APIs (causa del timeout `uv cache prune`); nueva API auth :8011 en BD `energy_rd_auth_ci` con clave aleatoria enmascarada; e2e móviles auth+Fase2 dejan de omitirse. Repro local: 3/3 passed, puerto cerrado, BD desechable borrada. Sin commit.
- ✅ [ERD-SEC-DEPS] 21 altos = 2 paquetes sin parche publicado (braces 3.0.3, node-forge 1.4.0; solo build/dev). Propuesta de aceptación de riesgo en docs/qa/ERD_SEC_DEPS_2026-10-04.md, pendiente firma owner.
- 🔄 [ERD-AUTH-03] backend delegado (deleg_4a44f4e2) en copia ~/.hermes/cache/scratch/erd-auth-03/backend (manifest + backup). Luego clientes web/móvil (accept_terms, eliminar cuenta), revisión independiente, verificación propia.
- ⛔ Requiere owner: proveedor de email (recuperación de contraseña), proveedores/cuentas de despliegue, firma de riesgo de dependencias, texto legal final.
- ✅ 2026-10-05 Push a Dev (sin force): f10d42c [ERD-CI-01], 101ccc2 [ERD-SEC-DEPS] docs, 7da15c8 [ERD-CI-01] (quita sonda piloto antigua, válida solo en local). Run 37297090598: 3 jobs success; web 358; e2e móvil piloto 8 + auth 1 + Fase 2 1 (1 skip = sonda local); sin procesos uv/uvicorn huérfanos.
- ✅ [ERD-AUTH-03] backend integrado en canónico (26 archivos, respaldo en scratch/erd-auth-03/canonical-backup-before-backend). Verificado por coordinador: API 435, contratos --check exit0, arquitectura OK, contratos 14, cliente 25, typecheck exit0, web 353+5, móvil 327+11. ⚠️ No publicar aún: el registro web/móvil sin accept_terms daría 422 contra esta API.
- 🔄 deleg_15e3868b: web (copia), móvil (copia), revisión independiente backend (solo lectura).
- ✅ [ERD-AUTH-03] web+móvil integrados sin conflictos (respaldos canonical-backup-before-{web,mobile}). Revisión: 0 Critical; R1 corregido RED(429)→GREEN; R2 = falta transferencia de propiedad (nueva ERD-AUTH-04). Maestro phase2-flow marca auth-accept-terms; pilot-flow hash intacto (a7141ac6…).
  Gates: API 436, contratos --check 0, arquitectura OK, core29/contratos14/cliente25/web374+5/móvil341+11, typecheck/lint/diff-check 0, build web CI-env 0, export iOS/Android 0.
  Live (API :8011 + next dev :3011, BD desechable borrada, puertos cerrados): borrado vía BFF PASS (legal, 422 sin términos, 201, 403 sesión intacta, 204, cookies borradas, 401 after), verify_auth_bff PASS, verify_phase2_bff PASS, e2e móvil auth+Fase2 3/3.
  Pendiente: QA visual/nativa (Maestro sin ejecutar), texto legal final. Sin commit.
- ✅ 2026-10-05 Decisiones delegadas por el owner ("elige la mejor opción"):
  - Email: Resend (Free 3.000/mes, 100/día → Pro US$20 al crecer). Requiere dominio propio con SPF/DKIM.
  - Despliegue: Render (API Docker + web Next.js, región Virginia) + Neon (proyecto existente, misma región us-east) + EAS (móvil) + Sentry Free. Staging gratis (Render Free duerme a los 15 min); producción ≈ US$14 Render Starter×2 + Neon Launch por uso (~US$5–25). Vercel descartado para producción: Hobby prohíbe uso comercial y Pro cuesta US$20.
  - Dependencias braces/node-forge: aceptar riesgo (solo build/dev, sin parche), revisar 2026-11-04.
  - ERD-AUTH-04 (transferencia) depende de compartir viviendas (no existe alta de miembros; 409 inalcanzable hoy): se mueve junto a ERD-SHARE-01.
  - No se crea cuenta ni se gasta nada sin confirmación del owner.
- 🔄 Siguiente: ERD-AUTH-05 recuperación de contraseña (backend con backend de email intercambiable: console en dev, Resend en prod) + ERD-DEPLOY-01 preparación (blueprint Render, eas.json, guía, checklist de variables) en paralelo.
- ✅ [ERD-AUTH-05] backend integrado (28 archivos, sin conflictos; respaldo scratch/erd-auth-05/canonical-backup-before-backend). Coordinador: API 505, contratos --check 0, arquitectura OK, uv lock --check OK, core29/contratos16/cliente32/web374+5/móvil341+11, typecheck/lint/diff-check 0. Sin commit.
- ✅ [ERD-DEPLOY-01] preparado sin desplegar: render.yaml (staging Dev Free / prod main Starter, Virginia, preDeploy alembic), apps/mobile/eas.json, docs/deploy/{DEPLOY_GUIDE,ENV_CHECKLIST}.md, infrastructure/deploy/check_deploy_config.py (0 errores 0 avisos tras integrar AUTH-05), entrypoint con ${PORT}. docker build verificado por el worker. Sin commit.
- 🔄 deleg_56911894: UI recuperación web (BFF + /olvide-contrasena + /restablecer-contrasena) y móvil (olvidé contraseña; reset vía enlace web).
- ⛔ Bloqueante prod ERD-SEC-PROXY-01: detrás de Render+Cloudflare la API ve IP de proxy y, vía BFF, todos los usuarios web comparten bucket. Render solo AÑADE a X-Forwarded-For (spoofable). Diseño: API lee CF-Connecting-IP (Cloudflare lo fija y rechaza el del cliente) con setting CLIENT_IP_SOURCE=socket|cf-connecting-ip; BFF reenvía la IP del navegador en cabecera firmada HMAC (secreto compartido BFF↔API, con timestamp) que la API solo acepta si la firma es válida. Hacer tras la UI de recuperación (toca bff.ts).
- ✅ [ERD-AUTH-05] correcciones de seguridad integradas (revisión Critical+Required):
  - C1 (login con contraseña antigua tras reset): auth.py relee el hash bajo lock antes de emitir sesión.
  - R1 (borrado de cuenta con contraseña obsoleta tras reset): account.py revalida el hash bajo lock.
  - R2 (deadlock purga↔borrado): purga de tokens vencidos en transacción independiente, commit antes de bloquear al usuario.
  - R3 (reset tardío borraba sesión de otra cuenta en el navegador): BFF ya no limpia cookies/epoch en el 204 público; servidor revoca solo las sesiones de esa cuenta, el 401 normal cierra sesión local. Página de reset añade guardia de montaje/generación.
  Gates: API 510 (+5 regresión real PostgreSQL con deadlock reproducido y corregido), web 469 (+9), typecheck/lint/diff-check 0.
  Live re-verificado con API+BFF reales (puertos 8041/3041, BD desechable borrada): sesión B intacta tras reset tardío de A, A no puede reusar contraseña vieja. Dos subagentes de la ronda anterior fueron limitados por cuota de Anthropic tras aplicar ya los cambios; completé manualmente lo que faltaba (log GREEN de R2, integración, re-verificación en vivo).
  Pendiente (no bloqueante para commit): O1 cliente móvil valida solo estado HTTP de forgot, no el cuerpo; límite de intentos por IP compartido detrás de Render (ERD-SEC-PROXY-01, ya identificado); QA visual/nativa.
- 🔄 deleg_76cdc4b5 (3 en paralelo): ERD-SEC-PROXY-01 (IP confiable detrás de Render), O1 móvil (validar cuerpo de forgotPassword), QA visual real (capturas de pantalla) de onboarding/perfil/factura/recuperación.
- ✅ ERD-SEC-PROXY-01 integrado y verificado: client_ip.py (firma HMAC ±60s), CLIENT_IP_SOURCE=cf-connecting-ip con fallback a socket logueado, BFF firma X-Forwarded-Client-Ip. Ajuste propio: BffConfig.bffApiSharedSecret opcional (el worker no tocó los demás tests de bff.ts que construían el literal). Modelo de amenaza: depende de que Cloudflare esté delante de Render (documentado, no es confianza universal en cabeceras).
- ✅ O1 móvil corregido: forgotPassword valida PasswordForgotAcceptedSchema del cuerpo, no solo el 202.
- ✅ QA visual real (capturas Chrome headless, cuenta/vivienda/factura reales vía BFF) de onboarding/perfil/factura/recuperación: 8 hallazgos. Corregí los 3 no triviales (TDD real, no cosmético):
  · Ubicación vacía en onboarding no daba ningún feedback (validación nativa HTML bloqueaba el submit antes de que corriera el mensaje en español ya escrito) → `noValidate` en el form.
  · `/account` mostraba "La recuperación de contraseña no está disponible" (falso, ERD-AUTH-05 ya la implementa) → enlace real a /olvide-contrasena.
  · Tras un reset exitoso, el login mostraba a la vez "¡restablecida!" en verde y "La sesión venció" en rojo → se suprime el error de sesión cuando viene de un reset propio (prop `suppressSessionError`).
  5 hallazgos de baja severidad (contraste de botones, mensajes de éxito poco visibles, layout del wizard, indicador dev de Next.js) quedan documentados sin corregir, cosméticos.
  Gates finales repo completo: API 541, core 29, contratos 16, cliente 32, web 476 (+3 regresión), móvil 365, typecheck/lint/diff-check 0.
  Pendiente: QA visual/nativa en simulador (no se arrancó, se priorizó web); los 5 hallazgos de baja severidad.
- ✅ CH-02/CH-03 backend (sin commit): ConsumptionOut gana `estimated_cost` (RD$, usa tariffs.estimate_cost con la tarifa vigente de la vivienda; None si falta total o no hay tarifa, con motivo en insufficient_reasons) y `comparison` (vs. período inmediatamente anterior de igual longitud; kwh_pct None si el período anterior fue 0). Ambos con default None (patrón de la skill, pilot sin reconstruir sigue funcionando). RED→GREEN real: 6 pruebas nuevas en test_api_consumption.py (20 en el archivo). De paso corregí un bug mío de sed que rompía una fecha en un test preexistente (restaurado).
  Gates: API 547, contratos --check 0, arquitectura OK, contratos JS 16 (arreglé un fixture a mano que no incluía los campos nuevos), cliente 32, web 476, móvil 365, typecheck/lint/diff-check 0.
- 🔄 deleg_33c68cd0: UI web y móvil para mostrar costo estimado y comparación en la pantalla de Consumo.
- ✅ CH-02/CH-03 UI integrada y verificada (sin commit): web añade tarjeta "Costo estimado" y comparación con el período anterior (flecha + % o delta en kWh, reutilizando el componente/colores existentes de MetricCard; nada si no hay comparación). Móvil añade la misma fila de costo y una nota de comparación con los mismos tonos que "metas" (warning=sube, success=baja). Lógica de formato en función pura con tests.
  Gates finales repo completo: API 547, core 29, contratos 16, cliente 32, web 481 (+5), móvil 369 (+4), typecheck/lint/diff-check 0, export iOS/Android OK.
  Pendiente: botón "Comparar" explícito (se decidió mostrar la comparación automáticamente, sin ese control); QA visual/nativa real de estas pantallas nuevas.
- ✅ ERD-OCR-01 backend (sin commit): `POST /homes/{home_id}/bills/ocr` (multipart, Tesseract spa+eng,
  parser puro `parse_bill_text` con confianza high/inferred/none y advertencias en español). "Nunca OCR
  → DB": solo devuelve un borrador; el único camino real sigue siendo el POST /bills ya existente.
  RED→GREEN: 7 pruebas del parser + 3 de integración del endpoint (multipart real con imagen renderizada).
  Corregí también el inventario cerrado de rutas (test_authorization.py) para que siga cubriendo la ruta
  nueva con auth real (401/404), no solo agregarla sin probar.
  Gates: API 557 (+10), contratos --check 0 (agregué OcrDraft a MODELS, faltaba), arquitectura OK,
  web 481/móvil 369 sin regresión, typecheck/lint/diff-check 0.
  Pendiente documentado: sin storage (imagen se procesa en memoria y se descarta), sin worker/cola,
  sin QA con fotos reales de facturas dominicanas. Ver services/api/OCR_BILL_UPLOAD.md.
- 🔄 ERD-OCR-02 UI integrada sin commit: web añade selección de foto, POST multipart OCR, borrador editable con confianza/warnings/raw excerpt y confirmación explícita al POST /bills; conserva entrada manual. Móvil añade ruta BillOcr desde BillForm, mismo borrador editable y confirmación; no se instaló picker nativo porque no existía dependencia aprobada: la seam `pickImage` queda explícitamente no disponible en esta build y dirige a entrada manual (pendiente añadir expo-image-picker/camera con decisión de dependencia).
  Gates canónicos tras integración: API 557, web 482 (+1), móvil 371 (+2), api-client 33, core 29, contratos 16; typecheck/lint/diff-check 0; Expo export iOS/Android OK. No commit/push todavía.
  Revisión: el worker web reportó 99 fallos en copia aislada por aislamiento de tests; en repo canónico completo no se reprodujo: 482 passed/5 skipped.
- 🔄 ERD-OCR-02 actualización: se añadió `expo-image-picker ~57.0.20` con `npx expo install` y se conectó `BillOcrScreen` al selector real de galería (permiso, cancelación y MIME/nombre). La seam inyectable se conserva para tests. Restauré dependencias hoisted con `npm install` desde la raíz después de que Expo install aislado removiera paquetes del workspace web.
  Gates posteriores: API 557, web 482/5 skipped, móvil 371/11 skipped, api-client 33, typecheck/lint/diff-check 0, exports iOS/Android OK. `expo-doctor`: 20/21; queda 1 warning preexistente de schema en app.json (`splash` como propiedad adicional), no causado por OCR.
- 🔄 ERD-OCR-02 cierre de captura móvil: además de galería, `BillOcrScreen` ofrece `Tomar foto` usando `expo-image-picker` (permiso de cámara, cancelación, MIME/nombre). La revisión humana sigue siendo obligatoria antes de POST /bills.
  Gates después del cambio: typecheck 0, suite repo web 482/5 skipped, móvil 371/11 skipped, api-client 33, exports iOS/Android 0. Sin simulador/dispositivo real todavía.
- 🔄 ERD-ANOM-01 backend integrado sin commit: `GET /api/v1/homes/{home_id}/anomalies` read-only, granularidad day/month, baseline median de buckets comparables, thresholds configurables, warning/critical, explicación en español, sin inserts ni duplicados y con autorización existente. Worker: 8 focused; canónico combinado OCR+anomaly: API 565 (+8), contratos/arquitectura OK, web 482/5 skipped, móvil 371/11 skipped, typecheck/lint/diff-check 0.
  Pendiente: UI web/móvil para mostrar severidad, observado vs baseline, delta y estados sin historial.
- 🔄 ERD-ANOM-01 UI integrada sin commit: web y móvil consumen `/anomalies?granularity=month` con caché por vivienda/granularidad; muestran severidad, observado vs baseline, delta, período y explicación, con estado vacío calmado. No calculan anomalías localmente ni atribuyen a equipos.
  Gates canónicos OCR+anomalías: API 565 (+8), core 29, contratos 16, api-client 34, web 485 (+3), móvil 372 (+1), typecheck/lint/diff-check 0, exports iOS/Android OK. Falta QA visual/dispositivo real.
