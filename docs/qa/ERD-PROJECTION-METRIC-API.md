# ERD-PROJECTION-METRIC-API — variación de la proyección calculada por la API

Fecha: 2026-10-10 · Rama `claude/elegant-ptolemy-sdr69r`. Cierra el hallazgo **H1** de `ERD-WEB-QUALITY.md`.

## Cambio
- `GET /homes/{id}/dashboard` → `projection.kwh_pct_vs_latest`: `Metric` de unidad `%` y calidad **`PROJECTED`**
  (`(kwh proyectados − kwh última factura) / kwh última factura × 100`, `Decimal`, redondeo half-up a 2 decimales).
  `null` si la última factura tiene 0 kWh (no se inventa un porcentaje). Con default `None` en el contrato: un cliente
  nuevo contra una API anterior recibe `null` y no muestra nada.
- Web y móvil dejan de calcularlo: solo formatean el valor de la API. Se elimina `projectionDeltaPct` de `@energyrd/core`.

## Evidencia
- API: `test_calculations.py` (+2: redondeo, signo, base 0), `test_api_dashboard.py` (+2 casos y la aserción del caso
  exacto 400 vs 350 = `14.29`). Suite completa de la API en verde.
- Web: 2 pruebas nuevas en `dashboard-page.test.tsx`. La primera fija una variación de la API (`99.00`) distinta de la que
  daría la aritmética del cliente (`15.87`) y comprueba que la UI muestra la de la API; la segunda, que sin variación no
  se muestra nada. La prueba genérica `expectDashboardRendered` (cada métrica de la API con su valor y su etiqueta de
  calidad) ahora cubre la métrica nueva, lo que obligó a pintar el porcentaje junto a la etiqueta «Proyectado».
- Real: API con PostgreSQL (`400 → 300 kWh`, proyección `200.00` → `-33.33 %` `PROJECTED`).
- Contratos regenerados (`contracts:check` sin deriva). Core 29, contratos 17, cliente 39, web 604, móvil 372.

## Otros cálculos de negocio que siguen en el cliente
- **Porcentaje de consumo por equipo** (web `equipment-breakdown-chart`, móvil `chartMath`): se mueve a la API en
  **ERD-DEV-02**.
- Suma de conceptos mientras se edita una factura (vista previa; el total oficial lo valida `POST …/validate`),
  proporciones de barras/medidores y `suggestNextPeriod` (fecha por defecto del formulario): presentación, no negocio.
