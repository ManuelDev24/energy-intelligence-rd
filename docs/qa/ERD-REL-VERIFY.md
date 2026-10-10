# ERD-REL-VERIFY — ejecución de `docs/RELEASE_CHECKLIST.md`

- Commit verificado: `4fc8280` (Dev, sobre baseline `192caf8`; incluye `48e9465`). Tras el rebase sobre `d5e4c3b` el arreglo de CI quedó como `effff9c`.
- Clon limpio: `git clone --no-local` en directorio nuevo, `npm ci` sin `node_modules` previos, `uv sync --frozen`, `.env` desde `.env.example`.
- Aislamiento: proyecto compose `erd-release-verify`, puertos 55433/18001, contenedores `erd-rel-*`. El piloto (`energy-api`/`energy-postgres`, :8000) no se tocó.
- Node: **v24.21** (el repo exige `>=24 <25`). Con Node 26 la suite web falla (`window.localStorage` indefinido, 99 tests): es incompatibilidad de entorno, no defecto del repo.
- Estado: **NO LISTO PARA PROMOVER** — quedan criterios sin verificar (ver bloqueos). El CI de `000abe0` está verde (run `38014377647`).
- Segunda pasada (2026-10-10) en simuladores reales sobre `000abe0`: iPhone 18 Pro (iOS 27, Xcode 27) y emulador `EnergyRD_Pixel` (Android 16), Expo Go SDK 57, API en contenedores Docker aislados (:18001, seed piloto). Capturas en `docs/qa/evidence/rel-verify-2026-10-10/`.

Leyenda: ✅ comprobado · ⛔ bloqueado · ➖ no aplica / pendiente de decisión humana.

