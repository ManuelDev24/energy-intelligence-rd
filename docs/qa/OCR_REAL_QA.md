# ERD-OCR-REAL-QA — evaluación del OCR con facturas reales

**Estado: arnés listo; evaluación ⛔ pendiente de las facturas (las aporta Manuel).** Ninguna factura real entra al
repositorio: se guardan fuera de él (o en `qa-private/`, ignorado por git) con los datos personales tapados.

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
                    "reading_previous": "1000", "reading_current": "1320"}
}
```
Cada campo es opcional: solo se puntúan los que escribas (valores copiados de la factura, no del OCR).

## Ejecutar
```bash
cd services/api
uv run python -m scripts.ocr_qa /ruta/a/mis-facturas --json /ruta/informe.json
```
Requiere Tesseract con `spa` (`apt install tesseract-ocr tesseract-ocr-spa`; ya está en la imagen Docker).

## Criterio de aceptación
- **Aprobado** = 0 campos con valor equivocado y confianza `high` (errores silenciosos). Salida 0.
- Un campo que no se lee (`missing`) o se lee mal avisando (`inferred` + `warnings`) no reprueba: la persona lo corrige.
  Se reporta por distribuidora para decidir si hay que afinar el parser (con una prueba nueva por cada caso, anonimizado).
- Después, el recorrido completo (subir foto → corregir → confirmar → ver detalle e historial) se hace en web y móvil
  contra la API (ERD-BILL-LIVE-QA) con esas mismas facturas.

## Qué no cubre
No sustituye la prueba manual en dispositivo ni demuestra calidad con facturas que no estén en el conjunto.
