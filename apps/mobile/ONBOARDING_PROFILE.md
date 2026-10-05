# ERD-ONB-01 / ERD-PROF-01 — mobile

Implementación local en `Dev`, sin commit. Alcance de esta entrega: `apps/mobile` exclusivamente. No se instalaron dependencias ni se editaron paquetes compartidos, backend, web, manifests o lockfiles. El árbol ya tenía trabajo previo; el inventario al final identifica solo los archivos de esta entrega, no todo el diff de Git.

## Inventario previo y reutilización

- `src/features/homes/onboardingModel.ts`: borrador, títulos de seis pasos, validación por paso y construcción del payload. Se reutiliza; no se creó otro wizard.
- `AccountOnboardingScreen.tsx`: onboarding autenticado existente con ubicación, distribuidora/contrato, tipo libre, perfil energético, meta opcional y revisión.
- `saveOnboarding.ts`: creación seguida de PUT de contrato/meta y reanudación mediante `homeId` ya conocido.
- `src/api/onboarding.ts`: wrapper local existente para POST vivienda y PUT contrato/meta. Se amplió con GET/PATCH vivienda y GET contrato porque el cliente compartido inspeccionado no ofrece estos métodos.
- `OnboardingScreen.tsx` y `CreateHomeForm.tsx`: flujo piloto existente, no modificado.
- `HomesScreen.tsx`, `AccountSummary.tsx`, sesión, transport autenticado y Fase 2: reutilizados, no duplicados.

## Onboarding: datos desconocidos y reintentos

Los cinco indicadores (`hasAc`, `hasWaterHeater`, `hasPool`, `hasSolar`, `hasInverter`) empiezan en `null`. Cada uno ofrece **Sin indicar / Sí / No**, enviando exactamente `null / true / false`. La revisión muestra también las respuestas No y Sin indicar; no las convierte en ausencia de equipos.

Validación reutilizada tanto al avanzar como antes de escribir, también en reintentos:

- Nombre, provincia, municipio y tipo libre: 1–120 puntos de código tras trim. Sector opcional, hasta 120.
- Distribuidora: EDESUR, EDENORTE, EDEESTE u Otra. No se infieren categorías regulatorias.
- Ocupantes opcionales: entero de 1–999; vacío → null.
- Contrato opcional: hasta 120 puntos de código. El PUT exige 1–120; Unicode se cuenta igual que en Python, no en unidades UTF-16.
- Meta opcional: mismo `validateGoal` existente de Fase 2; no se inventan métricas ni tarifas.

Si se conoce el ID tras el POST y falla contrato/meta, se conserva ese ID durante la pantalla. El reintento aplica PATCH con correcciones de vivienda y repite los PUT sobre el mismo ID; no hace otro POST. Un bloqueo síncrono impide doble toque antes del siguiente render. Contrato y meta quedan fijados durante esta reanudación: vaciarlos no puede fingir que se borró una escritura parcial; su edición posterior está en Mi servicio / Meta mensual.

Si el POST tiene resultado ambiguo (red, timeout, respuesta inválida o 5xx sin ID confirmado), se bloquea otro envío en ese wizard y se pide volver a Mis viviendas/actualizar. La API no ofrece clave de idempotencia ni transacción de onboarding: **no se promete ausencia absoluta de duplicados** si se pierde la respuesta, se cierra la app o se inicia otro wizard sin revisar viviendas. No se guarda un borrador de perfil/contrato en AsyncStorage. Tras cancelar o cerrar, las viviendas creadas siguen en el servidor y el usuario puede seleccionarlas y completar sus datos existentes.

La confirmación final vuelve a consultar las viviendas antes de seleccionarla. Los errores visibles pasan por `describeError`; no se muestra `Error.message` arbitrario. Se reutiliza el cierre explícito del teclado `Listo` para ocupantes/metas.

## Perfil y navegación

Entrada `profile-entry` en el encabezado de **Inicio** → stack **Perfil** → **Mi vivienda / Mi servicio / Cambiar vivienda**. Se mantienen cinco pestañas; Perfil es de uso ocasional y no desplaza Consumo ni altera la barra del piloto.

