# Documentos (ERD-DB-DOCUMENTS)

Metadatos y procedencia de los **originales de factura** (foto o PDF). El contenido lo guarda el almacenamiento privado
(ERD-STORE-01); aquí no hay bytes. Migración `0014`. Sin endpoints todavía: los trae ERD-STORE-01 / ERD-OCR-PROD.

## `documents`
| Columna | Regla |
|---|---|
| `home_id` | FK `homes` ON DELETE CASCADE |
| `uploaded_by` | FK `users` ON DELETE SET NULL (borrar la cuenta no borra lo que otros miembros ven; el vínculo se pierde) |
| `bill_id` | FK `bills` ON DELETE CASCADE, nullable; se asigna **una sola vez** y debe ser de la misma vivienda |
| `kind` | `bill_photo` \| `bill_pdf`; el `content_type` debe corresponder (imágenes jpeg/png/heic/heif/webp; pdf) |
| `size_bytes`, `sha256` | > 0 y ≤ límite (foto 10 MiB, PDF 20 MiB, configurable); hash hex en minúsculas (procedencia: ver si el archivo cambió) |
| `storage_key` | único, `homes/{home_id}/documents/{id}`; no se expone por API |
| `uploaded_via` | `web` \| `mobile` \| `api` |
| `retention_until` | obligatoria mientras no haya factura; `NULL` con factura |

**Inmutabilidad (trigger `documents_guard`)**: no cambian `id`, `home_id`, `kind`, `content_type`, `size_bytes`, `sha256`,
`storage_key`, `uploaded_via`, `created_at` ni el autor (salvo pasar a `NULL` por borrado del usuario). El trigger también
rechaza asociar una factura de otra vivienda aunque se salte el servicio.

## Retención y borrado (alineado con `docs/legal/PRIVACY_AND_RETENTION_DRAFT.md`, cifras sin aprobar)
- **Con factura:** vive mientras exista la factura; borrar la factura borra el documento.
- **Sin factura (OCR no confirmado):** caduca a los `DOCUMENT_UNCONFIRMED_RETENTION_DAYS` (7 por defecto, propuesta).
  `documents.expire_unconfirmed()` lo aplica (lo invocará el scheduler de ERD-WORKER-01).
- **Borrado por la persona:** `documents.delete_document()`.
- **Borrado de cuenta o vivienda:** la cascada de la base borra las filas.

## Cola `storage_deletions` (no dejar archivos huérfanos)
Un trigger `AFTER DELETE` en `documents` encola la `storage_key` **sea cual sea la causa** (persona, factura, vivienda,
cuenta, expiración). El worker usa `claim_storage_deletions` (FOR UPDATE SKIP LOCKED + concesión de 300 s, varios
workers no se pisan), borra el objeto y llama `complete_storage_deletions`, o `fail_storage_deletion` (la fila se reintenta;
`attempts` y `last_error` quedan visibles). `purge_completed_deletions` limpia las ya hechas tras 7 días.

## Pruebas
`tests/test_documents.py` (27): ida y vuelta de la migración, validación de metadatos, asociación única y aislada por
vivienda, inmutabilidad a nivel de base, cascadas (factura, vivienda, usuario y borrado real de cuenta), expiración,
exclusividad y reintento de la cola.

## Pendiente (otras tareas)
Subida/descarga con URLs firmadas y cifrado (ERD-STORE-01); worker que vacía la cola y expira (ERD-WORKER-01); estados de
OCR por documento en una tabla propia (ERD-OCR-PROD); texto legal de retención (ERD-LEGAL-FINAL).
