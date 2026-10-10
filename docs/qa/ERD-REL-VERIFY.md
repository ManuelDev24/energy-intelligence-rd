# ERD-REL-VERIFY — ejecución de `docs/RELEASE_CHECKLIST.md`

- Commits verificados: `4fc8280`/`effff9c` (1.ª pasada), `000abe0` (simuladores), y `Dev` local de la 3.ª pasada
  (2026-10-10: QA web/móvil completo contra API real tras las correcciones de esta tarea, ERD-WEB-QUALITY y
  ERD-WEB-POSTMERGE-QA).
- Clon limpio: `git clone --no-local` en directorio nuevo, `npm ci` sin `node_modules` previos, `uv sync --frozen`, `.env` desde `.env.example`.
- Aislamiento: proyecto compose `erd-release-verify`, puertos 55433/18001, contenedores `erd-rel-*`. El piloto (`energy-api`/`energy-postgres`, :8000) no se tocó.
- Node: **v24.21** (el repo exige `>=24 <25`). Con Node 26 la suite web falla (`window.localStorage` indefinido): incompatibilidad de entorno, no defecto del repo.
- Dispositivos: iPhone 18 Pro (iOS 27, Xcode 27) y emulador `EnergyRD_Pixel` (Android 16), Expo Go SDK 57.
- Evidencia: `docs/qa/evidence/rel-verify-2026-10-10/` (`web-qa/`, `mobile-qa/ios`, `mobile-qa/android`, capturas de la 2.ª pasada).
- **Estado: todos los criterios comprobados salvo OCR con fotos reales (⛔, requiere facturas de Manuel).
  CI verde en `eb4937c` (run `38079786950`). Aceptación de riesgo de dependencias confirmada (2026-10-10).
  Promoción `Dev → QA` pendiente solo del OCR con facturas reales.**

Leyenda: ✅ comprobado · ⛔ bloqueado · ➖ pendiente de decisión humana / no aplica.

