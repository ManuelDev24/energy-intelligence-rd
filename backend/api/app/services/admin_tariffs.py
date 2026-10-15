"""ERD-ADM-TARIFFS-WEB: cobertura y versiones de las tarifas publicadas. SOLO LECTURA sobre datos PÚBLICOS (pliegos de la SIE).

Por qué importa: `resolve_tariff` nunca reutiliza una versión vencida; si ninguna versión cubre «hoy», los costos en RD$ pasan a «tarifa no disponible».
Esta vista avisa con tiempo (`WARN_DAYS`) y distingue «vigente», «vence pronto sin versión siguiente», «solo futura» y «sin tarifa».
No toca datos de personas ni de viviendas, así que no se audita cada lectura (igual que el resumen)."""
from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.models import TARIFF_DISTRIBUTORS, Tariff
from app.services import tariffs as tariff_service
from app.services.tariffs import RESIDENTIAL_TARIFF_CODE

WARN_DAYS = 30


def _state(t: Tariff, today: date) -> str:
    if t.effective_from > today:
        return "future"
    return "past" if t.effective_to is not None and t.effective_to < today else "current"


def coverage_for(versions: list[Tariff], distributor: str, today: date, code: str = RESIDENTIAL_TARIFF_CODE) -> dict:
    """Función pura (sin base de datos) para poder probar cada caso con fechas fijas."""
    mine = sorted((t for t in versions if t.distributor == distributor and t.tariff_code == code), key=lambda t: t.effective_from)
    current = next((t for t in mine if _state(t, today) == "current"), None)
    out = {"distributor": distributor, "tariff_code": code, "current_id": None, "effective_from": None, "effective_to": None,
           "days_left": None, "next_from": None, "last_ended": None}
    if current is None:
        future = next((t for t in mine if t.effective_from > today), None)
        ended = [t.effective_to for t in mine if t.effective_to is not None and t.effective_to < today]
        out.update(status="future_only" if future else "missing", next_from=future.effective_from if future else None,
                   last_ended=max(ended) if ended else None)
        return out
    days_left = None if current.effective_to is None else (current.effective_to - today).days
    nxt = None
    if current.effective_to is not None:  # ¿empieza otra versión justo después (sin hueco)?
        nxt = next((t for t in mine if t.effective_from <= current.effective_to + timedelta(days=1) and t.effective_from > current.effective_from), None)
    expiring = days_left is not None and days_left <= WARN_DAYS and nxt is None
    out.update(status="expiring" if expiring else "current", current_id=current.id, effective_from=current.effective_from,
               effective_to=current.effective_to, days_left=days_left, next_from=nxt.effective_from if nxt else None)
    return out


def build(db: Session, today: date) -> dict:
    versions = tariff_service.list_tariffs(db, limit=500)
    items = []
    for t in sorted(versions, key=lambda t: (t.distributor, t.tariff_code, t.effective_from), reverse=False):
        items.append({"id": t.id, "distributor": t.distributor, "tariff_code": t.tariff_code, "effective_from": t.effective_from,
                      "effective_to": t.effective_to, "flat_all_units_from_kwh": t.flat_all_units_from_kwh, "fixed_charges": t.fixed_charges,
                      "blocks": t.blocks, "source_resolution": t.source_resolution, "source_url": t.source_url, "scope_note": t.scope_note,
                      "state": _state(t, today)})
    return {"today": today, "warn_days": WARN_DAYS, "coverage": [coverage_for(versions, d, today) for d in TARIFF_DISTRIBUTORS], "versions": items}
