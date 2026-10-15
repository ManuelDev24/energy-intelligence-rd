# ERD-RPT-01 — Informe energético (API, web y móvil)

Estado: **implementado y verificado con pruebas de API, unitarias y Playwright (web, incluida la descarga de un PDF real); NO verificado en dispositivo.**

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
- **PDF (API, `reportlab`)**: `GET /homes/{home}/reports/energy.pdf?from&to` (con sesión) y `POST …/reports/energy/pdf-link` → enlace firmado de 2 minutos
  (`/api/v1/reports/download?token=rpt1.…`, sin Authorization; revalida la membresía; un token de documento no sirve y viceversa). Solo fuentes estándar de PDF
  (Latin-1): sin descargas ni archivos externos; los textos de la persona se escapan.
- **Web** `/reports` (menú «Informes»): período editable, vista imprimible, «Descargar PDF» (el BFF reenvía solo un PDF real de ≤ 2 MB con cabeceras fijas) e «Imprimir».
- **Móvil** (Perfil → «Informe energético»): períodos 6 meses / 12 meses / este año, «Abrir PDF» (enlace firmado abierto con el visor del sistema; sin
  dependencias nativas nuevas) y «Compartir informe» (texto).

## Límites conocidos
1. **Dependencia nueva**: `reportlab` (BSD, pura de Python) en `services/api`; decisión tomada para tener un solo PDF idéntico en web y móvil. El texto del PDF
   está escrito en Python (`report_pdf.py`) en paralelo al de `core/report.ts`: si cambia uno, cambiar el otro (hay pruebas de contenido en ambos).
2. Basado en **facturas mensuales**: no hay medición diaria ni por hora (se dice en las notas del informe).
3. Móvil: sin verificar en Android/iOS (apertura del PDF con el visor del sistema, menú de compartir, lectores de pantalla).

## Pruebas
`services/api/tests/test_reports.py` (6, también como `erd_app` en el inventario de autorización), `packages/core/src/report.test.ts`,
`apps/web/src/test/reports-page.test.tsx`, BFF en `bff-recommendations.test.ts`, `apps/web/e2e/specs/14-reports.spec.ts`
(totales, comparación, estimados, impresión, axe a 360/768/1280, privacidad entre cuentas) y `apps/mobile/src/features/reports/reports.test.ts`.
