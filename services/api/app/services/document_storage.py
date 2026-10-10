"""ERD-STORE-01: subir, leer y borrar originales de factura sobre el almacenamiento privado. Sin FastAPI.

Orden de la subida: primero la FILA (si el proceso muere después, solo queda una fila sin objeto que caduca en 7 días),
luego el objeto; si el objeto falla, se borra la fila (el trigger encola la clave, y borrar lo inexistente es inocuo).
Así nunca queda un objeto sin fila que lo gobierne.
"""
import hashlib
import io
import logging
import uuid
from datetime import datetime, timezone

from PIL import Image, UnidentifiedImageError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import HomeMember
from app.models.document import Document
from app.services import documents
from app.services.errors import InvalidInput, NotFound, QuotaExceeded, StorageUnavailable
from app.services.storage import DecryptionError, ObjectMissing, StorageFailure, get_store
from app.services.storage.signing import DownloadClaim, sign_download, verify_download
from app.services.transactions import require_home

log = logging.getLogger("energy_api.storage")
MAX_PIXELS = 60_000_000  # protege al servidor de imágenes diminutas en bytes pero gigantes al decodificar
_HEIF_BRANDS = {b"heic", b"heix", b"hevc", b"hevx", b"heim", b"heis", b"mif1", b"msf1"}
EXTENSIONS = {"image/jpeg": "jpg", "image/png": "png", "image/heic": "heic", "image/heif": "heif", "image/webp": "webp",
              "application/pdf": "pdf"}


def sniff(content: bytes) -> tuple[str, str]:
    """(kind, content_type) según los bytes reales. Lo que declare el cliente no cuenta."""
    if content.startswith(b"%PDF-"):
        return "bill_pdf", "application/pdf"
    if content.startswith(b"\xff\xd8\xff"):
        return "bill_photo", "image/jpeg"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "bill_photo", "image/png"
    if content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "bill_photo", "image/webp"
    if content[4:8] == b"ftyp" and content[8:12] in _HEIF_BRANDS:
        return "bill_photo", "image/heic" if content[8:12] in {b"heic", b"heix", b"hevc", b"hevx"} else "image/heif"
    raise InvalidInput("Formato no admitido: use una foto (JPG, PNG, WEBP o HEIC) o un PDF")


def _check_decodable(content_type: str, content: bytes) -> None:
    """JPEG/PNG/WEBP deben decodificar de verdad y no exceder el tope de píxeles. HEIC/PDF se aceptan por firma."""
    if content_type not in {"image/jpeg", "image/png", "image/webp"}:
        return
    try:
        with Image.open(io.BytesIO(content)) as image:
            width, height = image.size
            if width * height > MAX_PIXELS:
                raise InvalidInput("La imagen es demasiado grande")
            image.verify()
    except InvalidInput:
        raise
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError, Image.DecompressionBombError):
        raise InvalidInput("El archivo está dañado o no es una imagen válida") from None


def upload_document(db: Session, home_id, user_id, content: bytes, *, uploaded_via: str = "api", now=None) -> Document:
    store = get_store()
    require_home(db, home_id)
    if not content:
        raise InvalidInput("El archivo está vacío")
    kind, content_type = sniff(content)
    limit = settings.DOCUMENT_MAX_PDF_BYTES if kind == "bill_pdf" else settings.DOCUMENT_MAX_PHOTO_BYTES
    if len(content) > limit:
        raise InvalidInput(f"El archivo supera el máximo de {limit // (1024 * 1024)} MB")
    _check_decodable(content_type, content)
    pending = db.scalar(select(func.count()).select_from(Document).where(Document.home_id == home_id, Document.bill_id.is_(None)))
    if pending >= settings.DOCUMENT_MAX_UNCONFIRMED_PER_HOME:
        raise QuotaExceeded("Hay demasiados documentos sin confirmar en esta vivienda; confirme o elimine alguno")
    document = documents.register_document(
        db, home_id, user_id, kind=kind, content_type=content_type, size_bytes=len(content),
        sha256=hashlib.sha256(content).hexdigest(), uploaded_via=uploaded_via, now=now)
    try:
        store.put(document.storage_key, content)
    except StorageFailure as exc:
        log.error("document upload failed", extra={"document_id": str(document.id)}, exc_info=exc.__cause__)
        documents.delete_document(db, home_id, document.id)
        raise StorageUnavailable("No se pudo guardar el documento; intente de nuevo") from None
    return document


