import json
from sqlalchemy import func, inspect

from app.models.audit import AuditEvent


def snapshot(record) -> dict:
    return json.loads(json.dumps({c.key: getattr(record, c.key) for c in inspect(record).mapper.column_attrs}, default=str))


def record_change(db, home_id, record, operation, before=None, *, entity=None, after=None):
    db.flush()
    db.add(AuditEvent(home_id=home_id, entity_id=getattr(record, "id", home_id),
                      entity=entity or record.__tablename__, operation=operation, before=before,
                      created_at=func.clock_timestamp(),
                      after=None if operation == "delete" else (after if after is not None else snapshot(record))))
