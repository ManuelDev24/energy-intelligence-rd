# ERD-HELP-01 — Centro de ayuda (API, web y móvil)

Estado: **implementado y verificado con pruebas de API, unitarias y Playwright (web); NO verificado en dispositivo.**

## Qué hay
- **Contenido versionado** en `services/api/app/services/help_content.py` (`CONTENT_VERSION`, 6 categorías, 16 artículos de texto simple). Cada cambio de texto sube
  la versión y queda en git. Describe solo lo que la app hace hoy; lo estimado se llama estimado.
- **API pública** (solo GET, sin datos de personas): `GET /api/v1/help?q=&category=` y `GET /api/v1/help/articles/{id}`. Búsqueda en el servidor sin acentos ni
  mayúsculas, todos los términos deben aparecer (título 10 > etiquetas 6 > resumen 3 > cuerpo 1), mínimo 2 letras, máx. 80 caracteres y 20 resultados.
- **Contacto honesto**: `SUPPORT_EMAIL` (vacío por defecto). Sin correo configurado, la pantalla dice que aún no está configurado; no se inventa ninguna vía.
- **Web** `/help` (menú «Ayuda») y **móvil** (Perfil → Ayuda): búsqueda con retraso, categorías, artículos desplegables con carga bajo demanda y contacto.

## Pendiente
1. Definir el **correo de soporte** real (variable `SUPPORT_EMAIL`, ver `docs/deploy/ENV_CHECKLIST.md`) y quién responde, en cuánto tiempo.
2. **Revisión editorial** del contenido por producto/legal (textos sobre privacidad y borrado de datos).
3. Sin verificar en Android/iOS.

## Pruebas
`services/api/tests/test_help.py`, `apps/web/src/test/help-page.test.tsx`, BFF en `bff-recommendations.test.ts`, `packages/api-client/src/reports.test.ts`,
`apps/web/e2e/specs/15-claims-help.spec.ts` y `apps/mobile/src/features/help/help.test.ts`.
