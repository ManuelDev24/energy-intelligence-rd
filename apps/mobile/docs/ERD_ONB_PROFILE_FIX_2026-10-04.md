# Required R1 / R2 / R4 — fix móvil, 2026-10-04

## Resultado y alcance

Corregidos localmente en `Dev` los Required **R1, R2 y R4** del informe independiente `docs/qa/ERD_ONB_PROFILE_ABUSE_REVIEW_2026-10-04.md`. Este documento registra implementación y evidencia, no sustituye esa revisión ni certifica aceptación nativa. R3 web queda al coordinador.

Solo se modificó `apps/mobile` en el repo; scratch reviewer se reutilizó. Sin installs, paquetes/shared contracts, cambios de web/API/root deps, commits, push, borrados, servidores persistentes, emuladores, gateway o piloto. El árbol ya tenía cambios ajenos.

### R1 — PATCH de intención parcial

- `HomeProfileScreen` comparte el estado puro de borrador por campo; el GET/refetch actualiza untouched, conserva dirty y no reinicializa todo el formulario.
- `profilePatch` compara el payload normalizado con la baseline canónica y omite campos iguales. Si únicamente cambia nombre, el payload es exactamente `{ name: 'Casa editada' }`; no incluye sector antiguo ni flags null.
- `null` solo representa limpieza explícita de un campo opcional antes conocido; un opcional vacío desconocido permanece omitido. Flags mantienen null/true/false sin defaults inventados.
- `ProfilePatch` y el tipo `Partial<OnboardingHomeInput>` son locales. POST conserva su tipo obligatorio; no se cambió ningún contrato compartido.
- Guardar deshabilitado y handler con guard si no hay cambios efectivos. Se mantienen validación, lock, errores sanitizados y GET de confirmación.

### R2 — contrato sincronizado y canonical versionado

- GET nuevo actualiza el input cuando no está dirty. Si el usuario ya lo editó, el refresh cambia baseline sin borrar su borrador.
- Guardar deshabilitado sin diferencia efectiva tras trim y handler rechaza un PUT sin cambios. Vacío no elimina contrato; sigue siendo inválido para PUT.
- PUT + GET sigue pasando por `saveVerified`. Canonical confirma lo enviado, no borra ediciones posteriores al snapshot.
- La revisión por campo protege también una edición posterior que vuelve al valor original cuando el GET publica en caché antes de resolver la mutación. La protección temporal se libera también ante error; no se agrega retry automático.
- Mismas claves epoch/home, inputs deshabilitados durante la mutación real, guards de cuenta/vivienda tras cada await y ausencia de éxito antes del GET.

### R4 — caché de progreso

`homeProfileInvalidations` añade `phase2Keys(scope).goalProgress(homeId)`. Invalida el prefijo de progreso del origen (incluidas variantes mensuales), no otra vivienda/cuenta/piloto ni la meta. Se conservan las invalidaciones previas de perfil/lista/dashboard.

## TDD RED → GREEN real

Tests positivos del reviewer scratch con los componentes **reales** HomeProfileScreen, ServiceProfileScreen y EnergyProfileFields; solo hooks/transport y primitivas nativas se mockean para ReactDOM/jsdom. El repro inicial que afirmaba defectos se convirtió en expectativas de comportamiento correcto; R3 no está en esta suite móvil.

Fallos observados antes de la correspondiente implementación, con salida real de Vitest (hora literal de runner, no inferencia de timezone):

| RED | Salida / causa | GREEN posterior |
|---|---|---|
| R1, 19:14:39 | `Expected ... Norte; Received ... Centro`; 1 failed | 1 passed, 19:17:37; PATCH exacto y flag actualizado |
| R2, 19:18:03 | `Received element is not disabled`; 1 failed / 1 passed | 2 passed, 19:18:43; refresh clean, dirty conservado y no PUT unchanged |
| R2 confirmación, 19:19:04 | `Expected ... LATER-DRAFT; Received ... CANONICAL`; 1 failed / 2 passed | 3 passed, 19:20:14 |
| R4, 19:20:47, test mantenible repo | `expected false to be true` en isInvalidated; 1 failed / 1 passed | 2 passed, 19:21:07; nuevo fetch y aislamiento |
| R2 publicación de readback, 19:21:50 | `Expected ... OLD-123; Received ... CANONICAL`; 1 failed / 3 passed | 4 passed, 19:24:21 |

Las funciones nuevas también tuvieron RED por implementación ausente antes de GREEN. Esos fallos de función/module ausente no se confunden con los fallos de comportamiento de componentes de la tabla.

