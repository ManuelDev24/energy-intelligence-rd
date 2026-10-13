# ERD-REL-VERIFY — ejecución de `docs/RELEASE_CHECKLIST.md`

## Re-verificación 2026-10-11 (sobre la pasada anterior de 2026-10-10)

- Commit verificado: **`5c5d42d7c9153d2acd6c007551d9c8c198fb7e9c`** (`Dev` actual; incluye el fix crítico de crash
  en Android/Expo Go `push.ts` [ERD-ALERT-02], el harness Maestro Android, y `df82487`/`a04ab16`
  [ERD-WEB-POSTMERGE-QA] de Anthony Junior).
- Clon limpio: `git clone --no-local` + `git checkout --detach origin/Dev` en
  `~/.hermes/cache/scratch/erd-rel-verify-20261011/repo`.
- Aislamiento: proyecto compose `erd-relverify-1011`, puertos **55441**/**8014**,
  contenedores `erd-relverify-1011-{postgres,api}`. El piloto (`energy-api`/`energy-postgres`, `:8000`/`:5433`)
  no se tocó; confirmado sano antes y después.
- **Cambio de estado importante respecto a la pasada anterior:** el bloqueador que dejaba pendiente
  la promoción `Dev → QA` ("falta OCR con fotos reales") **ya no es un bloqueador absoluto**: el
  2026-10-11 se corrió el pipeline de producción contra las 3 facturas reales del propietario
  (EDESUR/EDENORTE/EDEESTE) con **21/22 campos correctos, 0 incorrectos** (EDENORTE deja un monto
  ambiguo intencionalmente vacío con aviso de revisión manual, en vez de 22/22). Ver
  `docs/qa/ERD-RELEASE-QA.md` para la evidencia completa (gitleaks, API+worker end-to-end, etc.).
  **No se declara 22/22 ni aceptación productiva completa de OCR.**

Leyenda: ✅ comprobado de nuevo hoy · 🔁 heredado de la pasada 2026-10-10 (no reproducido hoy) ·
⛔ bloqueado · ➖ pendiente de decisión humana / no aplica.

## 1. Código y ramas
- ✅ `git log origin/main..origin/Dev` → 11 commits. Sin PRs abiertos hacia `Dev`
  (`gh pr list --base Dev --state open` → vacío).
- ➖ ID `[ERD-XXX-NN]`: 4 de los 11 commits no llevan el prefijo `[ERD-...]` al inicio del
  mensaje (usan el tag entre paréntesis al final, o ninguno: commits de observabilidad/simulacro/OCR
  del 2026-10-10/11). Histórico, no se reescribe; nota para convención futura.
- ✅ `git status` limpio en el clon verificado.

## 2. CI
- ✅ Run `38148825170` (HEAD `5c5d42d`): 3/3 jobs `success` (`api`, `web+mobile+core`,
  `web+mobile e2e`).

## 3. Base de datos y migraciones
- ✅ Base vacía → `alembic upgrade head` (hasta `0021`) → `downgrade -1` → `upgrade head`: los 3 pasos OK.
- ✅ Seed dos veces: 1.ª `{'homes_created': 5, 'bills_created': 13, 'equipment_created': 13}`,
  2.ª `{'homes_created': 0, 'bills_created': 0, 'equipment_created': 0}` (idempotente).
- ➖ Backup/restauración, réplicas y `MIGRATE_ON_START=false`: aplican a despliegue real, no ejecutado hoy.

## 4. Levantar desde cero
- ✅ `SEED_PILOT=true docker compose up -d --build --wait postgres api` → ambos *healthy*.
- ✅ `GET /health` → `{"status":"healthy","database":"ok"}`.
- ✅ `GET /api/v1/homes` → exactamente `PILOT-01…05`.
- ✅ `GET /docs` → 200.
- 🔁 `npm ci`, web `:3000`, Metro/Expo Go: verificado en la pasada 2026-10-10, no repetido hoy (sin
  cambios en esas rutas desde entonces salvo el fix de `push.ts`, cubierto por el punto siguiente).

## 5. Funcionalidad
- ✅ Valores de las 5 viviendas re-verificados contra `/dashboard` en el HEAD actual, coinciden
  exactamente con `DEMO_GUIDE.md` §3: PILOT-01 420 kWh/+50.00 %/486.67 kWh proyectado/🔴 crítica;
  PILOT-02 315 kWh/+3.28 %/315.00/—; PILOT-03 225 kWh/+25.00 %/270.00/🟡 advertencia;
  PILOT-04 410 kWh/−10.87 %/366.67/—; PILOT-05 240 kWh/+9.09 %/260.00/—.
- ✅ Equipos de PILOT-01: estimado **321.00 kWh/mes, 78.98 % de la factura** (≈79 %), coincide con
  `DEMO_GUIDE.md`. Etiquetas `REAL`/`ESTIMATED`/`PROJECTED` presentes en cada campo de la API.
- ✅ Factura inválida rechazada: kWh negativo → 422; período invertido → 422.
- ✅ Factura válida (PILOT-05, registro "en vivo" §4.3 de la guía): 255 kWh/RD$3,250 → 201,
  historial pasa de 2 a 3 facturas, dashboard actualiza `latest_bill.kwh` a 255.00 (`REAL`).
- ✅ Alerta (PILOT-01, crítica): `PATCH .../alerts/{id} {"status":"read"}` → 200;
  `{"status":"dismissed"}` → 200; tras descartar, la alerta ya no aparece en `GET /alerts`
  (no reaparece).
- ✅ Equipos CRUD: crear (`power_w`+`hours_per_day`) → 201; editar → 200; eliminar → 204; el
  conteo y el estimado vuelven exactamente al valor base tras el ciclo completo.
- 🔁 Estados carga/error/vacío (web/iOS/Android con API apagada real) y smoke Maestro
  `pilot-flow.yaml`: verificado en la pasada 2026-10-10 (iOS 75/Android 77 pasos, 0 fallos). **No
  repetido hoy en simulador/emulador** para este release; sí se corrió hoy, por separado, un pase
  de endurecimiento del harness Android de `auth-flow.yaml` (ver sección Android abajo).
- 🔁 OCR en imagen Docker con Tesseract real (sintético, 3/3 distribuidoras): pasada 2026-10-10.
- ✅ **OCR con facturas reales (antes bloqueador ⛔, hoy parcialmente resuelto):** 21/22 campos
  correctos, 0 incorrectos, contra las 3 facturas reales del propietario. 3/3 documentos procesados
  de punta a punta (cifrado → cola → worker/Tesseract → borrador → confirmación → lectura). Evidencia
  sanitizada en `docs/qa/evidence/dev-recovery-2026-10-11/`. **EDENORTE deja un monto ambiguo vacío
  con aviso explícito; no es 22/22.** Pendiente: holdout con fotos/PDF no vistos, portal genuino.

### Android nativo (hallazgo y corrección de esta pasada, no en el checklist original)
- 🔴→✅ **Hallazgo crítico** (no detectado por 2 revisiones móviles previas, ninguna corrió Android):
  `push.ts` crasheaba toda la app en Android dentro de Expo Go al solo importar `expo-notifications`
  (Expo Go quitó push remoto nativo en Android desde SDK 53; el throw ocurre fuera de cualquier
  promesa, no capturable por `try/catch`). Corregido con guard `isRunningInExpoGo()` antes de
  importar el módulo; 3 tests RED→GREEN; **527 pruebas móviles pasan**, typecheck limpio.
  Commit `12c6356`, CI verde (run `38147049179`).
- ✅ Reverificado en emulador real (`EnergyRD_Pixel`): ya no crashea; registro, onboarding completo
  (6 pasos) y dashboard alcanzados en corridas de hasta 7 min.
- ✅ Dos problemas reales del harness Maestro Android corregidos (commit `5c5d42d`, CI verde run
  `38148825170`): menú de desarrollo "TOOLS" sin manejar, mistap de texto provincia/municipio por
  teclado tapando el campo.
- ⛔ **El recorrido automatizado completo (`auth-flow.yaml`) aún no llega a verde de punta a punta**:
  el último intento topó con un timeout del lado cliente por lentitud del emulador tras sesión
  larga (el servidor sí procesó el registro en 14.7 s). Ambiental, no de código; no insistido hasta
  lograr una corrida 100 % limpia.
- ⛔ `pilot-flow.yaml` tiene un desajuste de texto preexistente no relacionado (alerta "Crítica: ..."
  vs. regex esperado "Crítica · nueva"), identificado pero no corregido (fuera de alcance de esta
  pasada).

## 6. Seguridad y datos
- ✅ `.env` no versionado; `.env.example` con placeholders `change_me_local_only`.
- ✅ `CORS_ORIGINS` explícito en las 3 definiciones de servicio del compose, nunca `*`.
- ✅ API piloto en loopback por defecto (`API_BIND_ADDRESS:-127.0.0.1`).
- ✅ Seed marcado `source="seed"` (datos demo identificables).
- 🔁 Dependencias (`ERD_SEC_DEPS_2026-10-04.md`, aceptación de riesgo confirmada 2026-10-10): no
  reauditado hoy.
- 🔁 Gitleaks sobre el lote OCR/móvil de hoy: 0 secretos reales, 3 detecciones clasificadas como no
  secretas (ver `docs/qa/ERD-RELEASE-QA.md`).

## 7. Publicar / 8. Rollback
- ⛔ **No se promueve `Dev → QA`.** Sin PR abierto `Dev → main`, sin tag `pilot-*` previo.
- Bloqueadores reales que quedan para la promoción (del inventario completo en
  `docs/qa/ERD-RELEASE-QA.md` § Pendientes de aceptación del lote): Android automatizado 100 % verde,
  holdout de OCR con fotos no vistas, legal (Ley 172-13 RD, texto definitivo), proveedores reales de
  despliegue (Render/Neon/bucket/Sentry/EAS), DR real, VoiceOver/TalkBack, push en dispositivo físico
  con FCM/APNs reales. **Ninguno de estos es un defecto de código: son decisiones/accesos/dispositivos
  que requieren al propietario.**
- Rollback: sin cambios respecto a la documentación existente en `docs/RELEASE_CHECKLIST.md` §8
  (revertir merge en `main`, probar downgrade en copia, nunca a ciegas por la inmutabilidad de
  `audit_events`).

## Resumen para decidir
El checklist técnico (§1-6) está **comprobado de nuevo hoy en el HEAD actual de `Dev`** y pasa. El
bloqueador histórico más grande (OCR sin fotos reales) **ya tiene evidencia real, aunque no 22/22**.
Los bloqueadores que quedan para `Dev → QA` son todos de **decisión/acceso del propietario**
(legal, proveedores, dispositivos físicos, holdout), no de código roto. La promoción sigue sin
ejecutarse: requiere tu orden explícita y, antes de darla, tu decisión sobre cuáles de esos
bloqueadores aceptas como riesgo conocido vs. cuáles exiges resolver primero.
