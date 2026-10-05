# Revisión independiente — onboarding, perfil y auth abuse (2026-10-04)

## Veredicto

**REQUEST CHANGES: 4 hallazgos Required reproducidos; ninguno Critical identificado en el alcance revisado.** No se requieren reescrituras integrales. El limitador backend no presentó un defecto bloqueante en las pruebas ejecutadas; la integración BFF sí pierde `Retry-After`.

Revisión read-only de producto, sobre `Dev` en `/Users/macbookpro/Desktop/energy-intelligence-rd`. Se leyeron primero documentación y tests de las últimas entregas, después sus implementaciones y dependencias necesarias. No se revisó ni se atribuyó a esta entrega el diff mezclado completo. Bases de alcance: `apps/web/ONBOARDING_PROFILE.md`, `apps/mobile/ONBOARDING_PROFILE.md`, `services/api/AUTH_ABUSE_PROTECTION.md`.

## Hallazgos accionables

### R1 — Required / P1: Mi vivienda móvil vuelve a enviar campos obsoletos que el usuario no modificó

**Referencias:**
- `apps/mobile/src/features/profile/HomeProfileScreen.tsx:27-30`: key por epoch/vivienda; el borrador solo se hidrata al montar.
- `apps/mobile/src/features/profile/HomeProfileScreen.tsx:39-44`: guardar serializa todo el borrador.
- `apps/mobile/src/features/profile/model.ts:32-35` y `apps/mobile/src/features/homes/onboardingModel.ts:37-43`: el PATCH contiene también opcionales/flags no editados.
- `services/api/app/services/homes.py:27-36`: el backend aplica todos los campos presentes, incluidos null explícitos.

**Escenario/evidencia:** vivienda compartida o actualizada en otro cliente; la query de perfil recibe la misma vivienda con `sector=Norte, has_ac=true`, después de que el editor se montara con `sector=Centro, has_ac=null`. La key no cambia. Editar solamente el nombre llama la mutación con `sector=Centro, has_ac=null`: restaura datos anteriores y borra una respuesta conocida aunque esos controles no se tocaron.

Repro temporal `review.test.tsx`, test `reproduce: profile refetch then editing only name includes stale sector and unknown flag in PATCH`: **pasa caracterizando el defecto**, con los componentes reales y hooks/primitivas nativas simulados. Salida real:

```text
PROBE_HOME: latest GET sector=Norte, has_ac=true; change name -> PATCH sector=Centro, has_ac=null
```

No es una conversión general null→false: los triestados están bien; aquí el problema es reenviar un null antiguo como una edición explícita. El repro confirma el payload de mutación, no una escritura contra un servidor móvil live.

**Remedio mínimo:** mantener campos dirty y emitir un PATCH únicamente con los campos realmente editados; refrescar los valores no dirty desde la última representación canónica. No emitir null salvo borrado explícito. Conservar los controles de epoch/home y GET posterior. Añadir regresión en la que un refetch modifica sector/flag mientras solo se cambia el nombre; esos campos deben omitirse. Requiere permitir payload parcial en el tipo local de `updateHome`, no cambios en contratos compartidos ni endpoint nuevo.

### R2 — Required / P2: «Consultar contrato de nuevo» no actualiza el número visible y puede restaurar el contrato antiguo

**Referencias:** `apps/mobile/src/features/profile/ServiceProfileScreen.tsx:27-30,37-42,53-58`.

`ContractEditor` mantiene `useState(initial)` y la key es solo epoch/home. La consulta manual actualiza la query, pero no el estado del input. La acción Guardar permanece habilitada aunque no haya edición.

**Evidencia:** montaje con `OLD-123`; pulsar Consultar llama refetch; simular su resultado canónico `NEW-456` mediante el hook deja visible `OLD-123`; Guardar llama `mutateAsync('OLD-123')`. Test temporal `reproduce: Consultar contrato de nuevo receives new GET data but still displays and saves old number`, sobre el componente real, **pasa caracterizando el defecto**:

