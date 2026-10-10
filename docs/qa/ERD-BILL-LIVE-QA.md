# ERD-BILL-LIVE-QA — carga, corrección, detalle e historial de facturas

Fecha: 2026-10-10 · Rama `claude/elegant-ptolemy-sdr69r`.

**Estado: tubería validada en web contra API real con una imagen SINTÉTICA. ⛔ Falta (a) hacerlo con facturas reales
anonimizadas (las aporta Manuel; ver `OCR_REAL_QA.md`) y (b) el recorrido móvil en dispositivo.**

## Defecto encontrado y corregido: el OCR no funcionaba en web con cuentas autenticadas
Con `NEXT_PUBLIC_AUTH_ENABLED=true` (la configuración de producción) el BFF respondía `415 Se requiere JSON` a
`POST /homes/{id}/bills/ocr`, porque solo aceptaba cuerpos JSON. Ningún QA anterior lo vio: se hicieron en modo piloto
(sin BFF) o con pruebas unitarias contra el cliente. Corrección (TDD, `apps/web/src/lib/auth/bff-ocr.test.ts`, 14 pruebas):
multipart permitido **solo** en esa ruta, con `multipart/form-data` + boundary obligatorio (si no, 415), tope de 10 MiB
+ sobre (413, también por `Content-Length` antes de leer), sin parámetros de consulta, mismo origen y sesión
obligatorios, respuesta validada con `OcrDraftSchema` (si no cumple el contrato, 502) y errores sin texto de la API.
Tiempo de espera de 45 s para esa ruta (Tesseract tarda más que una consulta; el resto sigue en 10 s).

## Resultados (`evidence/bill-live-2026-10-10/web-bill-live.py`, 8/8)
| Comprobación | Resultado |
|---|---|
| Subir foto devuelve un borrador y **no crea factura** | ✅ |
| Formulario precargado con lo leído (kWh 320.00, período 2026-09-01) | ✅ |
| Corrección humana del monto (4,500.00 → 4,550.00) y confirmación crea exactamente 1 factura con el valor corregido | ✅ |
| La factura confirmada se guarda con `source=manual` (nunca `ocr`) | ✅ |
| Historial la lista; detalle muestra consumo, monto, días y lecturas | ✅ |
| Factura inválida (kWh −5) rechazada con 422 y no se crea | ✅ |

Capturas: `evidence/bill-live-2026-10-10/bill-{1-borrador,2-historial,3-detalle}.jpg`.
Pila: PostgreSQL 16, API `AUTH_ENABLED=true` `:18011`, web `next dev` `:3011`, Tesseract 5.3 (`spa+eng`), Chromium.

## No cubierto
- Fotos reales de EDESUR/EDENORTE/EDEESTE y fotos de celular (ruido, ángulo): ver ERD-OCR-REAL-QA.
- Móvil iOS/Android contra la API (la subida móvil usa el cliente directo con bearer, sin BFF, por lo que este
  defecto no le afecta, pero no se ejecutó en dispositivo): ERD-E2E-MAESTRO-AUTH.
- La foto original no se conserva: es el comportamiento actual documentado hasta ERD-STORE-01/ERD-OCR-PROD.
