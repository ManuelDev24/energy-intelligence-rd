# ERD-RPT-01 — Informe energético (API, web y móvil)

Estado: **implementado y verificado con pruebas de API, unitarias y Playwright (web); NO verificado en dispositivo ni como PDF real.**

## Contrato
`GET /api/v1/homes/{home}/reports/energy?from=AAAA-MM-DD&to=AAAA-MM-DD` (solo lectura, `Cache-Control: no-store`, mismo `authorize_home` que el resto).
Sin fechas: últimos 365 días hasta hoy (America/Santo_Domingo). Máximo 366 días; `from ≤ to ≤ hoy`, si no 422.
- Cuenta las facturas cuyo período **termina** dentro del rango; el período anterior tiene la misma duración y se compara con el mismo criterio.
- Cada cifra lleva `quality`: totales y gasto de facturas `REAL`; precio medio, promedio por factura, variaciones, reparto por equipo y ahorros `ESTIMATED`.
- Sin facturas: totales `null` y una nota; nunca ceros inventados. Sin período anterior: `comparison: null` con nota.
- No incluye dirección, contrato ni datos de otras personas (`home`: nombre, distribuidora, provincia, municipio).
- Tope de 60 facturas por informe (con nota si se alcanza).

## Clientes
- **core** (`report.ts`): `energyReportView` y `energyReportToText` — mismas etiquetas en web y móvil.
- **Web** `/reports` (menú «Informes»): período editable, vista imprimible (el menú lateral/inferior se oculta al imprimir) y botón
  «Imprimir o guardar PDF» que abre el diálogo del navegador. No se añadió ninguna librería de PDF.
- **Móvil** (Perfil → «Informe energético»): períodos 6 meses / 12 meses / este año y «Compartir informe» con el menú nativo (texto plano).

## Límites conocidos
1. **PDF generado por la app**: web depende del diálogo de impresión del navegador; en móvil solo se comparte texto. Un PDF propio requiere
   decidir una dependencia (`reportlab` en la API o `expo-print` en móvil) — no se agregó sin esa decisión.
2. Basado en **facturas mensuales**: no hay medición diaria ni por hora (se dice en las notas del informe).
3. Móvil: sin verificar en Android/iOS (menú de compartir, lectores de pantalla).

## Pruebas
`services/api/tests/test_reports.py` (6, también como `erd_app` en el inventario de autorización), `packages/core/src/report.test.ts`,
`apps/web/src/test/reports-page.test.tsx`, BFF en `bff-recommendations.test.ts`, `apps/web/e2e/specs/14-reports.spec.ts`
(totales, comparación, estimados, impresión, axe a 360/768/1280, privacidad entre cuentas) y `apps/mobile/src/features/reports/reports.test.ts`.
