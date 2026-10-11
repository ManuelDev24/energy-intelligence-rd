"""Handlers integrados. Los módulos que necesiten trabajos propios (OCR, anomalías, correos…) registran los suyos con
`@register(kind)` e importan su módulo desde `load_handlers`."""
import uuid

from sqlalchemy.orm import Session

from app.config import settings
from datetime import datetime, timezone

from app.services import alerts, anomaly_scan, document_storage, notifications
from app.services.transactions import write_transaction
from app.services.errors import NotFound
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


@register("anomalies.scan_home", timeout_seconds=120, max_attempts=3)
def anomalies_scan_home(db: Session, job) -> None:
    try:
        home_id = uuid.UUID(job.payload["home_id"])
    except (KeyError, ValueError, TypeError) as exc:
        raise PermanentFailure("payload sin home_id") from exc
    try:
        anomaly_scan.scan_home(db, home_id)
    except NotFound:
        return  # la vivienda se borró mientras esperaba: nada que escanear


@register("anomalies.scan_all", timeout_seconds=600, max_attempts=3)
def anomalies_scan_all(db: Session, job) -> None:
    """Escaneo diario: un trabajo por vivienda con datos recientes (la clave por día evita duplicar si corre dos veces)."""
    now = datetime.now(timezone.utc)
    day = anomaly_scan._today(now).isoformat()
    with write_transaction(db):
        for home_id in anomaly_scan.homes_with_recent_data(db, anomaly_scan._today(now)):
            queue.enqueue(db, "anomalies.scan_home", {"home_id": str(home_id)}, idempotency_key=f"{home_id}:{day}", now=now, commit=False)


@register(notifications.KIND, timeout_seconds=60, max_attempts=5)
def notifications_deliver(db: Session, job) -> None:
    try:
        notification_id = uuid.UUID(job.payload["notification_id"])
    except (KeyError, ValueError, TypeError) as exc:
        raise PermanentFailure("payload sin notification_id") from exc
    notifications.deliver(db, notification_id, attempt=job.attempts, max_attempts=job.max_attempts)


@register("alerts.evaluate_home", timeout_seconds=60, max_attempts=3)
def alerts_evaluate_home(db: Session, job) -> None:
    try:
        home_id = uuid.UUID(job.payload["home_id"])
    except (KeyError, ValueError, TypeError) as exc:
        raise PermanentFailure("payload sin home_id") from exc
    with write_transaction(db):
        try:
            alerts.refresh_alerts(db, home_id)
        except NotFound:
            return


@register("alerts.evaluate_all", timeout_seconds=600, max_attempts=3)
def alerts_evaluate_all(db: Session, job) -> None:
    """Diario: las alertas por fecha (vence mañana, falta la factura…) cambian aunque nadie escriba nada."""
    now = datetime.now(timezone.utc)
    day = anomaly_scan._today(now).isoformat()
    with write_transaction(db):
        for home_id in anomaly_scan.homes_with_recent_data(db, anomaly_scan._today(now)):
            queue.enqueue(db, "alerts.evaluate_home", {"home_id": str(home_id)}, idempotency_key=f"{home_id}:{day}", now=now, commit=False)


@register("jobs.purge", timeout_seconds=120, max_attempts=3)
def jobs_purge(db: Session, job) -> None:
    queue.purge(db)


def schedules() -> list[Schedule]:
    """Tareas periódicas vigentes según la configuración (sin almacenamiento no hay nada que mantener)."""
    items = [Schedule("jobs.purge", 24 * 3600), Schedule("anomalies.scan_all", 24 * 3600), Schedule("alerts.evaluate_all", 24 * 3600)]
    if settings.STORAGE_BACKEND != "disabled":
        items.append(Schedule("storage.maintenance", 600))
    return items