- Perfil muestra la cuenta real y el cierre de sesión existente con confirmación.
- Mi vivienda obtiene la representación real, permite editar nombre, distribuidora, ubicación, dirección/ciudad opcionales, tipo libre, ocupantes y los cinco indicadores triestado.
- La edición respeta los campos nullable de viviendas ya existentes: no obliga a inventar provincia/municipio/tipo para guardar otro campo. Reutiliza los mismos límites del onboarding; dirección hasta 255 y ciudad hasta 120.
- Mi vivienda mantiene dirty por campo: refetch sincroniza los campos sin edición y conserva los borradores dirty; PATCH omite untouched. `null` se envía solo al limpiar explícitamente un opcional. Nombre/distribuidora no son requeridos en el payload PATCH parcial local; no se cambiaron contratos compartidos.
- Mi servicio consulta el contrato y permite agregar/editar el número real mediante PUT. Distribuidora se edita en Mi vivienda. Un GET nuevo actualiza el input sin edición; un borrador dirty se conserva. Guardar permanece deshabilitado sin cambio efectivo (también en vivienda), con guard síncrono contra envíos sin cambios.
- Después de PATCH/PUT + GET, los editores adoptan canonical con un snapshot de revisión: conservan cambios posteriores al envío, incluso si el GET publica en caché antes de resolver la mutación. Durante una mutación real los inputs siguen deshabilitados como antes.
- En modo piloto, estas superficies son de solo lectura; la navegación piloto, sus textos y testIDs existentes siguen intactos.
- Ajustes de notificaciones, preferencias, correo/contraseña y eliminación de cuenta se muestran como **No disponible**, sin switches decorativos ni persistencia simulada. No existe API para borrar contrato; dejarlo vacío es un error, no una eliminación.

## Contrato real inspeccionado

| Operación | Ruta | Uso |
|---|---|---|
| POST | `/api/v1/homes` | Onboarding existente, una creación confirmada |
| GET | `/api/v1/homes/{id}` | Leer vivienda antes de editar y verificar el guardado |
| PATCH | `/api/v1/homes/{id}` | Actualización real de campos; no PUT inventado |
| GET | `/api/v1/homes/{id}/contract` | Consultar número existente |
| PUT | `/api/v1/homes/{id}/contract` | Agregar/reemplazar `account_number` |
| PUT | `/api/v1/homes/{id}/goal` | Meta opcional existente, sin cambiar Fase 2 |

Referencia: esquemas/rutas/services del repo, incluidos campos nullable de migración 0009. No se aplicaron migraciones ni se consultó/escribió el piloto para esta entrega.

GET contrato devuelve 404 tanto si no hay contrato como cuando una API antigua no tiene esa ruta. Sin una señal de capacidad adicional, el cliente no puede distinguirlos. Mi servicio lo dice explícitamente y permite un intento manual de alta; no marca un contrato como guardado antes de PUT + GET. Si ese PUT devuelve 404/405/501, se indica no disponible y se bloquea guardar en esa pantalla. 405/501 de lectura y endpoints de vivienda ausentes también fallan en suave. La API antigua puede omitir campos nuevos: el parser compartido los materializa como null, no como false.

## Seguridad, caché y verificación de guardados

- Transport seguro existente (`createAuthenticatedFetch`) en modo autenticado; no se transportan credenciales en navegación, claves o mensajes.
- Claves `['account', epoch, 'profile-home', homeId]` / `['account', epoch, 'contract', homeId]`; piloto tiene prefijo separado. Sin `placeholderData` de otra vivienda.
- Un guardado verifica sesión y vivienda seleccionada antes de escribir, después de la escritura y después del GET. Solo entonces publica la representación canónica y éxito.
- PATCH invalida perfil, lista de viviendas, dashboard y `goalProgress` del origen; contrato solo su clave. No se invalidan otras cuentas o viviendas.
- Pantallas/formularios se identifican por epoch + homeId. La frontera de logout/cambio de cuenta existente cancela queries, limpia QueryClient, selección y navegación. Las pruebas existentes de auth/transport siguen pasando.
- Mutaciones sin retry automático. Wrapper local con timeout de 10 s, aborto, validación de respuesta y rechazo de respuestas cuyo `id`/`home_id` no coincide con la vivienda solicitada.
- Errores API 422 de perfil/contrato usan nombres de campo allowlisted y mensajes locales; detalle upstream y campos desconocidos se descartan. Los campos visibles reciben sus errores seguros.

## TDD y gates reales

Ciclos RED→GREEN ejecutados para: false inicial incorrecto, distribuidora inválida, UI triestado, bloqueo de POST ambiguo, reanudación sin aplicar correcciones, validación previa a reintento, longitud Unicode, timeout, error de red, identidad de respuesta, allowlist/errores inline, invalidaciones, confirmación con GET, races de cuenta y wiring de navegación/formularios. Las pruebas de fuente comprueban wiring/compatibilidad, **no son pruebas de render nativo**.

Última ejecución final bajo **Node v24.21.0**:

| Gate | Resultado |
|---|---|
| `npm test` | **286 passed, 11 skipped**; 32 archivos pasan, 3 omitidos |
| `npm run typecheck` | Pasa (`tsc --noEmit`) |
| `npx expo export --platform ios ...` | Pasa, 1119 módulos |
| `npx expo export --platform android ...` | Pasa, 1114 módulos |
| Harness ReactDOM scratch, componentes reales / primitivas y hooks mock | **7 passed**; no es aceptación nativa/live |

