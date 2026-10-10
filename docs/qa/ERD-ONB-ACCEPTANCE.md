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
| Onboarding móvil (iOS/Android) en dispositivo | ⛔ no ejecutado | requiere simulador/emulador; lo cubre ERD-E2E-MAESTRO-AUTH. Las pruebas unitarias móviles (`onboardingModel`, `saveOnboarding`, `onboardingUI`) ya existen y pasan |

Entorno: PostgreSQL 16 local, API con `AUTH_ENABLED=true` (`:18011`, migraciones hasta 0013), web `next dev` con
`NEXT_PUBLIC_AUTH_ENABLED=true` (`:3011`), Chromium headless. Solo cuentas `erd-onb-<uuid>@example.com`.
Reproducir: levantar ambos y `python web-onb.py <dir>` (requiere `playwright` y Chromium).

## Límite conocido (no es un defecto nuevo)
La creación de la vivienda no tiene clave de idempotencia: si se pierde la respuesta del POST de la etapa 2, la web bloquea
el reintento (`uncertain`) y pide revisar «Mis viviendas»; no puede garantizar ausencia total de duplicados. Una
clave de idempotencia en `POST /homes` lo resolvería; no se hizo aquí porque cambia el contrato de web y móvil.
