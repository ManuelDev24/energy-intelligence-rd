"""ERD-DB-DOCUMENTS: metadatos y procedencia de los originales de factura. Sin FastAPI ni almacenamiento.

El contenido lo guarda ERD-STORE-01; aquí se registra, se asocia (una sola vez) a una factura de la misma vivienda,
se borra y se expira. Los borrados encolan la clave del objeto en `storage_deletions` (trigger de la migración 0014);
las funciones `claim/complete/fail` son el contrato con el worker que borra los objetos.
"""
import re
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Bill
from app.models.document import DOCUMENT_KINDS, UPLOADED_VIA, Document, StorageDeletion
from app.services.errors import InvalidInput, NotFound
from app.services.transactions import write_transaction

_SHA256 = re.compile(r"^[0-9a-f]{64}$")
_CONTENT_TYPES = {
    "bill_photo": {"image/jpeg", "image/png", "image/heic", "image/heif", "image/webp"},
    "bill_pdf": {"application/pdf"},
}


def _now(now):
    return now or datetime.now(timezone.utc)


def storage_key_for(home_id, document_id) -> str:
    return f"homes/{home_id}/documents/{document_id}"


def _max_bytes(kind: str) -> int:
    return settings.DOCUMENT_MAX_PDF_BYTES if kind == "bill_pdf" else settings.DOCUMENT_MAX_PHOTO_BYTES


def register_document(db: Session, home_id, uploaded_by, *, kind, content_type, size_bytes, sha256, uploaded_via,
                      document_id=None, now=None) -> Document:
    """Registra el original ya validado por el llamador (tipo real, tamaño, hash del contenido recibido)."""
    if kind not in DOCUMENT_KINDS:
        raise InvalidInput("Tipo de documento no válido")
    if content_type not in _CONTENT_TYPES[kind]:
        raise InvalidInput("El tipo de archivo no corresponde al tipo de documento")
    if not isinstance(size_bytes, int) or isinstance(size_bytes, bool) or not 0 < size_bytes <= _max_bytes(kind):
        raise InvalidInput("Tamaño de archivo no válido")
    if not isinstance(sha256, str) or not _SHA256.match(sha256):
        raise InvalidInput("Huella del archivo no válida")
    if uploaded_via not in UPLOADED_VIA:
        raise InvalidInput("Origen de la carga no válido")
    document_id = document_id or uuid.uuid4()
    document = Document(id=document_id, home_id=home_id, uploaded_by=uploaded_by, kind=kind, content_type=content_type,
                        size_bytes=size_bytes, sha256=sha256, uploaded_via=uploaded_via,
                        storage_key=storage_key_for(home_id, document_id),
                        retention_until=_now(now) + timedelta(days=settings.DOCUMENT_UNCONFIRMED_RETENTION_DAYS))
    with write_transaction(db):
        db.add(document)
    return document


def get_document(db: Session, home_id, document_id) -> Document:
    document = db.scalar(select(Document).where(Document.id == document_id, Document.home_id == home_id)
                         .execution_options(populate_existing=True))
    if document is None:
        raise NotFound("Documento no encontrado")
    return document


def list_documents(db: Session, home_id, bill_id=None) -> list[Document]:
    query = select(Document).where(Document.home_id == home_id)
    if bill_id is not None:
        query = query.where(Document.bill_id == bill_id)
    return list(db.scalars(query.order_by(Document.created_at, Document.id).execution_options(populate_existing=True)))


def attach_to_bill(db: Session, home_id, document_id, bill_id) -> Document:
    """Asocia el original a la factura confirmada. Idempotente; nunca se mueve a otra factura ni de vivienda."""
    with write_transaction(db):
        document = db.scalar(select(Document).where(Document.id == document_id, Document.home_id == home_id)
                             .with_for_update().execution_options(populate_existing=True))
        bill = db.scalar(select(Bill.id).where(Bill.id == bill_id, Bill.home_id == home_id))
        if document is None or bill is None:
            raise NotFound("Documento o factura no encontrados")
        if document.bill_id == bill_id:
            return document
        if document.bill_id is not None:
            raise InvalidInput("El documento ya está asociado a otra factura")
        document.bill_id = bill_id
        document.retention_until = None
    return document


def delete_document(db: Session, home_id, document_id) -> None:
    with write_transaction(db):
        deleted = db.execute(delete(Document).where(Document.id == document_id, Document.home_id == home_id)).rowcount
        if not deleted:
            raise NotFound("Documento no encontrado")


def expire_unconfirmed(db: Session, now=None) -> int:
    """Borra los originales sin factura cuya retención venció. Devuelve cuántos."""
    with write_transaction(db):
        return db.execute(delete(Document).where(Document.bill_id.is_(None), Document.retention_until <= _now(now))).rowcount


def claim_storage_deletions(db: Session, *, limit: int, now=None, lease_seconds: int = 300) -> list[StorageDeletion]:
    """Reserva hasta `limit` objetos por borrar (FOR UPDATE SKIP LOCKED + concesión); varios workers no se pisan."""
    current = _now(now)
    with write_transaction(db):
        rows = list(db.scalars(select(StorageDeletion).where(
            StorageDeletion.done_at.is_(None),
            (StorageDeletion.locked_until.is_(None)) | (StorageDeletion.locked_until <= current))
            .order_by(StorageDeletion.id).limit(limit).with_for_update(skip_locked=True)
            .execution_options(populate_existing=True)))
        for row in rows:
            row.locked_until = current + timedelta(seconds=lease_seconds)
            row.attempts += 1
    return rows


def complete_storage_deletions(db: Session, ids, now=None) -> None:
    with write_transaction(db):
        db.execute(update(StorageDeletion).where(StorageDeletion.id.in_(list(ids)))
                   .values(done_at=_now(now), locked_until=None, last_error=None))


def fail_storage_deletion(db: Session, deletion_id, error: str, now=None) -> None:
    """Libera la concesión para reintentar; el error se recorta y no debe contener secretos."""
    with write_transaction(db):
        db.execute(update(StorageDeletion).where(StorageDeletion.id == deletion_id).values(
            last_error=error[:500], locked_until=_now(now)))


def purge_completed_deletions(db: Session, *, now=None, keep_days: int = 7) -> int:
    with write_transaction(db):
        return db.execute(delete(StorageDeletion).where(
            StorageDeletion.done_at.is_not(None), StorageDeletion.done_at <= _now(now) - timedelta(days=keep_days))).rowcount
