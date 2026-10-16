# ERD-WEB-RELEASE-QA — evidencia local

**Estado:** parcial, sin staging. **Baseline:** `origin/Dev` `f3cb2f42`, worktree aislado `/Users/macbookpro/Desktop/energy-intelligence-rd-web-release`. **Datos:** cuenta, vivienda y factura sintéticas; no datos reales de clientes.

## Recorrido

Spec: `frontend-web/app/e2e/specs/16-release-flow.spec.ts`. Usa la misma cuenta nueva para registro por UI → vivienda/onboarding → factura OCR con revisión/confirmación → consumo/lecturas → meta/Ahorro/Score → alertas → apagón → Copilot con fuentes → informe → reclamación → ayuda → perfil. Historial y lecturas necesarias para ejercitar alertas/Score se crean mediante el BFF contra la API local; la factura OCR es sintética y solo se guarda tras confirmación.

- Primera suite integral: **102/104 passed**. Los dos fallos eran del harness nuevo: selector inicial de GET fijado a un solo request, aunque React Query emitió dos; y etiqueta esperada `Guardar meta` cuando la UI dice `Guardar cambios`.
- Corregidos ambos. Reejecución focalizada: **2/2 passed**; suite integral final contra PostgreSQL/API/worker/BFF locales: **104/104 passed en 5.6 min**. Incluye el recorrido release y la prueba offline/reconexión corregidos.
- Las pruebas usan un stack local aislado y base desechable, con factura/persona sintéticas; al finalizar el runner borra la base y detiene los servicios. No es una aceptación de staging/producción.

## Navegadores, red y captura

- Playwright conserva la suite completa en Chromium; la suite incorpora cuatro smoke por cada proyecto: Firefox, WebKit, Pixel 7 emulado y iPhone 13 emulado.
- La suite integral final pasó **104/104**: 88 casos Chromium y 16/16 smoke adicionales en Firefox, WebKit, Pixel 7 e iPhone 13 emulados. Cubren reflow 320/375/640/768/1280 CSS px, teclado básico, carga de foto por el control `capture="environment"` y retardo de red. Pixel/iPhone son emulación; no prueban un iPhone/Android físico.
- 640 CSS px es un proxy para reflow cuando se duplica una ventana de 1280px, **no** una prueba de zoom real al 200%. No se ha probado cámara nativa física.
- La prueba E2E offline conserva el borrador, espera un GET posterior a la reconexión y verifica cero escrituras automáticas; pasó tanto focalizada como dentro del suite 104/104.

## Accesibilidad automatizada

- `12-a11y-layout.spec.ts` sigue dentro del job E2E que CI ejecuta. Axe cubre páginas públicas y 12 pantallas autenticadas a 360, 768 y 1280 px; todos los casos automatizados de axe/reflow pasaron dentro del suite final **104/104**.
- La suite automatizada verifica teclado, primer foco, anuncio de error y cierre/restauración de foco del diálogo. Esto no equivale a prueba manual con VoiceOver/NVDA, inspección manual de gráficos ni validación real al 200%.
- La prueba manual con lector de pantalla, foco de gráficos y formularios/dialogs todavía requiere una persona y sesión/dispositivo adecuados; marcada **pendiente**, no aprobada por axe.

## Gates y límites

- API: **1360 passed**; web unit: **904 passed / 5 skipped**; typecheck y lint web: OK. Playwright E2E local integral: **104/104 passed**.
- `next build` de producción, typecheck de todos los workspaces y lint web pasaron con orígenes HTTPS de marcador; build muestra una advertencia Node no bloqueante sobre `tailwind.config.ts` sin `type: module`.
- El job remoto de CI no se ejecutó. No hay aceptación en staging, navegador real Safari/iOS, Chrome/Android físico, datos reales consentidos ni verificación OCR con facturas anonimizadas de las distribuidoras.
- Términos y privacidad siguen siendo borradores hasta aprobación humana, con tratamiento de OCR, Copilot y notificaciones.
- El run local final no registró fallos; ningún resultado local equivale a aceptación de producción.
