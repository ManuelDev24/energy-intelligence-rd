"""ERD-ADM-OPS-WEB: estado de los trabajos en segundo plano (todos los tipos). SOLO LECTURA.

Igual que la consola OCR: no se devuelve la carga útil ni el texto del error (`has_error` indica que existe), porque los mensajes de error de
proveedores externos pueden contener correos u otros datos personales. Reintentar o cancelar trabajos NO está aquí (el OCR tiene su consola)."""
import re
from datetime import datetime, timedelta, timezone

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.models.job import JOB_STATUSES, Job
from app.services.errors import InvalidInput

OVERDUE_MINUTES = 10
_KIND = re.compile(r"^[a-z][a-z0-9_.-]{0,63}$")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def summary(db: Session, now: datetime | None = None) -> dict:
    now = now or _now()
    day_ago, overdue_before = now - timedelta(hours=24), now - timedelta(minutes=OVERDUE_MINUTES)
    queued_due = (Job.status == "queued") & (Job.run_at <= now)
    rows = db.execute(select(
        Job.kind,
        func.count().filter(Job.status == "queued").label("queued"),
        func.count().filter(Job.status == "running").label("running"),
        func.count().filter(Job.status == "dead").label("dead"),
        func.count().filter((Job.status == "succeeded") & (Job.finished_at >= day_ago)).label("succeeded_24h"),
        func.count().filter((Job.status == "dead") & (Job.finished_at >= day_ago)).label("dead_24h"),
        func.count().filter((Job.status == "cancelled") & (Job.finished_at >= day_ago)).label("cancelled_24h"),
        func.count().filter((Job.status == "queued") & (Job.run_at <= overdue_before)).label("overdue"),
        func.min(case((queued_due, Job.run_at))).label("oldest_due"),
        func.max(Job.finished_at).label("last_finished_at"),
        func.max(case((Job.status == "succeeded", Job.finished_at))).label("last_success_at"),
    ).group_by(Job.kind).order_by(Job.kind)).all()
    kinds = [{"kind": r.kind, "queued": r.queued, "running": r.running, "dead": r.dead, "succeeded_24h": r.succeeded_24h, "dead_24h": r.dead_24h,
              "cancelled_24h": r.cancelled_24h, "overdue": r.overdue,
              "oldest_wait_minutes": max(0, int((now - r.oldest_due).total_seconds() // 60)) if r.oldest_due else 0,
              "last_finished_at": r.last_finished_at, "last_success_at": r.last_success_at} for r in rows]
    return {"generated_at": now, "overdue_minutes": OVERDUE_MINUTES, "kinds": kinds}


def list_jobs(db: Session, *, kind: str | None, status: str | None, limit: int, offset: int, now: datetime | None = None):
    now = now or _now()
    if kind is not None and not _KIND.match(kind):
        raise InvalidInput("Tipo de trabajo no válido")
    if status is not None and status not in JOB_STATUSES:
        raise InvalidInput("Estado no válido")
    query = select(Job)
    if kind is not None:
        query = query.where(Job.kind == kind)
    if status is not None:
        query = query.where(Job.status == status)
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    rows = db.scalars(query.order_by(Job.id.desc()).limit(limit).offset(offset)).all()
    overdue_before = now - timedelta(minutes=OVERDUE_MINUTES)
    items = [{"id": j.id, "kind": j.kind, "status": j.status, "attempts": j.attempts, "max_attempts": j.max_attempts, "run_at": j.run_at,
              "created_at": j.created_at, "started_at": j.started_at, "finished_at": j.finished_at, "has_error": bool(j.last_error),
              "overdue": j.status == "queued" and j.run_at <= overdue_before} for j in rows]
    return items, total