```text
PROBE_CONTRACT: GET NEW-456 -> visible OLD-123 -> mutation OLD-123
```

**Remedio mínimo:** distinguir valor canónico de edición dirty. Una consulta explícita debe adoptar el número recién leído cuando no hay edición, o preguntar antes de reemplazar un borrador dirty. Deshabilitar Guardar si el usuario no cambió el número; conservar PUT+GET y guards. Añadir una regresión de refresh sin cambio de vivienda. No remonte incondicionalmente ante cada refetch: borraría ediciones en curso.

### R3 — Required / P2: el BFF descarta Retry-After del nuevo 429 de autenticación

**Referencias:**
- `apps/web/src/lib/auth/bff.ts:47-49,260-266`: reconstruye la respuesta de error sin copiar la cabecera.
- `services/api/app/main.py:36-45`: la API sí emite `Retry-After` y `no-store`.

**Evidencia:** `handleBff` real recibe un upstream controlado 429 de login con `Retry-After: 57`, `Cache-Control: no-store` y detalle privado. Devuelve 429, oculta el detalle, conserva `Cache-Control: no-store, private`, pero `headers.get('retry-after') === null`. Test temporal `reproduce: BFF loses Retry-After but retains no-store on an auth 429`: **pasa caracterizando el defecto**.

```text
PROBE_BFF: upstream Retry-After=57 -> downstream=null; no-store, private retained
```

El navegador pierde el plazo exacto para respetar el presupuesto; no se afirma pérdida de no-store ni bypass del limitador. El 429 solo se traduce en «espera un momento».

**Remedio mínimo:** al mapear un 429, añadir exclusivamente un `Retry-After` upstream validado como entero positivo y acotado al contrato de ventana. Mantener las cabeceras privadas locales y no reenviar el conjunto completo de headers. Regresión login/register con 429 y valor válido, más valores inválidos que no se reenvían.

### R4 — Required / P2: cambiar distribuidora en el perfil móvil no invalida el progreso monetario de la meta

**Referencias:**
- `apps/mobile/src/features/profile/keys.ts:7-8` y `hooks.ts:35-40`: invalidan perfil/lista/dashboard, no goal-progress.
- `apps/mobile/src/api/phase2Keys.ts:13`: progreso tiene clave independiente.
- `apps/mobile/src/api/queryClient.ts:2-3`: caché fresca durante 30 s.
- `apps/mobile/src/features/dashboard/DashboardScreen.tsx:269-271,307-312`: dashboard y tarjeta de meta se leen por queries distintas.
- `services/api/app/services/goals.py:140-165,184-185`: el monto/proyección desde lecturas depende de `home.distributor` y su tarifa; cambiar a Otra también puede cambiar disponibilidad.

**Evidencia:** una query goal-progress fresca, en el scope/vivienda de origen, sigue con `isInvalidated=false` tras ejecutar las invalidaciones reales de perfil. Un `fetchQuery` inmediato retorna el dato anterior sin consultar upstream. Test temporal `reproduce: home invalidations leave cached goal progress fresh after changing distributor`: **pasa caracterizando el defecto**, usando QueryClient real y datos de prueba, no cifras tarifarias inventadas.

```text
PROBE_CACHE: goal-progress invalidated=false; next fetchQuery returns previous distributor, upstream called=0
```

El dashboard puede mostrar la distribuidora nueva y una estimación/proyección RD$ de la anterior. Una query ya montada tampoco se refetchea solo por volverse stale; dura hasta el siguiente trigger de refetch o actualización manual. La representación monetaria concreta no se verificó en dispositivo/live.

**Remedio mínimo:** incluir `phase2Keys(scope).goalProgress(id)` entre las invalidaciones de esa vivienda tras PATCH; puede hacerse incondicionalmente para no complicar la mutación. No invalidar otras viviendas/cuentas. Añadir una prueba de keys y de retorno inmediato a Inicio con progreso precargado.

