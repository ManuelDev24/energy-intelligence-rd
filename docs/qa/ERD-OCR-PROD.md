# ERD-OCR-PROD — OCR asíncrono, estados, reintentos, PDF multipágina, conserva el original

Detalle técnico: `backend/api/OCR_BILL_UPLOAD.md` (sección ERD-OCR-PROD), `backend/api/STORAGE.md`, `docs/ops/JOBS.md`.

## Criterios de aceptación
| Criterio | Evidencia |
|---|---|
| Subir devuelve de inmediato (202) y la lectura ocurre en segundo plano | `test_submit_returns_202_pending…`; navegador: progreso visible antes del borrador |
| Estados `pending/processing/done/failed` visibles al cliente | `test_engine_errors_retry_then_fail…` (processing con intento 1 visible); pruebas de página web |
| Reintentos automáticos (3) y reintento manual | `test_engine_errors_retry_then_fail_and_can_be_retried_by_hand`, `test_storage_hiccup_retries…` |
| Errores permanentes no se reintentan | `test_unreadable_file_fails_permanently_without_retries`, `test_tampered_object_fails_without_retrying` |
| PDF multipágina (capa de texto, escaneado y mixto), tope de páginas | `test_pdf_*`, `test_page_limit_*`, `test_real_tesseract_reads_a_scanned_two_page_pdf` |
| Conserva el original y lo liga a la factura confirmada | `test_confirming_the_bill_attaches_the_original_and_drops_the_draft`; navegador: 2 documentos ligados |
| Nunca OCR → facturas sin confirmación | `test_worker_turns_a_photo_into_a_draft_never_a_bill`; navegador: `bills == []` tras leer |
| Idempotente y a prueba de borrado a mitad | `test_job_is_idempotent_and_survives_the_document_being_deleted` |
| Aislamiento entre viviendas y personas | `test_strangers_cannot_start_poll_or_retry`, `test_confirming_with_a_foreign_or_unknown_document_rolls_back_the_bill`, inventario de rutas en `test_authorization.py` |
| No se guarda el texto completo | `test_stored_draft_never_contains_the_full_text`; el borrador se vuelve NULL al confirmar |
| Clientes: web y móvil | `new-bill-page.test.tsx` (7), `bff-ocr-jobs.test.ts` (12), `ocr.test.ts` del cliente (6), `ocrModel.test.ts` móvil |

## Hallazgos durante la verificación (corregidos)
1. `max_attempts` declarado en `@register` no se aplicaba al encolar (usaba el global 5): ahora el tipo registrado manda.
2. Un archivo inválido recibía 409 (cola llena) en vez de 422: ahora se valida antes de contar la cola.
3. Al confirmar, el borrador quedaba como JSON `null` en vez de NULL de SQL (visto en la base real, no en la API): `JSONB(none_as_null=True)`.
4. En la corrida en vivo, un uvicorn viejo de otra sesión ocupaba el puerto y servía código anterior (405): se descubrió al mirar los procesos, no era un fallo del código.

## Pendiente y límites (honestidad)
- **Facturas reales**: todo se probó con texto sintético. La calidad de lectura con EDESUR/EDENORTE/EDEESTE sigue sin medirse (ERD-OCR-REAL-QA espera facturas anonimizadas de Manuel).
- **Worker en producción**: no desplegado; sin él la lectura no avanza (la interfaz avisa tras 60 s). Ver ERD-DEPLOY-01.
- **Móvil en dispositivo**: sin probar; `expo-document-picker` es un módulo nativo nuevo (reconstruir el development build).
- **Texto legal**: la interfaz dice que el archivo se guarda cifrado y se elimina si no se confirma; el plazo (7 días) es una propuesta sin aprobar (ERD-LEGAL-FINAL).
- Cola en PostgreSQL, no Redis (decisión en `docs/ops/JOBS.md`).