def issue_download_url(db: Session, home_id, user_id, document_id, *, now=None) -> tuple[str, datetime]:
    get_store()  # 503 temprano si el almacenamiento está deshabilitado
    document = documents.get_document(db, home_id, document_id)
    token, expires = sign_download(document.id, home_id, user_id, now=now)
    return f"/api/v1/documents/download?token={token}", expires


def redeem_download(db: Session, token: str, *, now=None) -> tuple[Document, bytes]:
    """Canjea el enlace firmado. Revalida que el documento exista y que la persona siga en la vivienda."""
    claim: DownloadClaim = verify_download(token, now=now)
    store = get_store()
    document = documents.get_document(db, claim.home_id, claim.document_id)
    if claim.user_id is not None and db.scalar(select(HomeMember.user_id).where(
            HomeMember.home_id == claim.home_id, HomeMember.user_id == claim.user_id)) is None:
        raise NotFound("Enlace de descarga no válido o vencido")
    try:
        content = store.get(document.storage_key)
    except ObjectMissing:
        raise NotFound("El archivo ya no está disponible") from None
    except StorageFailure as exc:
        log.error("document read failed", extra={"document_id": str(document.id)}, exc_info=exc.__cause__)
        raise StorageUnavailable("No se pudo leer el documento; intente de nuevo") from None
    except DecryptionError:
        log.error("document failed integrity check", extra={"document_id": str(document.id)})
        raise StorageUnavailable("No se pudo leer el documento; intente de nuevo") from None
    if hashlib.sha256(content).hexdigest() != document.sha256:
        log.error("document hash mismatch", extra={"document_id": str(document.id)})
        raise StorageUnavailable("No se pudo leer el documento; intente de nuevo")
    return document, content


def drain_storage_deletions(db: Session, *, limit: int = 100, now=None) -> dict:
    """Vacía la cola `storage_deletions`: borra cada objeto y marca la fila. Un fallo no detiene al resto."""
    store = get_store()
    done, failed = [], 0
    for row in documents.claim_storage_deletions(db, limit=limit, now=now):
        try:
            store.delete(row.storage_key)
            done.append(row.id)
        except StorageFailure as exc:
            failed += 1
            documents.fail_storage_deletion(db, row.id, type(exc.__cause__ or exc).__name__, now=now)
    if done:
        documents.complete_storage_deletions(db, done, now=now)
    return {"deleted": len(done), "failed": failed}


def reencrypt_all(db: Session, *, limit: int = 500) -> dict:
    """Rotación de claves: reescribe con la clave activa los objetos cifrados con una anterior."""
    store = get_store()
    rotated = skipped = failed = 0
    for key in db.scalars(select(Document.storage_key).order_by(Document.created_at).limit(limit)):
        try:
            rotated, skipped = (rotated + 1, skipped) if store.reencrypt(key) else (rotated, skipped + 1)
        except (ObjectMissing, StorageFailure, DecryptionError):
            failed += 1
    return {"reencrypted": rotated, "already_current": skipped, "failed": failed}


def run_maintenance(db: Session, *, reencrypt: bool = False, batch: int = 200) -> dict:
    """Mantenimiento completo: expira originales sin factura, vacía la cola de borrado y limpia la ya hecha."""
    report = {"expired": documents.expire_unconfirmed(db)}
    drained = {"deleted": 0, "failed": 0}
    while True:  # un lote por vuelta hasta vaciar la cola o hasta que un lote ya no avance
        step = drain_storage_deletions(db, limit=batch)
        drained = {key: drained[key] + step[key] for key in drained}
        if step["deleted"] + step["failed"] < batch or step["deleted"] == 0:
            break
    report.update(drained)
    report["purged"] = documents.purge_completed_deletions(db)
    if reencrypt:
        report["reencrypt"] = reencrypt_all(db)
    return report
