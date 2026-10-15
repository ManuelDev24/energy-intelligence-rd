"""ERD-ADM-BILLS-WEB: calidad de datos de facturas y línea de tiempo de UNA vivienda. SOLO LECTURA.

La RLS impide al API ver facturas ajenas; las lecturas pasan por funciones `SECURITY DEFINER` (0039). No hay listado global de importes: para ver las
facturas de una vivienda hay que indicar su identificador exacto, y cada consulta queda en la auditoría (`bills.summary`, `bills.list` sobre `homes:<id>`)."""
import json
import uuid

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services import admin
from app.services.errors import NotFound


def _load(value):
    return value if isinstance(value, (dict, type(None))) else json.loads(value)


def summary(db: Session, *, actor_user_id, request_id, days: int) -> dict:
    data = _load(db.execute(text("SELECT admin_bills_summary(:d)"), {"d": days}).scalar_one())
    admin.record_audit(db, actor_user_id=actor_user_id, action="bills.summary", resource="bills", scope_used="admin.bills.read", reason=None,
                       result="success", request_id=request_id, metadata={"days": days})
    db.commit()
    return data


def home_bills(db: Session, home_id: uuid.UUID, *, actor_user_id, request_id, limit: int, offset: int):
    data = _load(db.execute(text("SELECT admin_home_bills(:h, :l, :o)"), {"h": home_id, "l": limit, "o": offset}).scalar_one())
    if data is None:
        raise NotFound("Vivienda no encontrada")
    admin.record_audit(db, actor_user_id=actor_user_id, action="bills.list", resource=f"homes:{home_id}", scope_used="admin.bills.read", reason=None,
                       result="success", request_id=request_id, metadata={"returned": len(data["items"])})
    db.commit()
    return data["items"], data["total"]
