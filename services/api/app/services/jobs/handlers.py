"""Handlers integrados. Los módulos que necesiten trabajos propios (OCR, anomalías, correos…) registran los suyos con
`@register(kind)` e importan su módulo desde `load_handlers`."""
import uuid

from sqlalchemy.orm import Session

from app.config import settings
from app.services import document_storage
from app.services.errors import StorageUnavailable
from app.services.jobs import queue
from app.services.ocr import jobs as ocr_jobs
from app.services.jobs.registry import PermanentFailure, register
from app.services.jobs.schedule import Schedule


@register("storage.maintenance", timeout_seconds=300, max_attempts=3)
def storage_maintenance(db: Session, job) -> None:
    try:
        document_storage.run_maintenance(db, reencrypt=bool(job.payload.get("reencrypt")))
    except StorageUnavailable as exc:
        raise PermanentFailure("almacenamiento no configurado") from exc


@register(ocr_jobs.KIND, timeout_seconds=300, max_attempts=3)
def ocr_process(db: Session, job) -> None:
    try:
        document_id = uuid.UUID(job.payload["document_id"])
    except (KeyError, ValueError, TypeError) as exc:
        raise PermanentFailure("payload sin document_id") from exc
    ocr_jobs.process(db, document_id, attempt=job.attempts, max_attempts=job.max_attempts)


@register("jobs.purge", timeout_seconds=120, max_attempts=3)
def jobs_purge(db: Session, job) -> None:
    queue.purge(db)


def schedules() -> list[Schedule]:
    """Tareas periódicas vigentes según la configuración (sin almacenamiento no hay nada que mantener)."""
    items = [Schedule("jobs.purge", 24 * 3600)]
    if settings.STORAGE_BACKEND != "disabled":
        items.append(Schedule("storage.maintenance", 600))
    return items
