# Verificación nativa ERD-UI-KIT — 2026-10-04 (cerrado)

## Entorno

- API local y PostgreSQL en Docker, `GET /health` sano.
- Node 24, Expo Go, Maestro 2.11.0.
- Android: `EnergyRD_Pixel`, Expo Go, API `http://10.0.2.2:8000`, Metro `:8081`.
- iOS: iPhone 18 Pro, simulador iOS 27.0, Expo Go, API `http://127.0.0.1:8000`, Metro `:8081`, `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`, `NODE_OPTIONS=--dns-result-order=ipv4first`.

## Resultado final

| Plataforma | Recorrido `apps/mobile/maestro/pilot-flow.yaml` | Estado |
|---|---|---|
| Android | Onboarding → vivienda PILOT-05 → dashboard y proyección → factura inválida (error de kWh) → factura válida → alerta crítica → descarte → equipos → borrar factura temporal | **PASA** |
| iOS | Mismo recorrido completo | **PASA**, repetido dos veces seguidas sin fallos (77/77 pasos cada vez) |

## Historial: por qué iOS fallaba y cómo se resolvió

**Síntoma:** después de tocar `save-bill` con kWh en `-5`, `f-kwh-error` no aparecía en el recorrido continuo de Maestro en iOS, aunque la ejecución aislada (solo ese paso) sí lo mostraba. Esto apuntaba a un problema de estado/foco entre pasos, no a la regla de validación en sí (`apps/mobile/src/lib/billForm.ts: validateBill` ya rechazaba kWh negativo; `packages/core` no cambió).

**Causa raíz (debugging sistemático, cuatro fases):** el paso previo cerraba el teclado tocando la etiqueta de texto "Días". En Android eso quita el foco del `TextInput` de forma confiable. En iOS, con el teclado decimal (`keyboardType="decimal-pad"`, sin tecla Return) y `keyboardShouldPersistTaps="handled"`, ese toque no garantiza que el input pierda el foco antes del toque siguiente en `save-bill`; el guardado podía dispararse con el campo kWh todavía en edición, dejando la UI en un estado intermedio donde el error de validación no se renderizaba de forma estable.

**Intentos descartados (no atacaban la causa, documentados para no repetirlos):**
- `hideKeyboard` de Maestro → falla explícitamente con este teclado decimal en este simulador.
- `keyboardDismissMode="on-drag"` + `swipe` para arrastrar y cerrar el teclado → inestable, mismo resultado.
- `keyboardShouldPersistTaps="always"` + segundo toque condicional en `save-bill` → enmascaraba el síntoma sin resolver el foco; además arriesgaba un doble submit.

**Fix de raíz:** un botón "Listo" propio (`testID="keyboard-done"`), mostrado solo en iOS sobre el teclado mientras está abierto (`Keyboard.addListener('keyboardWillShow'/'keyboardWillHide')` + altura real del teclado), que llama explícitamente a `Keyboard.dismiss()`. El test de Maestro ahora, en el paso de cerrar teclado, toca `keyboard-done` en iOS y sigue tocando "Días" en Android (donde nunca falló).

## Cambios

- `apps/mobile/src/features/bills/BillFormScreen.tsx`: barra "Listo" de 44pt sobre el teclado en iOS.
- `apps/mobile/maestro/pilot-flow.yaml`: `runFlow` por plataforma en los dos puntos donde se cierra el teclado antes de guardar.

## Verificación

- Maestro iOS: **2/2 ejecuciones completas, 77/77 pasos cada una**, sin fallos.
- Maestro Android: recorrido completo, sin cambios de comportamiento.
- `fnm exec --using=24 npx vitest run` (apps/mobile): 57 pasan, 8 omitidas — sin regresión (antes del fix: mismo número).
- `fnm exec --using=24 npx tsc --noEmit`: pasa.
- PostgreSQL tras las ejecuciones: 5 viviendas, 13 facturas, 13 equipos (las facturas de prueba de ambos recorridos quedaron limpiadas por el propio flujo).

**QA móvil queda cerrado:** Android e iOS pasan el recorrido Maestro completo contra la API real, sin regresiones en tests ni typecheck. Nada de esto tiene commit todavía.
