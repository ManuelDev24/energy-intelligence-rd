"""Cola de trabajos sobre PostgreSQL. Sin FastAPI.

Garantías:
- Encolar es transaccional con quien lo pida (se puede encolar y escribir datos en un solo commit con `commit=False`).
- `claim` usa FOR UPDATE SKIP LOCKED: varios workers no toman el mismo trabajo.
- La concesión (`locked_until`) vence si el proceso muere o se cuelga; otro worker lo recoge y cuenta como intento.
- `complete`/`fail` están «cercados»: solo vale el worker y el intento que lo tomó. Si la concesión venció y otro lo
  retomó, el resultado tardío se descarta (por eso los handlers deben ser idempotentes).
- Idempotencia: `(kind, idempotency_key)` es único; encolar dos veces lo mismo devuelve el trabajo existente.
"""
import json
import random
from datetime import datetime, timedelta, timezone
from typing import Callable

from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.config import settings
from app.models.job import Job
from app.services.errors import InvalidInput
from app.services.jobs.registry import _KIND, get_spec
from app.services.transactions import write_transaction

MAX_PAYLOAD_BYTES = 8192
MAX_ERROR_CHARS = 500


def _now(now):
    return now or datetime.now(timezone.utc)


def backoff_seconds(attempts: int, *, rng: Callable[[], float] = random.random) -> float:
    """Espera antes del reintento `attempts`+1: base·2^(n-1) con tope y ±20 % de azar (evita reintentos en bloque)."""
    raw = min(settings.JOB_BACKOFF_BASE_SECONDS * 2 ** max(0, attempts - 1), settings.JOB_BACKOFF_CAP_SECONDS)
    return raw * (0.8 + 0.4 * rng())


def enqueue(db: Session, kind: str, payload: dict | None = None, *, idempotency_key: str | None = None, run_at=None,
            max_attempts: int | None = None, now=None, commit: bool = True) -> tuple[Job, bool]:
    """(trabajo, creado). Con una clave repetida devuelve el existente y `creado=False`."""
    if not isinstance(kind, str) or not _KIND.match(kind):
        raise InvalidInput("Tipo de trabajo no válido")
    payload = {} if payload is None else payload
    try:
        size = len(json.dumps(payload, separators=(",", ":")).encode())
    except (TypeError, ValueError):
        raise InvalidInput("Los datos del trabajo no son serializables") from None
    if not isinstance(payload, dict) or size > MAX_PAYLOAD_BYTES:
        raise InvalidInput("Los datos del trabajo no son válidos")
    if idempotency_key is not None and not 0 < len(idempotency_key) <= 128:
        raise InvalidInput("Clave de idempotencia no válida")
    if max_attempts is None:  # el tipo registrado manda; si no está registrado (otro proceso), el valor global
        spec = get_spec(kind)
        max_attempts = spec.max_attempts if spec and spec.max_attempts else settings.JOB_DEFAULT_MAX_ATTEMPTS
    attempts = max_attempts
    if not 1 <= attempts <= 20:
        raise InvalidInput("Máximo de intentos no válido")
    current = _now(now)
    values = dict(kind=kind, payload=payload, idempotency_key=idempotency_key, max_attempts=attempts,
                  run_at=run_at or current, created_at=current)

    def insert() -> tuple[Job, bool]:
        statement = pg_insert(Job).values(**values).on_conflict_do_nothing(
            index_elements=["kind", "idempotency_key"], index_where=Job.idempotency_key.is_not(None)).returning(Job.id)
        new_id = db.execute(statement).scalar()
        if new_id is not None:
            return db.get(Job, new_id, populate_existing=True), True
        existing = db.scalar(select(Job).where(Job.kind == kind, Job.idempotency_key == idempotency_key)
                             .execution_options(populate_existing=True))
        return existing, False
    if not commit:
        return insert()
    with write_transaction(db):
        result = insert()
    return result


