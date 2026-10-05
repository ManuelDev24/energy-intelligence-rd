"""Lecturas acumuladas del medidor. Monotonía no decreciente por vivienda (sin reemplazo de medidor)."""
from sqlalchemy import select

from app.models import MeterReading
from app.services.audit import record_change, snapshot
from app.services.errors import InvalidInput, NotFound
from app.services.transactions import require_home, write_transaction


def get_reading(db, home_id, reading_id):
    reading = db.scalar(select(MeterReading).where(MeterReading.id == reading_id, MeterReading.home_id == home_id))
    if reading is None:
        raise NotFound("Lectura no encontrada para esta vivienda")
    return reading


def list_readings(db, home_id, *, limit=100, offset=0):
    require_home(db, home_id)
    return list(db.scalars(select(MeterReading).where(MeterReading.home_id == home_id)
                           .order_by(MeterReading.read_at.desc(), MeterReading.id.desc()).limit(limit).offset(offset)))


def ensure_monotonic(db, home_id, read_at, reading_kwh):
    """La nueva lectura debe quedar >= la anterior y <= la siguiente en el tiempo."""
    base = select(MeterReading.reading_kwh).where(MeterReading.home_id == home_id)
    prev = db.scalar(base.where(MeterReading.read_at < read_at).order_by(MeterReading.read_at.desc()).limit(1))
    nxt = db.scalar(base.where(MeterReading.read_at > read_at).order_by(MeterReading.read_at.asc()).limit(1))
    if prev is not None and reading_kwh < prev:
        raise InvalidInput(f"La lectura ({reading_kwh}) es menor que la anterior ({prev}). "
                           "El reemplazo de medidor no está soportado todavía.")
    if nxt is not None and reading_kwh > nxt:
        raise InvalidInput(f"La lectura ({reading_kwh}) es mayor que la siguiente ({nxt}).")


def create_reading(db, home_id, payload):
    with write_transaction(db):
        # El bloqueo de la vivienda serializa escrituras concurrentes y protege la monotonía.
        require_home(db, home_id, lock=True)
        ensure_monotonic(db, home_id, payload.read_at, payload.reading_kwh)
        reading = MeterReading(home_id=home_id, **payload.model_dump())
        db.add(reading)
        record_change(db, home_id, reading, "create")
    return reading


def delete_reading(db, home_id, reading_id):
    # Quitar un punto de una serie monótona la mantiene monótona.
    with write_transaction(db):
        require_home(db, home_id, lock=True)
        reading = get_reading(db, home_id, reading_id)
        record_change(db, home_id, reading, "delete", snapshot(reading))
        db.delete(reading)
