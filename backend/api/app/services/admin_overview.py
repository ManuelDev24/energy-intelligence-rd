"""ERD-ADM-DASH-WEB: resumen administrativo. Solo agregados (números); nunca filas, correos ni contenido de un hogar."""
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.config import settings
from app.models import CopilotUsage, Job, User
from app.models.auth import AuthSession
from app.services.copilot.tools import today_rd
from app.services.ocr.jobs import KIND as OCR_KIND

DAYS = 14
WORKER_STALE_MINUTES = 10


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _series(counts: dict[str, int], days: int) -> list[dict]:
    end = today_rd()
    return [{"day": (d := end - timedelta(days=days - 1 - i)), "value": int(counts.get(d.isoformat(), 0))} for i in range(days)]


def _jobs(db: Session, now: datetime) -> dict:
    by_status = dict(db.execute(select(Job.status, func.count()).group_by(Job.status)).all())
    queued_for = db.scalar(select(func.min(Job.run_at)).where(Job.status == "queued", Job.run_at <= now))
    last_finished = db.scalar(select(func.max(Job.finished_at)))
    running = by_status.get("running", 0)
    waiting_minutes = int((now - queued_for).total_seconds() // 60) if queued_for else 0
    # Sin telemetría propia del worker: se INFIERE. Hay trabajo vencido esperando y nada corriendo → probablemente detenido.
    state = "stalled" if waiting_minutes >= WORKER_STALE_MINUTES and running == 0 else "ok"
    ocr = dict(db.execute(select(Job.status, func.count()).where(Job.kind == OCR_KIND).group_by(Job.status)).all())
    return {"queued": by_status.get("queued", 0), "running": running, "dead": by_status.get("dead", 0),
            "oldest_wait_minutes": waiting_minutes, "last_finished_at": last_finished, "worker_state": state,
            "ocr_queued": ocr.get("queued", 0), "ocr_running": ocr.get("running", 0), "ocr_dead": ocr.get("dead", 0)}


def build(db: Session) -> dict:
    now = _now()
    since = now - timedelta(days=DAYS)
    counts = db.execute(text("SELECT admin_overview_counts(:d)"), {"d": DAYS}).scalar_one()
    created_day = func.date(func.timezone("America/Santo_Domingo", User.created_at))
    users_by_day = {d.isoformat(): n for d, n in db.execute(
        select(created_day, func.count()).where(User.created_at >= since).group_by(created_day))}
    day = today_rd()
    copilot_today = db.execute(select(func.coalesce(func.sum(CopilotUsage.messages), 0), func.coalesce(func.sum(CopilotUsage.tokens), 0),
                                      func.count()).where(CopilotUsage.day == day)).one()
    copilot_days = {d.isoformat(): n for d, n in db.execute(
        select(CopilotUsage.day, func.sum(CopilotUsage.messages)).where(CopilotUsage.day >= day - timedelta(days=DAYS - 1)).group_by(CopilotUsage.day))}
    return {
        "generated_at": now,
        "users": {"total": db.scalar(select(func.count()).select_from(User)),
                  "verified": db.scalar(select(func.count()).select_from(User).where(User.email_verified_at.is_not(None))),
                  "new_recent": db.scalar(select(func.count()).select_from(User).where(User.created_at >= since)),
                  "active_sessions": db.scalar(select(func.count()).select_from(AuthSession).where(AuthSession.revoked_at.is_(None),
                                                                                                   AuthSession.expires_at > now))},
        "homes": {"total": counts["homes_total"]},
        "bills": {"total": counts["bills_total"], "recent": counts["bills_recent"]},
        "alerts": {"unread": counts["alerts_unread"]},
        "outages": {"recent": counts["outages_recent"]},
        "jobs": _jobs(db, now),
        "copilot": {"provider": settings.COPILOT_PROVIDER, "messages_today": int(copilot_today[0]), "tokens_today": int(copilot_today[1]),
                    "people_today": int(copilot_today[2])},
        "health": {"database": "ok", "storage": settings.STORAGE_BACKEND, "email": settings.EMAIL_BACKEND,
                   "error_tracking": "configured" if settings.SENTRY_DSN else "not_configured", "environment": settings.ENVIRONMENT},
        "window_days": DAYS,
        "trends": {"new_users": _series(users_by_day, DAYS), "new_bills": _series(counts["bills_by_day"], DAYS),
                   "copilot_messages": _series(copilot_days, DAYS)},
    }