Baseline original recibido: 254 passed + 11 skipped; entrega previa: 279 + 11 skipped. Fix Required R1/R2/R4: baseline 279 + 11 skipped → 286 + 11 skipped (7 regresiones nuevas de lógica/wiring; Vitest puro sin cambios). Detalle RED→GREEN y comandos exactos: [`docs/ERD_ONB_PROFILE_FIX_2026-10-04.md`](docs/ERD_ONB_PROFILE_FIX_2026-10-04.md). Las 11 omitidas son integración/e2e sin API activa; no se presentan como aceptación live.

Exports finales conservados (no borrados):

- `/Users/macbookpro/.hermes/cache/scratch/erd-onb-profile-fix-mobile-ios-20261004`
- `/Users/macbookpro/.hermes/cache/scratch/erd-onb-profile-fix-mobile-android-20261004`

Los exports previos `erd-onb-prof-mobile-{ios,android}-20261004-final` también permanecen conservados. Logs del fix y harness reviewer positivo: `/Users/macbookpro/.hermes/cache/scratch/erd-onb-profile-review-20261004/`.

También se conservaron los exports de la primera pasada sin sufijo `-final`. La exportación ejecuta el bundler de forma puntual/offline; no se inició un servidor `expo start`, Metro persistente ni emuladores.

Flujos Maestro no editados en esta entrega. Hashes al cierre:

- `pilot-flow.yaml`: `a7141ac6c65e154e84119aa6cd4e2604185cbf2cb5786909b90062e8453f1126`
- `phase2-flow.yaml`: `016b0b6bfa43127c464004c4db48a9e7f99924d5b06c886f236f3652dd055161`

## Interface review — alcance de esta entrega

Base de revisión: contenidos anteriores del wizard/navigation leídos antes de editar y deltas de esta tarea; no el diff completo preexistente de Dev. Superficies: onboarding autenticado, selector de indicadores reutilizado, encabezado Inicio, Perfil, Mi vivienda y Mi servicio. Excluidos: activos binarios, evidencia Maestro, manifests/lockfiles y trabajo de otros agentes. No se modificaron tokens compartidos.

Se leyeron `interface-review`, `better-interface` y los seis owners locales `better-*`. Revisión de fuente: nombres/roles/estados accesibles, controles de al menos TOUCH, texto de selección redundante con ✓, ScrollView y filas con wrap, etiquetas persistentes, errores recuperables, estados vacío/cargando/error/no disponible y ausencia de métricas ficticias. Se corrigió el éxito anunciado como alerta urgente: ahora región estable polite. No quedaron hallazgos accionables de fuente en el delta; esto **no aprueba visualmente** el render nativo.

Contraste calculado con los tokens declarados (no una medición de captura):

| Texto / fondo | Ratio |
|---|---:|
| text / bg | 13.64:1 |
| text / card | 14.68:1 |
| muted / bg | 5.54:1 |
| muted / card | 5.96:1 |
| primary / bg | 4.94:1 |
| primary / card | 5.32:1 |
| blanco / primary | 5.32:1 |
| danger / bg | 6.01:1 |

Cobertura no verificada: render/layout a 320 pt y texto grande, VoiceOver/TalkBack, navegación táctil real, posición nativa de Listo y persistencia real contra API 8011. El probe `xcrun simctl list devices booted` no pudo resolver `simctl` desde el developer directory activo; no se intentó iniciar ni reconfigurar Xcode/simuladores. API 8011 y servicios previos permanecen sin reinicio por solicitud del usuario.

## Archivos de la entrega original (24)

Todos relativos a `apps/mobile`:

```
ONBOARDING_PROFILE.md
src/api/errors.ts
src/api/errors.profile.test.ts
src/api/onboarding.ts
src/api/onboarding.test.ts
src/features/homes/AccountOnboardingScreen.tsx
src/features/homes/EnergyProfileFields.tsx
src/features/homes/onboardingModel.ts
src/features/homes/onboardingModel.test.ts
src/features/homes/onboardingUI.test.ts
src/features/homes/saveOnboarding.ts
src/features/homes/saveOnboarding.test.ts
src/navigation/AppNavigator.tsx
src/features/profile/model.ts
src/features/profile/model.test.ts
src/features/profile/keys.ts
src/features/profile/keys.test.ts
src/features/profile/saveVerified.ts
src/features/profile/saveVerified.test.ts
src/features/profile/hooks.ts
src/features/profile/ProfileScreen.tsx
src/features/profile/HomeProfileScreen.tsx
src/features/profile/ServiceProfileScreen.tsx
src/features/profile/navigation.test.ts
```

Pendiente de aceptación nativa cuando el usuario autorice reactivar servicios: onboarding real con Sin indicar/Sí/No, fallo parcial de contrato/meta y reintento, edición + GET de vivienda/contrato, cambio de vivienda/cuenta/logout con requests tardías, error de red y API antigua, texto grande y teclado iOS/Android; repetir piloto/Fase 2 sin cambiar sus flujos.
