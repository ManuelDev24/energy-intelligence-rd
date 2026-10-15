# ERD-OCR-REAL-QA — evaluación del OCR con facturas reales

**Aceptación parcial — verificación independiente 2026-10-11: 21/22 campos correctos, un importe ambiguo ausente y 0 valores incorrectos en las tres imágenes proporcionadas por el dueño.** La afirmación anterior de 22/22 no se reprodujo en `fef74c8` (resultado real inicial: 17/22); tras corregir selección y contraste de variantes, EDESUR y EDEESTE obtienen 8/8 y EDENORTE 5/6. En EDENORTE, el importe se deja vacío con advertencia explícita de revisión manual en vez de devolver un número incorrecto. Evidencia: [`ocr-real-fields.json`](evidence/dev-recovery-2026-10-11/ocr-real-fields.json), Tesseract 5.5.3 y versiones/hashes allí registrados.

⛔ **No es 22/22 ni aceptación productiva completa.** Estas tres capturas digitales se usaron para afinar; faltan facturas NO usadas para afinar, fotos de celular con perspectiva/sombra, PDF auténtico del portal y el recorrido nativo completo. El portal EDESUR devuelve documentos de error 500, no una factura verificable. Ninguna factura real entra al repositorio; imágenes, texto OCR y expectativas reales quedan fuera de git. El repositorio solo publica resultados por campo sin valores personales.

Los formatos y etiquetas se documentan en `docs/qa/OCR_FORMATOS_FACTURAS_RD.md`; sus cifras históricas anteriores no reemplazan esta reejecución.

## Qué se necesita
Mínimo 3 facturas por distribuidora (EDESUR, EDENORTE, EDEESTE): una foto nítida, una de celular con ángulo o sombra y,
si existe, una con consumo promediado. Tapar nombre, dirección, NIC/contrato y medidor; **no tapar** fechas, lecturas,
consumo ni total.

## Formato del directorio
```text
mis-facturas/
  expected.json
  edesur-01.jpg
  edeeste-01.jpg
```
```json
{
  "edesur-01.jpg": {"distributor": "EDESUR", "period_start": "2026-09-01", "period_end": "2026-09-30",
                    "days": "30", "kwh": "320", "amount_dop": "4500.00",
                    "reading_previous": "1000", "reading_current": "1320", "due_date": "2026-10-15"}
}
```
Cada campo es opcional: solo se puntúan los que escribas (valores copiados de la factura, no del OCR). `due_date` (fecha límite de pago) se añadió con ERD-ALERT-02: un error silencioso ahí haría que la alerta de pago avise un día equivocado.

## Ejecutar
```bash
cd backend/api
uv run python -m scripts.ocr_qa /ruta/a/mis-facturas --json /ruta/informe.json
```
Requiere Tesseract con `spa` (`apt install tesseract-ocr tesseract-ocr-spa`; ya está en la imagen Docker).

## Criterio de aceptación
- **Gate de seguridad (`passed`)** = 0 campos con valor equivocado y confianza `high`. Salida 0; **no implica exactitud completa**.
- **Exactitud (`exact`)** = todos los campos esperados correctos; se reportan `fields_ok` y `fields_total` por separado.
- `missing` o un valor incorrecto `inferred` no reprueban el gate de seguridad, pero sí impiden `exact`. La clasificación `wrong_flagged` depende de confianza, no garantiza por sí sola una advertencia visible: comprobar la revisión humana en web/móvil.
- Se reporta cada distribuidora para decidir si afinar el parser (con pruebas de formato y cifras sintéticas, nunca valores de una factura privada).
- Después, el recorrido completo (subir foto → corregir → confirmar → ver detalle e historial) se hace en web y móvil
  contra la API (ERD-BILL-LIVE-QA) con esas mismas facturas.

## Qué no cubre
No sustituye la prueba manual en dispositivo ni demuestra calidad con facturas que no estén en el conjunto.
