"""ERD-OCR-PROD: OCR asíncrono de originales. Sin FastAPI.

Flujo: `submit` guarda el original (cifrado), crea el estado y encola `ocr.process`; el worker lee, corre el OCR y deja el
BORRADOR en `document_ocr`; la persona lo revisa y confirma con `POST /bills` (con `document_id`), que asocia el original a
la factura y borra el borrador. Nunca OCR → base de datos de facturas sin confirmación humana.
"""
import logging
import time
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models.document import Document, DocumentOcr
from app.models.job import Job
from app.schemas.ocr import OcrDraft
from app.services import document_storage, documents, jobs
from app.services.errors import NotFound, QuotaExceeded
from app.services.ocr import pipeline
from app.services.ocr.parser import parse_bill_text
from app.services.storage import DecryptionError, ObjectMissing, StorageFailure, get_store
from app.services.transactions import require_home, write_transaction

log = logging.getLogger("energyrd.ocr")
KIND = "ocr.process"
ERROR_MESSAGES = {
    "unreadable": "No se pudo leer el archivo. Pruebe con una foto más nítida o con el PDF original de la distribuidora.",
    "protected_pdf": "El PDF está protegido con contraseña. Descárguelo de nuevo sin protección.",
    "file_missing": "El archivo original ya no está disponible. Súbalo de nuevo.",
    "engine_error": "No se pudo leer la factura en este momento. Intente de nuevo en unos minutos.",
}


def _now(now):
    return now or datetime.now(timezone.utc)


def submit(db: Session, home_id, user_id, content: bytes, *, uploaded_via: str = "api", now=None) -> DocumentOcr:
    """Guarda el original, crea el estado `pending` y encola el trabajo. Devuelve el estado."""
    require_home(db, home_id)
    validated = document_storage.validate_upload(content)  # un archivo inválido es 422 aunque haya cola llena
    current = _now(now)
    active = db.scalar(select(func.count()).select_from(DocumentOcr).join(Document, Document.id == DocumentOcr.document_id).where(
        Document.home_id == home_id, DocumentOcr.status.in_(("pending", "processing")),
        DocumentOcr.created_at > current - timedelta(minutes=30)))
    if active >= settings.OCR_MAX_ACTIVE_PER_HOME:
        raise QuotaExceeded("Ya hay varias facturas en proceso; espere a que terminen")
    document = document_storage.upload_document(db, home_id, user_id, content, uploaded_via=uploaded_via, now=now,
                                              validated=validated)
    try:
        with write_transaction(db):
            state = DocumentOcr(document_id=document.id, status="pending", created_at=current)
            db.add(state)
            jobs.enqueue(db, KIND, {"document_id": str(document.id)}, idempotency_key=str(document.id), now=current, commit=False)
    except Exception:
        documents.delete_document(db, home_id, document.id)  # sin estado no hay nada que seguir: no dejar el original suelto
        raise
    return state


def _job_for(db: Session, document_id) -> Job | None:
    return db.scalar(select(Job).where(Job.kind == KIND, Job.idempotency_key == str(document_id)).execution_options(populate_existing=True))


def get_state(db: Session, home_id, document_id) -> tuple[DocumentOcr, str, str | None]:
    """(fila, estado efectivo, código de error). Si el trabajo murió sin cerrar el estado, se informa `failed`."""
    documents.get_document(db, home_id, document_id)
    state = db.scalar(select(DocumentOcr).where(DocumentOcr.document_id == document_id).execution_options(populate_existing=True))
    if state is None:
        raise NotFound("Este documento no tiene lectura de factura")
    if state.status in ("pending", "processing"):
        job = _job_for(db, document_id)
        if job is not None and job.status == "dead":
            return state, "failed", "engine_error"
    return state, state.status, state.error_code


def retry(db: Session, home_id, document_id, *, now=None) -> DocumentOcr:
    """Reintento manual tras un fallo: vuelve a `pending` con un trabajo nuevo (un trabajo en curso no se duplica)."""
    state, effective, _ = get_state(db, home_id, document_id)
    if effective != "failed":
        return state
    with write_transaction(db):
        state.status, state.error_code, state.attempts = "pending", None, 0
        state.finished_at, state.started_at, state.created_at = None, None, _now(now)
        job = _job_for(db, document_id)
        if job is not None:
            db.delete(job)  # el trabajo viejo (muerto o terminado) libera su clave de idempotencia
            db.flush()
        jobs.enqueue(db, KIND, {"document_id": str(document_id)}, idempotency_key=str(document_id), now=now, commit=False)
    return state