Regresiones mantenibles sin nuevas dependencias: `editableDraft.test.ts` (rebase, confirmación versionada, readback intermedio), `model.test.ts` (PATCH parcial/null), `keys.test.ts` (aislamiento y fetch nuevo), `onboarding.test.ts` (serialización HTTP parcial), `navigation.test.ts` (wiring al estado probado y guards/GET). **7 pruebas nuevas** sobre baseline 279. El config Vitest móvil sigue puro/node y sin cambios; el harness de render queda en scratch.

## Gates finales exactos — Node v24.21.0

Desde `apps/mobile`, excepto harness desde root:

```sh
fnm exec --using=24 npm test
fnm exec --using=24 npm run typecheck
fnm exec --using=24 npx vitest run --config /Users/macbookpro/.hermes/cache/scratch/erd-onb-profile-review-20261004/vitest.config.mts
fnm exec --using=24 npx expo export --platform ios --output-dir /Users/macbookpro/.hermes/cache/scratch/erd-onb-profile-fix-mobile-ios-20261004
fnm exec --using=24 npx expo export --platform android --output-dir /Users/macbookpro/.hermes/cache/scratch/erd-onb-profile-fix-mobile-android-20261004
```

| Gate final | Output real | Exit |
|---|---|---|
| Mobile Vitest | `Test Files 32 passed | 3 skipped (35)`; `Tests 286 passed | 11 skipped (297)` | 0 |
| Typecheck | `tsc --noEmit`, sin errores | 0 |
| Scratch ReactDOM | `Test Files 1 passed (1)`; `Tests 7 passed (7)` | 0 |
| Expo iOS | `iOS Bundled ... (1119 modules)`; bundle `index-bf0836a788109463ba2cc90559680fdb.hbc` | 0 |
| Expo Android | `Android Bundled ... (1114 modules)`; bundle `index-584761e0338feb045120f463e5a6bf1c.hbc` | 0 |

Se leyó `metadata.json` de ambos exports y se conservaron los directorios. Logs finales en scratch reviewer: `mobile-tests.log`, `mobile-typecheck.log`, `render-green.log`, `export-ios.log`, `export-android.log`. El export lanza el bundler puntual, no un servidor persistente. Las 11 pruebas omitidas siguen siendo integración/e2e sin API activa, no aceptación live. No se corrieron gates web/API en este worker; los coordina el agente principal.

## Compatibilidad e interface review acotada

Scope: únicamente el delta de estado/submit de Mi vivienda y Mi servicio, y sus helpers/importers directos. Fuente antes y después leída; no se revisa todo el dirty tree. Primitivas, estilos, tokens, navigation y Maestro no se modificaron. Se conservaron etiquetas, testIDs, validación, lock, estados piloto/no disponible y regiones polite.

- Accesibilidad y writing: inspección de fuente, nombres y estados disabled conservados; no se deshabilita por invalidez, solo cuando la escritura está indisponible/no hay cambios. DOM harness demuestra estado disabled, no VoiceOver/TalkBack.
- Layout, typography, colors y polish: sin evidencia de cambios visuales en este scope. No se mide contraste nuevo ni se afirma layout nativo.
- No actionable interface findings en este delta de fuente. Aprobación solo del delta de fuente/comportamiento automatizado, **no visual/nativa**.

Hashes Maestro al cierre, iguales a los publicados antes del fix:

- `pilot-flow.yaml`: `a7141ac6c65e154e84119aa6cd4e2604185cbf2cb5786909b90062e8453f1126`
- `phase2-flow.yaml`: `016b0b6bfa43127c464004c4db48a9e7f99924d5b06c886f236f3652dd055161`
- Vitest móvil intacto SHA-256: `ec647a6db367052e42fbf2f88ed7d7fd33818f7cdd5d386bc1fc6299b6b3a2cf`.

## Archivos de esta corrección

Relativos a `apps/mobile`:

- `src/api/onboarding.ts`, `src/api/onboarding.test.ts`
- `src/features/profile/HomeProfileScreen.tsx`, `ServiceProfileScreen.tsx`, `hooks.ts`
- `src/features/profile/model.ts`, `model.test.ts`, `keys.ts`, `keys.test.ts`, `navigation.test.ts`
- Nuevos: `src/features/profile/editableDraft.ts`, `editableDraft.test.ts`, `useEditableDraft.ts`
- `ONBOARDING_PROFILE.md`
- Nuevo: `docs/ERD_ONB_PROFILE_FIX_2026-10-04.md`

Scratch modificado: `erd-onb-profile-review-20261004/review.test.tsx`; config reviewer reutilizado sin cambios. Exports/logs generados fuera del repo.

Pendiente por autorización: persistencia live con API real, layout/teclado/texto grande/AT nativos y Maestro iOS/Android. No hubo bloqueo en tests, typecheck o exports de este fix. Sin commit/push.
