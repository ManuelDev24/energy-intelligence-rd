"""ERD-ADM-HOMES-WEB: consulta administrativa de viviendas. SOLO LECTURA.

La RLS impide al API ver viviendas ajenas, así que las lecturas pasan por dos funciones `SECURITY DEFINER` (0038) que devuelven únicamente
identificadores, código, distribuidora, provincia, fechas y conteos. Nunca nombre, dirección, ciudad, sector ni correos de los miembros.
El término de búsqueda NO se guarda en la auditoría; sí queda quién consultó y cada ficha abierta (`homes.view`, recurso `homes:<id>`)."""
import json
import re
import uuid

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services import admin
from app.services.errors import InvalidInput, NotFound

MIN_QUERY = 3
DISTRIBUTORS = ("EDESUR", "EDENORTE", "EDEESTE", "Otra")
_TERM = re.compile(r"^[A-Za-z0-9_\-]{3,64}$")


def list_homes(db: Session, *, actor_user_id, request_id, q: str | None, distributor: str | None, limit: int, offset: int):
    term = (q or "").strip()
    if term and not _TERM.match(term):
        raise InvalidInput(f"Busca por el código de la vivienda o su identificador (al menos {MIN_QUERY} letras, números o guiones)")
    if distributor is not None and distributor not in DISTRIBUTORS:
        raise InvalidInput("Distribuidora no válida")
    row = db.execute(text("SELECT admin_homes_page(:q, :d, :l, :o)"),
                     {"q": term or None, "d": distributor, "l": limit, "o": offset}).scalar_one()
    data = row if isinstance(row, dict) else json.loads(row)
    admin.record_audit(db, actor_user_id=actor_user_id, action="homes.search", resource="homes", scope_used="admin.homes.read", reason=None,
                       result="success", request_id=request_id,
                       metadata={"with_query": bool(term), "distributor_filter": distributor, "returned": len(data["items"])})
    db.commit()
    return data["items"], data["total"]


def get_home(db: Session, home_id: uuid.UUID, *, actor_user_id, request_id) -> dict:
    row = db.execute(text("SELECT admin_home_detail(:id)"), {"id": home_id}).scalar_one()
    if row is None:
        raise NotFound("Vivienda no encontrada")
    admin.record_audit(db, actor_user_id=actor_user_id, action="homes.view", resource=f"homes:{home_id}", scope_used="admin.homes.read",
                       reason=None, result="success", request_id=request_id, metadata=None)
    db.commit()
    return row if isinstance(row, dict) else json.loads(row)
