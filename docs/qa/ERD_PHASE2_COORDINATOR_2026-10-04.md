# Fase 2 — verificación independiente del coordinador

Fecha: 2026-10-04. Rama comprobada: `Dev`. Sin commit ni push. API auth dedicada `127.0.0.1:8011` con `/health` saludable. No se migró la base piloto.

## Gates ejecutados después de entrega web/móvil

Todos bajo Node 24, exit 0:
- `npm test`: core 29, contratos 7, cliente API 12, web 193 aprobadas / 5 omitidas, móvil 245 aprobadas / 11 omitidas. Omisiones de integración por variables ausentes, no equivalen a pruebas aprobadas.
- `npm run typecheck`: todos los workspaces sin errores.
- `npm run lint --workspace apps/web`: sin errores.
- Build web con `NEXT_PUBLIC_AUTH_ENABLED=true`, `API_BASE_URL=https://api.example.invalid`, `WEB_ORIGIN=https://app.example.invalid`, telemetría deshabilitada: compilación y generación de 18 páginas correctas. Incluye consumo, lecturas y meta.

## Integración real reejecutada

- Móvil: `AUTH_E2E_API_URL=http://127.0.0.1:8011 PHASE2_PILOT_PROBE_URL=http://127.0.0.1:8000 npx vitest run src/e2e/phase2Flow.e2e.test.ts`: 2/2 aprobadas, exit 0. Sonda piloto solo lectura.
- Web: Next dev temporal puerto 3021 apuntando a 8011; `verify_phase2_bff.py`: PASS, exit 0. Registro/vivienda desechables, tres lecturas, listado, rechazos duplicado/monotonía/futuro/sin zona, consumo diario/mensual y huecos, meta/progreso/tarifa SIE-121-2026-TF, rutas no permitidas, borrado con lectura posterior y logout 401. HTML protegido sin valores de cookies.
- `verify_auth_bff.py`: PASS, exit 0. Cookies, aislamiento, origen, revocación, cambio de cuenta y login tardío tras logout comprobados.
- Servidor Next dev del coordinador detenido antes del build.

## Pendientes y límites

- QA nativo del tramo entregado aprobado: coordinador comprobó los cuatro JUnit finales (2 iOS/2 Android), 28 aserciones/esperas por flujo (112 en total), hash piloto sin cambios e inspeccionó ambas hojas de contacto finales. Las pantallas corresponden a consumo/detalle/metas y el control iOS Listo está sobre el teclado. Móvil 245/11 omitidas y typecheck de todos los workspaces reejecutados tras la corrección nativa, exit 0. Evidencia detallada en ERD_PHASE2_NATIVE_2026-10-04.md. No certifica dispositivos físicos ni ausencia total de flakiness.
- Exportaciones iOS/Android reportadas por el agente de implementación; el coordinador todavía no las reejecutó. Bundling no sustituye QA nativo.
- Revisión visual web reportada por el agente; barras con animación normal todavía sin verificación independiente.
- API piloto 8000 conserva código anterior; móvil nuevo falla suave cuando estos endpoints no existen.
- Persisten bloqueos previos de dependencias, CI remoto y seguridad pública. Esta fase no completa el roadmap integral.