def claim(db: Session, worker_id: str, *, lease_of: Callable[[str], int], kinds=None, limit: int = 1, now=None) -> list[Job]:
    """Toma hasta `limit` trabajos vencidos (en cola, o en ejecución con la concesión vencida)."""
    current = _now(now)
    claimed: list[Job] = []
    with write_transaction(db):
        query = select(Job).where(
            ((Job.status == "queued") & (Job.run_at <= current)) | ((Job.status == "running") & (Job.locked_until <= current)))
        if kinds is not None:
            query = query.where(Job.kind.in_(list(kinds)))
        rows = db.scalars(query.order_by(Job.run_at, Job.id).limit(limit).with_for_update(skip_locked=True)
                          .execution_options(populate_existing=True)).all()
        for job in rows:
            if job.status == "running":  # el intento anterior no terminó: murió el proceso o se pasó del tiempo
                job.last_error = "lease_expired: el intento anterior no terminó"
                if job.attempts >= job.max_attempts:
                    job.status, job.finished_at, job.locked_by, job.locked_until = "dead", current, None, None
                    continue
            job.status, job.locked_by = "running", worker_id
            job.locked_until = current + timedelta(seconds=lease_of(job.kind))
            job.attempts += 1
            job.started_at = current
            claimed.append(job)
    return claimed


def _fenced(job: Job, worker_id: str):
    return (Job.id == job.id, Job.status == "running", Job.locked_by == worker_id, Job.attempts == job.attempts)


def complete(db: Session, job: Job, worker_id: str, *, now=None) -> bool:
    with write_transaction(db):
        done = db.execute(update(Job).where(*_fenced(job, worker_id)).values(
            status="succeeded", finished_at=_now(now), locked_by=None, locked_until=None, last_error=None)).rowcount
    return bool(done)


def fail(db: Session, job: Job, worker_id: str, error: str, *, permanent: bool = False, retry_in: float | None = None,
         now=None, rng: Callable[[], float] = random.random) -> str | None:
    """Registra el fallo. Devuelve el estado resultante (`queued` o `dead`) o `None` si el intento ya no era suyo."""
    current, error = _now(now), error[:MAX_ERROR_CHARS]
    dead = permanent or job.attempts >= job.max_attempts
    delay = retry_in if retry_in is not None else backoff_seconds(job.attempts, rng=rng)
    values = (dict(status="dead", finished_at=current) if dead
              else dict(status="queued", run_at=current + timedelta(seconds=delay)))
    with write_transaction(db):
        done = db.execute(update(Job).where(*_fenced(job, worker_id)).values(
            **values, locked_by=None, locked_until=None, last_error=error)).rowcount
    return ("dead" if dead else "queued") if done else None


def requeue_dead(db: Session, job_id: int, *, now=None) -> bool:
    """Reintento manual de un trabajo muerto: vuelve a la cola con los intentos en cero."""
    with write_transaction(db):
        return bool(db.execute(update(Job).where(Job.id == job_id, Job.status == "dead").values(
            status="queued", attempts=0, run_at=_now(now), finished_at=None, locked_by=None, locked_until=None)).rowcount)


def list_dead(db: Session, limit: int = 50) -> list[Job]:
    return list(db.scalars(select(Job).where(Job.status == "dead").order_by(Job.finished_at.desc(), Job.id.desc())
                           .limit(limit).execution_options(populate_existing=True)))


def stats(db: Session, *, now=None) -> dict:
    """Foto para alertas: cuántos hay por estado, cuánto lleva esperando el más viejo y los muertos por tipo."""
    current = _now(now)
    counts = dict(db.execute(select(Job.status, func.count()).group_by(Job.status)).all())
    oldest = db.scalar(select(func.min(Job.run_at)).where(Job.status == "queued", Job.run_at <= current))
    stuck = db.scalar(select(func.count()).where(Job.status == "running", Job.locked_until <= current))
    dead = dict(db.execute(select(Job.kind, func.count()).where(Job.status == "dead").group_by(Job.kind)).all())
    return {"queued": counts.get("queued", 0), "running": counts.get("running", 0), "succeeded": counts.get("succeeded", 0),
            "dead": counts.get("dead", 0), "dead_by_kind": dead, "stuck": stuck or 0,
            "oldest_queued_age_seconds": int((current - oldest).total_seconds()) if oldest else 0}


def purge(db: Session, *, now=None) -> dict:
    current = _now(now)
    with write_transaction(db):
        succeeded = db.execute(delete(Job).where(Job.status == "succeeded", Job.finished_at <= current - timedelta(
            days=settings.JOB_SUCCEEDED_RETENTION_DAYS))).rowcount
        dead = db.execute(delete(Job).where(Job.status == "dead", Job.finished_at <= current - timedelta(
            days=settings.JOB_DEAD_RETENTION_DAYS))).rowcount
    return {"succeeded": succeeded, "dead": dead}