## Verificación independiente ejecutada

Todos los comandos JS usan Node 24 mediante fnm. Las suites API se ejecutaron secuencialmente, después de terminar la suite del coordinador, exclusivamente con `tests/run_isolated.py` hacia `energy_rd_auth_test`; sus fixtures recrean el esquema de esa DB dedicada, no producción/piloto. No hubo reset concurrente.

| Ejecución | Resultado real |
|---|---|
| Web: `npx vitest run src/test/profile-page.test.tsx src/components/onboarding-wizard.test.tsx src/lib/auth/onboarding.test.ts src/lib/auth/bff-onboarding.test.ts src/lib/auth/session.test.tsx` | 5 archivos, **50 passed**, exit 0 |
| Mobile: `npx vitest run src/features/profile src/features/homes/saveOnboarding.test.ts src/features/homes/onboardingModel.test.ts src/features/homes/onboardingUI.test.ts src/api/onboarding.test.ts src/api/errors.profile.test.ts src/auth/transport.test.ts` | 10 archivos, **37 passed**, exit 0 |
| API: `.venv/bin/python tests/run_isolated.py -q --tb=short tests/test_auth_abuse.py tests/test_api_onboarding.py tests/test_authorization.py` | **50 passed**, 1 warning previo, exit 0 |
| API: `.venv/bin/python tests/run_isolated.py -q --tb=short tests/test_auth_security.py -k unknown_and_foreign_home` | **5 passed**, 7 deselected, 1 warning previo, exit 0 |
| Probes JS en scratch, `vitest run --config .../vitest.config.mts --reporter=verbose` | **4 passed**, exit 0: afirman presencia de R1–R4; no son tests de correcciones |
| Probes API en scratch, `.venv/bin/python tests/run_isolated.py -q -s --tb=short .../test_limiter_extra.py` | **3 passed**, 1 warning previo, exit 0 |

Artefactos temporales reproducibles, todos fuera del producto:

```text
/Users/macbookpro/.hermes/cache/scratch/erd-onb-profile-review-20261004/
  vitest.config.mts
  review.test.tsx
  test_limiter_extra.py
  node_modules -> /Users/macbookpro/Desktop/energy-intelligence-rd/node_modules
```

Comando completo de los probes JS desde ese directorio:

```sh
fnm exec --using=24 /Users/macbookpro/Desktop/energy-intelligence-rd/node_modules/.bin/vitest run --config /Users/macbookpro/.hermes/cache/scratch/erd-onb-profile-review-20261004/vitest.config.mts --reporter=verbose
```

Comando completo del probe API desde `services/api`:

```sh
.venv/bin/python tests/run_isolated.py -q -s --tb=short /Users/macbookpro/.hermes/cache/scratch/erd-onb-profile-review-20261004/test_limiter_extra.py
```

### Controles que no generaron hallazgo nuevo