def _fail(db: Session, document_id, code: str, *, now=None) -> None:
    with write_transaction(db):
        state = db.get(DocumentOcr, document_id, with_for_update=True, populate_existing=True)
        if state is not None:
            state.status, state.error_code, state.finished_at, state.draft = "failed", code, _now(now), None


def process(db: Session, document_id, *, attempt: int, max_attempts: int, engine=None, now=None) -> str:
    """Cuerpo del trabajo `ocr.process` (idempotente). Devuelve `done`, `failed` o `skipped`; lanza para reintentar."""
    with write_transaction(db):
        state = db.get(DocumentOcr, document_id, with_for_update=True, populate_existing=True)
        if state is None or state.status in ("done", "failed"):
            return "skipped"  # borrado mientras esperaba, o ya resuelto por un intento anterior
        state.status, state.attempts, state.started_at = "processing", attempt, _now(now)
    document = db.get(Document, document_id, populate_existing=True)
    if document is None:
        return "skipped"
    started = time.monotonic()
    try:
        content = get_store().get(document.storage_key)
    except ObjectMissing:
        _fail(db, document_id, "file_missing", now=now)
        return "failed"
    except DecryptionError:
        _fail(db, document_id, "engine_error", now=now)  # un objeto alterado o con clave perdida no se arregla reintentando
        return "failed"
    except StorageFailure:
        if attempt >= max_attempts:
            _fail(db, document_id, "engine_error", now=now)
        raise
    try:
        extracted = pipeline.extract_document(content, document.content_type, engine)
    except pipeline.UnreadableDocument as exc:
        _fail(db, document_id, exc.code, now=now)
        return "failed"
    except pipeline.EngineError:
        if attempt >= max_attempts:
            _fail(db, document_id, "engine_error", now=now)
        raise
    draft = parse_bill_text(extracted.text)
    if extracted.pages_read < extracted.pages_total:
        draft.warnings.append(f"Solo se leyeron las primeras {extracted.pages_read} de {extracted.pages_total} páginas del PDF.")
    with write_transaction(db):
        state = db.get(DocumentOcr, document_id, with_for_update=True, populate_existing=True)
        if state is None:
            return "skipped"
        state.status, state.error_code, state.finished_at = "done", None, _now(now)
        state.engine, state.method = extracted.engine, extracted.method
        state.pages_read, state.pages_total = extracted.pages_read, extracted.pages_total
        state.draft = draft.model_dump()
    log.info("ocr done", extra={"document_id": str(document_id), "method": extracted.method, "pages": extracted.pages_read,
                                "duration_ms": round((time.monotonic() - started) * 1000)})
    return "done"


def confirm_document(db: Session, home_id, document_id, bill_id) -> None:
    """Dentro de la transacción de la factura: asocia el original y descarta el borrador (ya no hace falta)."""
    document = db.scalar(select(Document).where(Document.id == document_id, Document.home_id == home_id).with_for_update()
                         .execution_options(populate_existing=True))
    if document is None:
        raise NotFound("Documento no encontrado")
    if document.bill_id is not None:
        raise NotFound("Documento no encontrado")  # ya pertenece a otra factura: no se revela
    document.bill_id, document.retention_until = bill_id, None
    state = db.get(DocumentOcr, document_id, populate_existing=True)
    if state is not None:
        state.draft = None


def to_out(state: DocumentOcr, effective: str, error_code: str | None) -> dict:
    """Vista pública del estado (sin clave de almacenamiento ni texto completo)."""
    return {
        "document_id": state.document_id, "status": effective, "attempts": state.attempts, "method": state.method,
        "pages_read": state.pages_read, "pages_total": state.pages_total,
        "draft": OcrDraft(**state.draft) if state.draft and effective == "done" else None,
        "error_code": error_code, "error_message": ERROR_MESSAGES.get(error_code) if error_code else None,
        "created_at": state.created_at, "finished_at": state.finished_at,
    }
