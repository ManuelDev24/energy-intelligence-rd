# Almacenamiento privado de originales (ERD-STORE-01)

Guarda la foto o el PDF de una factura **cifrados**, en un bucket **privado**, y los entrega solo con un enlace firmado de
vida corta. Los metadatos, la retención y la cola de borrado están en `DOCUMENTS.md` (ERD-DB-DOCUMENTS).

## Qué hay y qué falta
| | Estado |
|---|---|
| Cifrado AES-256-GCM, claves versionadas y rotación | Hecho y probado |
| Almacén local (desarrollo/pruebas) y S3/R2 (probado contra S3 simulado con `moto`) | Hecho |
| Subida, metadatos, enlace firmado, descarga, borrado | Hecho (API) |
| Vaciado de la cola de borrado, expiración, rotación de claves | Hecho: `python -m scripts.storage_maintenance` |
| Conciliación base ↔ bucket (tras restaurar la base) | Hecho: `python -m scripts.storage_reconcile` (ver `docs/ops/DISASTER_RECOVERY.md`) |
| **Bucket real (S3/R2), credenciales, política del bucket, TLS** | **Pendiente: requiere la cuenta del dueño (ERD-DEPLOY-01)**. Nunca se probó contra un proveedor real |
| Que el worker ejecute el mantenimiento de forma periódica | ERD-WORKER-01 |
| Pantallas web/móvil para subir y ver originales, y conectar el OCR | ERD-OCR-PROD (el BFF aún no expone estas rutas) |

## Rutas (`/api/v1`)
| Ruta | Notas |
|---|---|
| `POST /homes/{id}/documents` | multipart `file` (+ `source`: `web`/`mobile`/`api`). El tipo se decide por los **bytes** (JPEG, PNG, WEBP, HEIC/HEIF, PDF); el `Content-Type` y el nombre que mande el cliente se ignoran. Imágenes JPEG/PNG/WEBP deben decodificar y no pasar de 60 Mpx. Tope 10 MB foto / 20 MB PDF, y 20 sin confirmar por vivienda (409 `document_quota_exceeded`) |
| `GET /homes/{id}/documents[?bill_id=]`, `GET …/{doc}` | metadatos; **nunca** la clave interna del objeto |
| `POST …/{doc}/download-url` | `{url, expires_at}`; el enlace vive 60 s (`STORAGE_URL_TTL_SECONDS`, 10–300) |
| `GET /documents/download?token=…` | sin `Authorization`; **fuera del OpenAPI a propósito** |
| `DELETE …/{doc}` | borra la fila; el objeto lo borra la cola |

Sin almacenamiento configurado (`STORAGE_BACKEND=disabled`, el valor por omisión) todas responden **503 `storage_unavailable`**: no se guarda nada «en silencio».

## Cifrado
- `b"ERD1" | id de clave | sal(16) | nonce(12) | ciphertext+tag`. Clave por objeto = HKDF-SHA256(clave maestra, sal, `storage_key`), y la `storage_key` va como dato autenticado: un objeto copiado a otra clave **no descifra**, y cualquier alteración se detecta.
- El proveedor solo ve texto cifrado: el cifrado ocurre antes de subir, no depende de SSE del bucket (R2 no lo ofrece igual).
- Tras descifrar se compara el SHA-256 con el guardado en `documents` (procedencia): un objeto cambiado por otro cifrado válido tampoco se sirve.
- **Claves**: `STORAGE_ENCRYPTION_KEYS="k2:<base64url 32 bytes>,k1:<…>"`. La primera cifra; todas descifran. Generar: `python -c "import secrets,base64;print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())"`.
- **Rotación**: 1) anteponer la clave nueva, 2) desplegar, 3) `python -m scripts.storage_maintenance --reencrypt` (repetir hasta `already_current` = total), 4) solo entonces quitar la clave vieja. Si se pierde una clave, los objetos cifrados con ella **no se pueden recuperar**: guardarla en el gestor de secretos y en la copia de seguridad de secretos, **separada de la de la base de datos**.

## Enlaces firmados
HMAC-SHA256 con `STORAGE_URL_SIGNING_KEY` (propia, no la de las sesiones). El token liga documento, vivienda, persona y vencimiento; al canjearlo se revalida que el documento exista y que la persona **siga siendo miembro**. Cualquier defecto (formato, firma, vencimiento, miembro que salió) da el mismo 404. La respuesta lleva `Content-Disposition: attachment` con un nombre genérico, `nosniff`, `Cache-Control: private, no-store`, `Referrer-Policy: no-referrer` y CSP `default-src 'none'; sandbox`.

Límite conocido: es un token portador de 60 s en la URL; quien lo vea en un registro de acceso durante ese minuto puede descargar. Por eso es corto, no se registra el query string en la aplicación y el cliente debe pedirlo justo antes de usarlo.

## Orden de la subida y no dejar huérfanos
Primero la fila, después el objeto. Si el objeto falla, se borra la fila (503 sin detalles internos). Cualquier borrado de fila —persona, factura, vivienda, cuenta o expiración— encola la clave por trigger; `storage_maintenance` borra el objeto (idempotente) y reintenta si el proveedor falla; el error guardado es solo el nombre de la excepción.

## Configuración
| Variable | |
|---|---|
| `STORAGE_BACKEND` | `disabled` (defecto) \| `local` (solo desarrollo/pruebas; **prohibido en producción/staging**) \| `s3` |
| `STORAGE_LOCAL_DIR` | directorio del almacén local |
| `STORAGE_S3_BUCKET`, `STORAGE_S3_PREFIX`, `STORAGE_S3_ENDPOINT_URL` (R2), `STORAGE_S3_REGION`, `STORAGE_S3_ACCESS_KEY_ID`, `STORAGE_S3_SECRET_ACCESS_KEY` | credenciales con permiso **solo** sobre este bucket (put/get/delete), nunca de la cuenta raíz |
| `STORAGE_ENCRYPTION_KEYS`, `STORAGE_URL_SIGNING_KEY` | obligatorias si el backend no es `disabled`; la configuración rechaza claves débiles |
| `DOCUMENT_MAX_UNCONFIRMED_PER_HOME` | 20 |

Checklist del bucket real (a verificar por la persona dueña de la cuenta, **sin verificar**): acceso público bloqueado, sin ACL públicas, sin CORS abierto, versionado desactivado o con expiración de versiones antiguas (si no, un «borrado» deja copias), cifrado del proveedor activado como segunda capa, registro de acceso activado, ciclo de vida que elimina objetos no referenciados como red de seguridad.

## Pruebas
`tests/test_document_storage.py` (44): cifrado (alteración, objeto movido, clave equivocada, rotación), almacén local (claves peligrosas, escritura atómica), S3 simulado (solo texto cifrado, errores sin detalles), enlaces (vencimiento, manipulación, otra clave, miembro que sale), detección por bytes (HTML/EXE disfrazados), límites (tamaño, píxeles, cuota), aislamiento entre viviendas y usuarios, objeto alterado o reemplazado, cola (fallos aislados, reintento, sin huérfanos al borrar la vivienda), mantenimiento y configuración. `tests/test_authorization.py` incluye las 5 rutas nuevas.