- **IDOR/permisos:** `tests/test_authorization.py:34-67,81-96` incluye GET/PATCH vivienda y GET/PUT contrato; se comprobaron outsiders, roles, miembro y delete owner-only. `tests/test_api_onboarding.py:54-83` verifica contrato ajeno vs desconocido con envelope idéntico salvo request_id. Se reejecutó además `test_auth_security.py:30-47` para vivienda.
- **Cambio de cuenta/vivienda y respuestas tardías:** web `profile-page.test.tsx:19-41`, `onboarding.test.ts:18-30,41-46`, wizard `:21-30`; mobile `saveVerified.test.ts:3-17`, transporte y guards de `profile/hooks.ts:24-47`. Se observan checks antes/después de escritura y GET, claves aisladas y remount por epoch/home; no se identificó publicación cross-account en este alcance. Los probes de R1/R2 mantienen la MISMA cuenta y vivienda: no son IDOR.
- **Confirmación GET:** web `profile/page.tsx:45-51,81-85,104-106` usa refetch con throwOnError; mobile `saveVerified.ts:3-9` publica después de GET+check. La falta de sincronización del input antes de guardar se reporta aparte, no se confunde con ausencia del GET posterior.
- **Nullable/partial retries:** triestados null/true/false; reintentos parciales reutilizan ID y PATCH/PUT, sin POST nuevo; resultados POST ambiguos bloquean nuevo envío dentro del wizard. Pruebas existentes web wizard y mobile saveOnboarding/onboardingModel/API pasan. Sin clave de idempotencia no se certifica deduplicación entre nuevos wizards/pestañas, límite ya documentado.
- **Allowlist/no-store:** `bff-onboarding.test.ts:25-61,69-72` rechaza cuerpos/rutas/queries inválidos antes de upstream, IDs ajenos, y conserva opcionales omitidos y no-store. R3 es pérdida de una cabecera concreta, no proxy abierto.
- **Atomicidad multiworker:** `test_auth_abuse.py:78-96` pasa con 16 intentos sobre 3 engines independientes: 4 admitidos y 12 bloqueados. `:99-114` verifica dos apps y spoof de Forwarded/X-Forwarded-For. Se revisó INSERT ON CONFLICT + FOR UPDATE + clock_timestamp posterior al lock + commit independiente (`services/auth_abuse.py:43-67`). No se afirma haber arrancado varios procesos Uvicorn.
- **Fail-closed y pool:** probe extra usa pool de una sola conexión sin overflow: login devuelve `[401,401,429]`, conexiones prestadas al terminar=0; no hay checkout anidado por el Session auth lazy. Con la única conexión ocupada devuelve **503 auth_unavailable, no-store**, auth no se ejecuta y al liberar no queda conexión prestada. Peer desconocido + cambio de X-Forwarded-For consume una única fila, segundo intento rechazado. Missing schema y contabilidad persistente después de fallo auth también pasan en la suite existente. No se hizo load test de saturación masiva.

## Límites e incidencias

- **No verificados:** navegador visual, layout responsive/zoom, VoiceOver/TalkBack, teclado/inputs UIKit/Android, navegación táctil nativa, Maestro y persistencia end-to-end web/móvil contra API live. React/jsdom con primitivas y hooks móviles simulados prueba estado de componentes, no certifica render nativo.
- No se reejecutaron build/export/typecheck/lint globales: sus resultados finales fueron suministrados por el coordinador; las comprobaciones de esta revisión son las tablas anteriores.
- No se reiniciaron servidores persistentes. El probe final de conexiones TCP en localhost encontró **8081, 8011, 8083 y 8084 cerrados**. PostgreSQL de tests se usó sin arrancar ni reconfigurar servicios.
- Primer intento del harness JS falló al resolver Testing Library (instalada en el workspace web); se corrigió solo el alias del config scratch, sin instalar nada. Primer probe API dio 422 porque su email `.test` no cumple el validador backend; se cambió únicamente el dato temporal a `example.com` y se volvió a ejecutar completo con `[401,401,429]`. Ninguno es hallazgo de producto.
- Warning previo de Starlette/httpx conservado; no se editaron dependencias. No se inspeccionaron ni imprimieron secretos, gateway o producción. Sin commits/push, borrados o cambios de fuente/packages/lockfiles/skills. Único archivo añadido al repo: este informe.
- NAT/BFF compartido, retención de buckets y registro 409/enumeración están documentados en `AUTH_ABUSE_PROTECTION.md:66-105`; no se presentan como defectos nuevos ni se solicita rediseño integral.

**Cierre:** el parent debe aplicar R1–R4 y agregar sus regresiones; esta revisión no modifica producto ni declara esas correcciones hechas. No quedaron hipótesis adicionales promovidas a Required sin reproducción.
