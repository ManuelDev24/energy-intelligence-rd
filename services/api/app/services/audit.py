import hashlib
import hmac
import json

from sqlalchemy import func, inspect

from app.config import settings
from app.models.audit import AuditEvent

# Auditoría C-15 (DB-04): el historial de cambios no debe ser una segunda copia de los datos personales. Estos campos se guardan
# como «[redacted:xxxxxx]»: el sufijo es un HMAC corto con la clave de la aplicación, para ver SI cambió un valor sin guardar cuál era
# (y sin poder invertirlo fuera de la aplicación). Debe coincidir con la migración 0028.
SENSITIVE_FIELDS = frozenset({"account_number", "address", "city", "sector", "province", "municipality"})


def _redacted(value) -> str:
    key = (settings.AUTH_SIGNING_KEY or "audit-redaction-dev").encode()
    return "[redacted:" + hmac.new(key, str(value).encode(), hashlib.sha256).hexdigest()[:6] + "]"


def snapshot(record) -> dict:
    data = {c.key: getattr(record, c.key) for c in inspect(record).mapper.column_attrs}
    for field in SENSITIVE_FIELDS:
        if data.get(field) not in (None, ""):
            data[field] = _redacted(data[field])
    return json.loads(json.dumps(data, default=str))


def actor_user_id(db):
    """Persona autenticada de esta petición (la fija la dependencia de autenticación), o None en el worker y el modo piloto."""
    return db.info.get("rls_user_id")


def record_change(db, home_id, record, operation, before=None, *, entity=None, after=None):
    db.flush()
    db.add(AuditEvent(home_id=home_id, entity_id=getattr(record, "id", home_id),
                      entity=entity or record.__tablename__, operation=operation, before=before,
                      created_at=func.clock_timestamp(), actor_user_id=actor_user_id(db),
                      after=None if operation == "delete" else (after if after is not None else snapshot(record))))
