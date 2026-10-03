# ERD-WEB-ENERGY

La página principal integra el API ERD-CORE-API publicado en main. Usa NEXT_PUBLIC_API_URL (base, sin /api/v1), GET /api/v1/homes y GET /api/v1/homes/{id}/bills y /dashboard. React Query cancela solicitudes obsoletas y separa la caché por vivienda y base URL; Zod valida respuestas, decimales, fechas, calidad y pertenencia a la vivienda. No se modifica el backend ni configuración global.

API real es el modo inicial. Un fallo permanece visible con Reintentar; no activa demo silenciosamente. El selector permite explorar fixtures tipados ficticios. Las facturas seed del API también se marcan DEMO.

El selector de período controla consumo y comparación. La comparación requiere una factura única del mes calendario anterior, utiliza los totales de cada período y no rellena huecos. Los períodos completos quedan visibles; no se reparten facturas entre meses, días u horas. Cero kWh es un valor válido y una base cero no produce porcentaje.

Proyección, alerta y recomendación pertenecen al dashboard actual de la vivienda: el endpoint no acepta período, por lo que la UI indica que su base son las últimas facturas y no el período histórico seleccionado. Las métricas conservan la calidad del API. Facturas son REAL según el contrato publicado. Alertas y recomendaciones sin calidad explícita en el API se identifican INFERRED como orientación derivada por reglas; esto no implica medición ni atribución a equipos. ESTIMATED permanece en la leyenda; no se muestran promedios diarios como lecturas medidas.

La gráfica tiene nombre y descripción accesibles y una tabla equivalente con períodos, valores y fuentes. No presenta consumo horario ni telemetría en tiempo real.

Validación: pnpm --dir apps/web typecheck; pnpm --dir apps/web test; pnpm --dir apps/web lint; pnpm --dir apps/web build. Los tests cubren contrato HTTP y decimales inválidos, vivienda equivocada, comparación y base cero, loading/error/retry/empty, demo, selección y gráfica accesible. Para QA manual iniciar el API con sus migraciones y seed según services/api/README.md; seleccionar cada vivienda y períodos históricos, desconectar API para revisar el error, cambiar a demo y revisar móvil/teclado.