## 1. Código y ramas
- ✅ `git log origin/main..origin/Dev`: 28 commits, todos revisados; no hay PRs abiertos hacia `Dev` (`gh pr list --base Dev` vacío).
- ➖ ID `[ERD-XXX-NN]` en cada commit: hay commits de docs/merge sin ID (`dc8cdbf`, `12e107e`, `d5e4c3b` merge PR #16). Aceptable como histórico; no reescribir.
- ✅ `git status` limpio en el clon verificado (`status` vacío).

## 2. CI
- ⛔ Run `37706860287` (HEAD `48e9465`) = failure; run `37369363180` (`192caf8`) = cancelado/failure. Causa raíz reproducida desde el log: `test_ocr_endpoint_returns_a_draft_never_creates_a_bill` → `TesseractNotFoundError` (runner Ubuntu sin binario `tesseract`). Resto: 564 passed; web+mobile y recorridos reales ✅.
- Arreglo: `d5e4c3b` (PR #16, de otro integrante) ya instala `tesseract-ocr` + idiomas `spa`/`eng` en el job `api`; su run `38010816345` salió success. `effff9c` conserva esa versión del workflow y añade lo que faltaba: Tesseract con `spa`+`eng` en `services/api/Dockerfile` (el motor usa `spa+eng`; sin esos idiomas el OCR fallaría en el contenedor). Local: pytest 565 passed.
- Nota: la imagen Docker verificada antes del rebase tenía solo `tesseract-ocr` (sin `spa`); el OCR vía contenedor no se probó con una imagen real de factura.
- ✅ Run `38010816345` (`d5e4c3b`) verde. ⛔ Pendiente: run verde del commit final tras el push de `effff9c`.

## 3. Base de datos y migraciones
- ✅ Base vacía → `alembic upgrade head` hasta `0013`.
- ✅ `downgrade -1` + `upgrade head` OK.
- ✅ Seed dos veces: 1.ª `5 homes / 13 bills / 13 equipment`, 2.ª `0/0/0` (idempotente).
- ➖ Backup/restauración, réplicas y `MIGRATE_ON_START=false`: aplican a despliegue real, no ejecutado.

## 4. Levantar desde cero
- ✅ `docker compose up -d --build --wait postgres api` (SEED_PILOT=true) → ambos *healthy*.
- ✅ `/health` → `{"status":"healthy","database":"ok"}`.
- ✅ `/api/v1/homes` → exactamente PILOT-01…05.
- ✅ `/docs` → 200.
- ✅ `npm ci` sin errores (warnings de engine solo con Node 26).
- ✅ Web en `:3000` muestra *Acceso demo* con las 5 viviendas (Vivienda piloto 01…05 · EDESUR/EDENORTE/EDEESTE/Otra/EDESUR) y, al entrar con la 01, el dashboard (RD$ 6,553.33 PROYECTADO, +15.87 %, alerta crítica +50 %, aviso de datos demo). Verificado en Safari del simulador iOS (viewport móvil), no en un navegador de escritorio. Capturas: `web/01…03`.
- ✅ Móvil: Metro empaqueta (iOS y Android) y la app abre en Expo Go en ambos simuladores. `expo export` iOS/Android ✅.

## 5. Funcionalidad
- ✅ Valores de las 5 viviendas (API): PILOT-01 EDESUR 3 fact., 420 kWh/RD$5,600, alerta crítica, 3 equipos · PILOT-02 EDENORTE 3, 315/4,010, sin alerta · PILOT-03 EDEESTE 2, 225/2,900, advertencia · PILOT-04 Otra 3, 410/5,600, sin alerta · PILOT-05 EDESUR 2, 240/3,050, sin alerta. Coinciden con `DEMO_GUIDE` §3.
- ✅ Factura inválida rechazada, válida actualiza dashboard, alerta crear/leer/descartar, equipos crear/editar/eliminar: recorridos móviles contra API real 8/8 y web contra API real 490/490.
- ➖ Etiquetas REAL/ESTIMADO/PROYECTADO: cubiertas por pruebas de web/móvil; sin revisión visual.
- ✅ Smoke Maestro `pilot-flow.yaml` (onboarding → PILOT-05 → validación kWh negativo → factura → historial → dashboard con alerta crítica → alertas → equipos ESTIMATED → eliminar factura): **iOS 79 pasos COMPLETED, Android 77 pasos COMPLETED, sin fallos.** Tras cada corrida PILOT-05 volvió a 2 facturas.
- ✅ OCR en la imagen Docker real (`tesseract 5.5.0`, idiomas `eng osd spa`): imagen sintética → 200, kWh `320.00` y monto `4500.00` con confianza `high`, 0 facturas creadas ("nunca OCR → BD"). Hallazgo menor: no extrajo el período con el formato `01/09/2026 al 30/09/2026`; el borrador lo avisa en `warnings`. Falta probar con fotos reales EDESUR/EDENORTE/EDEESTE.
- ⛔ Estados de carga/error/vacío apagando la API (con *Reintentar*): no ejecutado en simulador.
- ➖ Nota: `DEMO_GUIDE.md` dice "No hay OCR"; ya existe OCR/anomalías. Actualizar documentación.

## 6. Seguridad y datos
- ✅ No hay `.env` ni `.env.local` versionados; `.env.example` con placeholders.
- ✅ `CORS_ORIGINS` explícito (sin `*`) en `.env.example`/compose.
- ✅ API piloto en loopback (`127.0.0.1`).
- ➖ Revisión de avisos de dependencias: `npm ci` reporta 23 vulnerabilidades (2 moderate, 21 high). Requiere aceptación formal de Manuel.
- ✅ Datos demo `source=seed`; ➖ capturas sin datos personales: no se tomaron.

## 7. Publicar / 8. Rollback
- ⛔ No se promueve `Dev → QA/main`: CI verde, pero quedan criterios de §5/§6 sin comprobar (ver bloqueos).

## Resumen de bloqueos reales
1. Estados carga/error/vacío con la API apagada (web y móvil), comprobación manual.
2. Aceptación formal de 23 vulnerabilidades de dependencias (Manuel).
3. Etiquetas REAL/ESTIMADO/PROYECTADO y ausencia de datos horarios: revisión visual completa de las 5 viviendas (solo se revisó PILOT-01 en web).
4. Fotos reales de facturas para OCR y mejora del parser de período.
5. Promoción `Dev → QA/main` sigue sin hacerse hasta que Manuel resuelva 1–3.
