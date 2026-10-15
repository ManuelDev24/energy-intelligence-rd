"""Auditoría C-15 (DB-05): retención con plazos escritos. Sin FastAPI.

Borra, en lotes cortos (para no retener bloqueos), lo que ya no tiene motivo para existir: sesiones vencidas o revocadas, contadores
anti-abuso viejos, invitaciones cerradas (guardan el correo de un tercero), avisos enviados antiguos, alertas descartadas antiguas e historial
de cambios antiguo. Los plazos están en `config.py` (RETENTION_*) y deben coincidir con el aviso de privacidad. Lo ejecuta el worker a diario
(`maintenance.retention`); como el worker usa `erd_worker`, ve todas las viviendas.
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings

BATCH = 1000

# (nombre, tabla, condición). `:cutoff` es «ahora − plazo». Sin datos del usuario en el SQL: solo nombres fijos.
RULES = (
    ("sessions", "auth_sessions", "coalesce(revoked_at, expires_at) < :cutoff AND (revoked_at IS NOT NULL OR expires_at < now())",
     "RETENTION_SESSION_DAYS"),
    ("abuse_buckets", "auth_abuse_buckets", "window_started_at < :cutoff", "RETENTION_ABUSE_BUCKET_DAYS"),
    ("invitations", "home_invitations", "coalesce(accepted_at, revoked_at, expires_at) < :cutoff "
     "AND (accepted_at IS NOT NULL OR revoked_at IS NOT NULL OR expires_at < now())", "RETENTION_INVITATION_DAYS"),
    ("notifications", "notifications", "created_at < :cutoff AND status <> 'pending'", "RETENTION_NOTIFICATION_DAYS"),
    ("dismissed_alerts", "alerts", "created_at < :cutoff AND status = 'dismissed'", "RETENTION_DISMISSED_ALERT_DAYS"),
    ("audit_events", "audit_events", "created_at < :cutoff", "RETENTION_AUDIT_DAYS"),
)


def purge(db: Session, *, now: datetime | None = None) -> dict[str, int]:
    current = now or datetime.now(timezone.utc)
    removed: dict[str, int] = {}
    for name, table, condition, setting in RULES:
        cutoff = current - timedelta(days=getattr(settings, setting))
        total = 0
        while True:
            deleted = db.execute(text(f"DELETE FROM {table} WHERE ctid IN (SELECT ctid FROM {table} WHERE {condition} LIMIT {BATCH})"),
                                 {"cutoff": cutoff}).rowcount
            db.commit()
            total += deleted
            if deleted < BATCH:
                break
        removed[name] = total
    return removed
