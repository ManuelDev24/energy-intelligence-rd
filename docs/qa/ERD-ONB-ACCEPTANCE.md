# ERD-ONB-ACCEPTANCE — onboarding autenticado (vivienda, contrato, meta inicial)

Fecha: 2026-10-10 · Rama `claude/elegant-ptolemy-sdr69r`.

## Criterios y evidencia

| Criterio | Resultado | Evidencia |
|---|---|---|
| Cuenta nueva sin viviendas ve el asistente | ✅ web | `evidence/onb-acceptance-2026-10-10/web-onb.py` (13/13) |
| Validación impide avanzar sin datos obligatorios y no crea nada | ✅ web y API | etapa 1, etapa 4 (ocupantes 0), etapa 6 (meta `abc`); `test_invalid_profile_never_creates_a_home` (7 casos) |
| La vivienda se crea una sola vez (etapa 2) y las siguientes etapas la actualizan por PATCH | ✅ web y API | `test_failed_goal_step_can_be_resumed_without_creating_a_second_home` |
| Contrato y meta opcionales; guardados cuando se indican | ✅ web y API | `test_contract_and_goal_are_optional_steps`, comprobaciones "contrato guardado" y "meta guardada" |
| Indicadores desconocidos se guardan como `null`, nunca `false` | ✅ web y API | web: `[true, null, null, null, null]`; `test_new_account_completes_onboarding_and_sees_it_everywhere` |
| Reanudar pasos es idempotente | ✅ API | `test_resumed_steps_are_idempotent` |
| Sin facturas, dashboard y progreso no inventan datos | ✅ API | progreso `insufficient_data` |
| Aislamiento entre cuentas (404 idéntico al de una vivienda inexistente) | ✅ web y API | `test_second_account_is_isolated_from_the_first_onboarding` |
| Llega al panel de la vivienda creada | ✅ web | capturas `onb-7-resumen.jpg`, `onb-8-panel.jpg` |
| Onboarding móvil (iOS/Android) en dispositivo | ✅ iOS; ⛔ Android pendiente | Verificación independiente 2026-10-11: dos recorridos Maestro completos (132.5 s / 135.0 s), seis pasos, perfil, consumo vacío y meta persistida tras reingreso. `ERD-E2E-MAESTRO-AUTH.md` y `evidence/dev-recovery-2026-10-11/native-ios-auth.json`. No certifica errores/reintentos de onboarding nativos ni Android |

Entorno: PostgreSQL 16 local, API con `AUTH_ENABLED=true` (`:18011`, migraciones hasta 0013), web `next dev` con
`NEXT_PUBLIC_AUTH_ENABLED=true` (`:3011`), Chromium headless. Solo cuentas `erd-onb-<uuid>@example.com`.
Reproducir: levantar ambos y `python web-onb.py <dir>` (requiere `playwright` y Chromium).

## Idempotencia de «crear vivienda» (resuelto en API, web y móvil; sin verificar en dispositivo)
`POST /homes` acepta `Idempotency-Key` (UUID). Misma clave + mismo contenido → la misma vivienda (cabecera `Idempotent-Replayed: true`,
sin contar contra el tope de viviendas); misma clave + contenido distinto → 409 `idempotency_key_reused`; las claves son de cada persona,
caducan a las 24 h y caen con la vivienda o la cuenta (migración 0035, tabla `home_create_requests`). El asistente web y el onboarding
móvil generan una clave por intento y la reutilizan al reintentar, así que ya no bloquean el reintento tras perder la respuesta.
Pruebas: `services/api/tests/test_home_idempotency.py` (6, también con `TEST_RLS_ROLE=1`), `bff-idempotency.test.ts`, `onboarding-wizard.test.tsx`
y `apps/mobile/src/api/idempotency.test.ts`. **Pendiente:** forzar la pérdida real de la respuesta en Android/iOS (modo avión tras el POST).
