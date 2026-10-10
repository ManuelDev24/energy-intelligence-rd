# ERD-OCR-01: lectura de factura por foto (backend)

## Regla "Nunca OCR → DB"
`POST /homes/{home_id}/bills/ocr` **nunca** crea ni modifica una factura. Devuelve un
`OcrDraft`: campos best-effort + nivel de confianza (`high` / `inferred` / `none`) +
`warnings` en español + un extracto del texto leído (`raw_text_excerpt`) para que la
persona lo compare contra el original.

El único camino real hacia la base de datos sigue siendo `POST /homes/{home_id}/bills`
(ya existente, con su propia validación). La UI debe: 1) subir la foto a `/bills/ocr`,
2) mostrar el borrador editable, 3) al confirmar, enviar los campos (editados o no) al
`POST /bills` normal.

## Motor
- `app/services/ocr/engine.py`: envoltorio sobre Tesseract (`pytesseract`), español+inglés
  (`spa+eng`). Límite de 10MB por archivo. Nunca lanza excepción no controlada: imagen
  corrupta o no reconocida → `UnreadableImage` → 422.
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
- **ERD-STORE-01** (almacenamiento S3/R2/MinIO) no existe todavía: la imagen subida se
  procesa en memoria y se descarta; no se guarda ninguna copia de la factura original.
  Si se quiere guardar la foto para auditoría, hace falta resolver storage primero
  (nota: MinIO no pulleaba en este entorno de desarrollo).
- **ERD-WORKER-01** (cola Redis/worker) no existe: el OCR corre síncrono dentro del
  request. Para fotos grandes o distribuidoras con facturas de varias páginas, esto
  debería moverse a un worker antes de producción.
- **ERD-OCR-03** (cola de OCR en el panel admin) no existe.
- No hay prueba con fotos reales de facturas dominicanas (EDESUR/EDENORTE/EDEESTE);
  las heurísticas se validaron con texto sintético. Pendiente QA con fotos reales.