## 1. Código y ramas
- ✅ `git log origin/main..origin/Dev` revisado; el único PR abierto hacia `Dev` es el #17 (`test/web-mvp-smoke`), que **no** se fusiona: su commit se trajo a `Dev` con su autoría (`dc2f449`).
- ➖ ID `[ERD-XXX-NN]` en cada commit: hay commits de docs/merge sin ID (`dc8cdbf`, `12e107e`, `d5e4c3b` merge PR #16). Aceptable como histórico; no reescribir.
- ✅ `git status` limpio en el clon verificado.

## 2. CI
- Diagnóstico del rojo (`37369363180` cancelado, `37706860287` failure): `TesseractNotFoundError` en el runner. Corregido en `d5e4c3b`/`effff9c`.
- ✅ Runs `38014377647` (`000abe0`), `38075621697` (`4fbdc75`) y `38079786950` (`eb4937c`, 3.ª pasada) verdes en los 3 jobs.

## 3. Base de datos y migraciones
- ✅ Base vacía → `alembic upgrade head` hasta `0013`; `downgrade -1` + `upgrade head` OK.
- ✅ Seed dos veces: 1.ª `5 homes / 13 bills / 13 equipment`, 2.ª `0/0/0` (idempotente).
- ➖ Backup/restauración, réplicas y `MIGRATE_ON_START=false`: aplican a despliegue real, no ejecutado.

## 4. Levantar desde cero
- ✅ `docker compose up -d --build --wait postgres api` (SEED_PILOT=true) → ambos *healthy*; `/health` → `{"status":"healthy","database":"ok"}`; `/api/v1/homes` → exactamente PILOT-01…05; `/docs` → 200.
- ✅ `npm ci` sin errores.
- ✅ Web en `:3000`: *Acceso demo* con las 5 viviendas (Safari del simulador y Chromium de escritorio 1280 px).
- ✅ Móvil: Metro empaqueta y la app abre en Expo Go en iOS y Android; `expo export` iOS/Android ✅ (también tras subir Expo a 57.0.27).

## 5. Funcionalidad
- ✅ Valores de las 5 viviendas = `DEMO_GUIDE` §3 y = respuesta de `/dashboard` (web, comprobación automática por vivienda).
- ✅ **Etiquetas REAL/ESTIMADO/PROYECTADO revisadas en las 5 viviendas**, web y móvil: cada métrica no-REAL de la API lleva su etiqueta en español; REAL se explica en la leyenda (web "Estado de los datos", móvil "¿Qué significan las etiquetas?"). Capturas `web-qa/web-dashboard-PILOT-0*.jpg`, `mobile-qa/*/labels-PILOT-0*.jpg`.
- ✅ **Sin datos horarios inventados**: `resolution=monthly` en las 5 viviendas; ningún `kWh/h`, "por hora" ni rango horario en el dashboard ni en las 10 pantallas internas web; móvil muestra "Resolución mensual: sin datos horarios" en las 5.
- ✅ Factura inválida rechazada (kWh negativo, foco en el campo), válida → alerta crítica +66.67 % y proyección 466.67 kWh; alerta en `/alerts`; limpieza. Web contra API real **530/530 sin omisiones**; recorridos móviles 8/8.
- ✅ **Estados carga/error/vacío con Reintentar, API apagada de verdad (`docker stop`):**
  web → error local en 1.3 s, Reintentar recupera al volver la API; loading (esqueleto) y vacío (vivienda sin facturas) también.
  iOS y Android → "Sin conexión… No se pudo conectar con la API" + Reintentar, que recupera el Inicio. Capturas `web-qa/web-state-*.jpg`, `mobile-qa/*/state-*.jpg`.
- ✅ Smoke Maestro `pilot-flow.yaml` repetido tras el cambio de Expo: iOS 75 y Android 77 pasos COMPLETED, 0 fallos. Etiquetas: iOS 91 / Android 92 pasos, 0 fallos. API apagada/encendida: 8 + 4 pasos en cada plataforma, 0 fallos. Flujos en `apps/mobile/maestro/qa/`.
- ✅ Verificación web (ERD-WEB-QUALITY) y regresión post-merge (ERD-WEB-POSTMERGE-QA): 90/90, axe 0 violaciones en 11 pantallas. Ver `docs/qa/ERD-WEB-QUALITY.md` y `docs/qa/ERD-WEB-POSTMERGE-QA.md`.
- ✅ OCR en la imagen Docker (`tesseract 5.5.0`, `eng osd spa`): imagen sintética → kWh 320.00 y monto 4500.00 con confianza alta, 0 facturas creadas. **⛔ Falta probar con fotos reales de EDESUR, EDENORTE y EDEESTE** (no hay imágenes con licencia pública; se necesitan facturas propias con datos personales tapados). Hallazgo abierto: no extrae el período con formato `01/09/2026 al 30/09/2026` (lo avisa en `warnings`).
- ✅ `DEMO_GUIDE.md` actualizado: OCR como borrador editable, anomalías, Tesseract para correr la API fuera de Docker, y la tabla web/móvil corregida (la web ya tiene Alertas y Equipos).

### Defectos encontrados en esta pasada y corregidos (TDD)
| Defecto | Plataforma | Commit |
|---|---|---|
| Con la API apagada, iOS/Android decían "La respuesta del servidor no cumple el contrato": el `fetch` de React Native rechaza con un `Error` que no es `TypeError` y el cliente lo trataba como violación de contrato | móvil (cliente compartido) | `[ERD-REL-VERIFY] fix(api-client)…` |
| El estado de error web mostraba el `detail` del servidor | web | `[ERD-WEB-POSTMERGE-QA] fix(web)…` |
| Sin "Saltar al contenido", foco perdido en errores, títulos iguales, `article role=alert`, acceso demo sin Reintentar | web | `[ERD-WEB-QUALITY] fix(web)…` (4 commits) |

## 6. Seguridad y datos
- ✅ No hay `.env` ni `.env.local` versionados; `.env.example` con placeholders; `CORS_ORIGINS` explícito; API piloto en loopback.
- ✅ Dependencias: **23 → 20** (los 2 moderados de `postcss-selector-parser` corregidos con override a 7.1.6, CSS de producción idéntico; Expo 57.0.27). Los 20 altos son los 2 advisories sin parche ya aceptados el 2026-10-05 (`braces`, `node-forge`, solo herramientas de build/desarrollo). Detalle: `docs/qa/ERD_SEC_DEPS_2026-10-04.md` § Revisión 2026-10-10. **✅ Aceptación de riesgo confirmada por Manuel el 2026-10-10.**
- ✅ Datos demo (`source=seed`, aviso en dashboard); las capturas solo contienen datos demo.

## 7. Publicar / 8. Rollback
- ⛔ No se promueve `Dev → QA`: falta OCR con fotos reales. PR #17 cerrado sin fusionar (su commit ya está en `Dev`).

## Bloqueos que quedan
1. ⛔ Fotos reales de facturas EDESUR, EDENORTE y EDEESTE para probar el OCR (las pone Manuel).
