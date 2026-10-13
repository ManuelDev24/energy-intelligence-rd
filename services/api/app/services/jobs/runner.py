"""Ejecuta UN trabajo reclamado: tiempo máximo, clasificación del fallo y cierre cercado. Sin FastAPI.

El tiempo máximo usa SIGALRM (un worker = un hilo principal = un trabajo a la vez; se escala con más procesos). Si el
handler queda bloqueado en código nativo, la concesión (`locked_until`) vence igual y otro worker retoma el trabajo.
"""
import logging
import signal
import threading
from contextlib import contextmanager

from sqlalchemy.orm import Session

from app.models.job import Job
from app.services.jobs import queue
from app.services.jobs.registry import PermanentFailure, RetryLater, get_spec
from app.telemetry import capture_dead_job, scrub_text

log = logging.getLogger("energyrd.jobs")
LEASE_MARGIN_SECONDS = 30


class JobTimeout(BaseException):
    """BaseException a propósito: un `except Exception` dentro del handler no puede tragarse el tiempo agotado."""


def lease_of(kind: str) -> int:
    """Concesión = tiempo máximo del handler + margen (los tipos desconocidos se descartan al ejecutarlos)."""
    spec = get_spec(kind)
    return (spec.timeout_seconds if spec else 60) + LEASE_MARGIN_SECONDS


@contextmanager
def deadline(seconds: int):
    if threading.current_thread() is not threading.main_thread() or not hasattr(signal, "setitimer"):
        yield  # sin tiempo máximo local: queda la concesión como red de seguridad
        return

    def expired(signum, frame):
        raise JobTimeout()
    previous = signal.signal(signal.SIGALRM, expired)
    signal.setitimer(signal.ITIMER_REAL, seconds)
    try:
        yield
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, previous)


def _describe(exc: BaseException) -> str:
    return scrub_text(f"{type(exc).__name__}: {exc}"[:queue.MAX_ERROR_CHARS])


def execute(db: Session, job: Job, worker_id: str, *, now=None) -> str:
    """Devuelve `succeeded`, `retry`, `dead` o `lost` (la concesión ya no era suya: el resultado se descarta)."""
    spec = get_spec(job.kind)
    job_id, kind = job.id, job.kind
    if spec is None:
        outcome = queue.fail(db, job, worker_id, "unknown_kind: no hay handler registrado", permanent=True, now=now)
        log.error("job unknown kind", extra={"job_id": job_id, "kind": kind})
        return "dead" if outcome else "lost"
    permanent, retry_in, failure = False, None, None
    try:
        with deadline(spec.timeout_seconds):
            spec.handler(db, job)
    except JobTimeout:
        db.rollback()
        failure = TimeoutError(f"timeout: superó {spec.timeout_seconds}s")
    except PermanentFailure as exc:
        db.rollback()
        permanent, failure = True, exc
    except RetryLater as exc:
        db.rollback()
        retry_in, failure = exc.seconds, exc
    except Exception as exc:  # noqa: BLE001 — cualquier error del handler es reintentable hasta agotar intentos
        db.rollback()
        failure = exc
    if failure is None:
        return "succeeded" if queue.complete(db, job, worker_id, now=now) else "lost"
    outcome = queue.fail(db, job, worker_id, _describe(failure), permanent=permanent, retry_in=retry_in, now=now)
    if outcome is None:
        return "lost"
    if outcome == "dead":
        log.error("job dead", extra={"job_id": job_id, "kind": kind})
        capture_dead_job(kind, job_id, failure)
        return "dead"
    log.warning("job will retry", extra={"job_id": job_id, "kind": kind})
    return "retry"
