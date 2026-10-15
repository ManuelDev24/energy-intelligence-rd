# ERD-AI-CHAT-MOBILE — Energy Copilot en la app móvil

Estado: **implementado y verificado con pruebas de lógica y CI; NO verificado en dispositivo Android/iOS.**

## Qué hay
- Pantalla `Copilot` (Stack, icono ✦ en el encabezado de Inicio): chat con streaming SSE, detener, reintentar, historial
  (abrir / renombrar / borrar con confirmación), nueva conversación, uso diario, período (30 días / 90 días / 12 meses),
  seis preguntas rápidas, fuentes con calidad del dato (`REAL/ESTIMATED/PROJECTED/INFERRED`) y valoración útil / no útil.
- Reutiliza `@energyrd/core` (acciones rápidas, lector SSE, Markdown seguro), `@energyrd/api-client` (operaciones JSON) y
  `@energyrd/api-contracts` (esquemas Zod). Solo la capa de pantalla es nativa; la API es la misma que usa la web.
- Streaming: `expo/fetch` (entrega `response.body` como flujo) envuelto con el transporte autenticado de la app (renovación de sesión).
  Si un runtime no entrega el flujo, se lee el texto completo y se procesa igual (sin efecto «en vivo», con el mismo resultado).

## Seguridad y privacidad (ERD-AI-SAFETY-MOBILE)
- Markdown seguro: nodos nativos; nunca HTML; solo rutas internas permitidas (`linkTarget`); ningún `Linking.openURL`.
- Texto de error y de rechazo: siempre local (`model.ts`); el `detail`/`message` del servidor no se muestra.
- Cambiar de vivienda o de cuenta aborta la respuesta en curso y limpia el chat; las claves de caché incluyen cuenta y vivienda.
- Cuota diaria y apagado (`COPILOT_PROVIDER=disabled`) se respetan: el compositor se oculta o se desactiva con un aviso.
- Tope de 512 KB por respuesta leída; ids validados como UUID antes de construir la URL.

## Pruebas
- `src/features/copilot/copilot.test.ts` (Vitest): lector de streaming (fragmentos, eventos inválidos, límite, red, aborto, sin flujo),
  reductor de estado, período, errores, enlaces, y comprobaciones estructurales de seguridad.
- Escáneres existentes (`a11yStatic`, `keyboardGuard`) ya cubren la pantalla nueva.
- Con el proveedor `fake` de la API (solo development) se puede recorrer el flujo completo en un dispositivo. **Claude real no se probó**
  (requiere `ANTHROPIC_API_KEY` y autorización de gasto).

## Pendiente (requiere dispositivo o decisión)
1. Recorrido en Android e iOS con el proveedor `fake`: enviar, detener, reintentar, historial, teclado, avisos.
2. VoiceOver / TalkBack: foco al llegar la respuesta, anuncio de «Pensando…» y de errores, orden de lectura.
3. Sin conexión: la app no incluye NetInfo; el estado sin conexión se muestra al fallar el envío (con «Reintentar»), no antes.
4. Probar el streaming real de `expo/fetch` en release build (puede variar por versión de Expo).
5. Política de privacidad del Copilot y prueba con proveedor real en staging.
