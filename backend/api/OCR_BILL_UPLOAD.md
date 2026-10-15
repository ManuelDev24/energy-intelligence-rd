# ERD-OCR-01: lectura de factura por foto (backend)

## Regla "Nunca OCR → DB"
La lectura de una factura (`POST /homes/{home_id}/bills/ocr-jobs`, ver abajo) **nunca** crea ni modifica una factura. Deja un
`OcrDraft`: campos best-effort + nivel de confianza (`high` / `inferred` / `none`) +
`warnings` en español + un extracto del texto leído (`raw_text_excerpt`) para que la
persona lo compare contra el original.

El único camino real hacia la base de datos sigue siendo `POST /homes/{home_id}/bills`
(ya existente, con su propia validación). La UI debe: 1) subir la foto a `/bills/ocr-jobs` y consultar el trabajo hasta `done`,
2) mostrar el borrador editable, 3) al confirmar, enviar los campos (editados o no) al
`POST /bills` normal.

## Motor
- `app/services/ocr/pipeline.py` / `preprocess.py`: Tesseract (`pytesseract`, español+inglés `spa+eng`) con tiempo máximo por página, en el worker.
  (El antiguo `engine.py` y `POST /bills/ocr`, síncronos, se retiraron: bloqueaban el bucle de eventos; auditoría C-02.)
- `app/services/ocr/parser.py`: función **pura** `parse_bill_text(texto) -> OcrDraft`, sin
  acceso a BD, probada por separado del motor (7 pruebas con texto limpio y con errores
  típicos de OCR). Nunca lanza: entrada vacía o basura devuelve un draft con todo en `None`
  y advertencias.
- Heurísticas en español (EDESUR/EDENORTE/EDEESTE no tienen formato único documentado;
  se buscan patrones: "Período del X al Y", "Total a pagar RD$", "Consumo ... kWh",
  "Lectura anterior/actual"). Si la lectura actual quedara por debajo de la anterior
  (error típico de OCR), ambas se descartan con advertencia en vez de aceptarse ciegas.
- `days` se infiere de las fechas del período cuando no hay un "(N días)" explícito
  (confianza `inferred`, no `high`).
- Formato real de las tres distribuidoras (línea `dd/mm/aaaa - dd/mm/aaaa = N días`, tabla de
  lecturas, escalones `N kWh X RD$`) y ruido típico de Tesseract: ver
  `docs/qa/OCR_FORMATOS_FACTURAS_RD.md`. Si los días impresos no cuadran con las fechas leídas, el
  período baja a `inferred` con advertencia.

## Pendiente (fuera de este slice, documentado para no fingir que está resuelto)
- **ERD-STORE-01** (almacenamiento privado, ver `backend/api/STORAGE.md`) ya existe, pero el OCR aún no guarda el original (ERD-OCR-PROD): la imagen subida se
  procesa en memoria y se descarta; no se guarda ninguna copia de la factura original.
  Si se quiere guardar la foto para auditoría, hace falta resolver storage primero
  (nota: MinIO no pulleaba en este entorno de desarrollo).
- **ERD-WORKER-01** (cola en PostgreSQL, ver `docs/ops/JOBS.md`) ya existe, pero el OCR todavía no la usa (lo hace ERD-OCR-PROD): (resuelto por ERD-OCR-PROD: la lectura corre en el worker).
- **ERD-OCR-03** (cola de OCR en el panel admin) no existe.
- No hay prueba con fotos reales de facturas dominicanas (EDESUR/EDENORTE/EDEESTE);
  las heurísticas se validaron con texto sintético. Pendiente QA con fotos reales.


# ERD-OCR-PROD: lectura asíncrona de fotos y PDF

El flujo es **asíncrono** y es el único: `POST /bills/ocr` (síncrono) se **retiró** (auditoría C-02) porque ejecutaba Tesseract dentro del bucle de eventos y congelaba todo el servidor.

| Ruta | |
|---|---|
| `POST /homes/{id}/bills/ocr-jobs` | multipart `file` (+ `source`). **202** con el estado `pending`. Guarda el original cifrado (`STORAGE.md`) y encola `ocr.process` (`docs/ops/JOBS.md`). Máx. 3 lecturas activas por vivienda |
| `GET /homes/{id}/bills/ocr-jobs/{document_id}` | `pending → processing → done` o `failed`. En `done` trae el **borrador** (`OcrDraft`) y cómo se leyó (`method`, páginas) |
| `POST …/{document_id}/retry` | solo tiene efecto tras `failed`; crea un trabajo nuevo |
| `POST /homes/{id}/bills` con `document_id` | confirma la factura **y** asocia el original en la misma transacción; el borrador se descarta. Un original solo se liga a una factura |

**Lectura.** Imágenes (JPEG/PNG/WEBP/HEIC): se endereza por EXIF, se limita a 4000 px y se lee con Tesseract. PDF: por página, la **capa de texto** si tiene ≥ 80 caracteres (facturas electrónicas: exacto, sin OCR); si no, se renderiza (~180 dpi) y se lee con Tesseract. Máximo 6 páginas (`OCR_MAX_PDF_PAGES`); si hay más se avisa en `warnings`. PDF con contraseña → `protected_pdf`.

**Errores** (`error_code`, con texto local en cada cliente): `unreadable` y `protected_pdf` y `file_missing` no se reintentan; `engine_error` (Tesseract caído/tiempo agotado, almacenamiento con fallo) se reintenta 3 veces con espera creciente y luego queda `failed` con botón «Reintentar». Si el trabajo murió sin cerrar el estado, la consulta lo informa como `failed`.

**Datos.** `document_ocr` (migración 0018) guarda estado y el borrador (campos leídos + extracto de 500 caracteres); **nunca el texto completo**. El borrador se borra al confirmar; si no se confirma, todo cae con el original a los 7 días (`DOCUMENT_UNCONFIRMED_RETENTION_DAYS`, cifra propuesta pendiente de aprobación legal). La interfaz dice «se elimina automáticamente» sin dar la cifra.

**Regla que no cambia: nunca OCR → base de datos de facturas sin confirmación humana.**

## Verificado y no verificado
- Verificado: `tests/test_ocr_prod.py` (31) incluye Tesseract **real** sobre texto renderizado (foto y PDF escaneado de 2 páginas) y PDF con capa de texto generado a mano; web (7 pruebas de la página + 14 del BFF), cliente y móvil (lógica y estructura); y una corrida en navegador real contra API+worker+BFF (`docs/qa/evidence/ocr-prod-2026-10-10/`, 12/12).
- **No verificado**: calidad con facturas reales de EDESUR/EDENORTE/EDEESTE (todo lo anterior es texto sintético; ver ERD-OCR-REAL-QA), HEIC de un iPhone real (probado con un HEIC generado), PDF multipágina real de una distribuidora, rendimiento con carga, y la pantalla móvil en dispositivo (solo typecheck, vitest y export Metro). El selector de PDF móvil usa `expo-document-picker`, un módulo nativo nuevo: un *development build* anterior necesita reconstruirse.
- Sin un worker en marcha, la lectura se queda en «Analizando…» (la interfaz avisa a los 60 s): en local, `python -m app.worker` o `docker compose --profile jobs up worker`.
