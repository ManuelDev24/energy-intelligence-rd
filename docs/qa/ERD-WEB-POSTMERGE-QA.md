# ERD-WEB-POSTMERGE-QA — Regresión del dashboard integrado (post PR #16)

- Fecha: 2026-10-10 · Ejecutó: Manuel (tarea asignada a Anthony; no había evidencia ni commit reportado).
- Base: `Dev` en `4fbdc75` + correcciones de esta tarea y de ERD-WEB-QUALITY.
- Entorno: PostgreSQL 16 + API reales en contenedores aislados (`:18001`, seed de 5 viviendas piloto),
  web `next dev` `:3000`, Chromium headless (Playwright). Script y resultados:
  `docs/qa/evidence/rel-verify-2026-10-10/web-qa/` (`qa.py`, `results.json`, capturas).

## Resultado: ✅ 90/90 comprobaciones, con 1 defecto encontrado y corregido

| Área | Resultado | Cómo se verificó |
|---|---|---|
| Selector de vivienda (barra lateral) | ✅ PILOT-01 → PILOT-02 cambia nombre, distribuidora y datos; no quedan valores de la vivienda anterior | `select` "Vivienda activa" |
| Selector de período | ✅ "1–31 jul 2026" pide `/dashboard?bill_id=…`, muestra "Resumen histórico" y la factura de julio (280 kWh) que devuelve la API | respuesta interceptada |
| Comparación | ✅ "Vs. período anterior" con los deltas de la API (jun → jul: +30 kWh, +12.00 %) | `web-period-jul-PILOT-01.jpg` |
| Proyección | ✅ 486.67 / 315 / 270 / 366.67 / 260 kWh con **PROYECTADO** en las 5 viviendas = API | `web-dashboard-PILOT-0*.jpg` |
| Alertas | ✅ PILOT-01 Crítica, PILOT-03 Advertencia, resto sin alerta, igual que la API; alerta nueva tras registrar factura aparece en `/alerts` y en el contador | `web-flow-PILOT-05-alert.jpg` |
| Loading | ✅ esqueleto con `role=status` mientras la API tarda 3 s | `web-state-loading.jpg` |
| Empty | ✅ vivienda nueva sin facturas: "Aún no hay facturas" + "Registrar factura" | `web-state-empty.jpg` |
| Error con Reintentar | ✅ 500 en `/dashboard` y API apagada (`docker stop`); Reintentar recupera sin recargar | `web-state-error-dashboard-500.jpg`, `web-state-api-down.jpg` |
| Errores HTTP independientes | ✅ `/dashboard` en 500 → el selector de períodos (facturas) y el contador de alertas siguen funcionando; `/alerts` en 503 → el dashboard sigue completo | `results.json` |
| Etiquetas de calidad | ✅ cada métrica no-REAL de la API lleva su etiqueta (2 ESTIMADO + PROYECTADO); textos en español; leyenda REAL/ESTIMADO/PROYECTADO en "Estado de los datos" | `results.json` |
| Sin telemetría horaria falsa | ✅ `resolution=monthly` en las 5 viviendas; ningún texto `kWh/h`, "por hora" ni rangos horarios en dashboard ni en las 10 pantallas internas | `results.json` |

## Defecto encontrado y corregido

**El estado de error mostraba el texto crudo del servidor.** Forzando un 500 con `detail: "SECRET-UPSTREAM"`,
el dashboard pintaba "SECRET-UPSTREAM". En el piloto (sin BFF) `QueryState` usaba `error.message`, que el
cliente copia del `detail` de la API. Corregido: `QueryState` usa `userMessage(error, "load")` (texto local por
estado HTTP) y lo mismo en alta/edición/borrado de facturas, OCR, equipos y alertas. Prueba:
`apps/web/src/test/error-text.test.tsx` (RED → GREEN). Tras el cambio: "Error del servidor. Inténtalo de nuevo más tarde."

## Observaciones sin corregir (no bloquean)
- El "+15.87 % vs. la última factura" del inicio se calcula en el cliente (H1 de ERD-WEB-QUALITY).
- Con la API apagada se ven dos tarjetas de error (períodos y dashboard), cada una con su Reintentar.

## Puertas
`npm run typecheck` 0 errores · `npm run lint -w apps/web` OK · web 525 pasan / 5 omitidas (530/530 con
`LIVE_API_URL`) · core 29 · contratos 16 · api-client 39 · móvil 372.
