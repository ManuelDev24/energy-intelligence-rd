import hashlib
import json
import uuid
from datetime import timedelta

from sqlalchemy import delete, func, select

from app import rls
from app.config import settings
from app.models import Bill, Home, HomeCreateRequest, HomeMember, User
from app.services.audit import record_change, snapshot
from app.services.errors import ApplicationError, InvalidInput
from app.services.transactions import require_home, write_transaction


def list_homes(db, limit=100, offset=0, *, user_id=None):
    query = select(Home)
    if user_id is not None:
        query = query.join(HomeMember).where(HomeMember.user_id == user_id)
    return list(db.scalars(query.order_by(Home.code, Home.created_at, Home.id).limit(limit).offset(offset)))


class HomeLimitReached(ApplicationError):
    status_code = 409
    code = "home_limit_reached"


class IdempotencyKeyReused(ApplicationError):
    status_code = 409
    code = "idempotency_key_reused"


IDEMPOTENCY_TTL = timedelta(hours=24)


def _fingerprint(payload) -> str:
    return hashlib.sha256(json.dumps(payload.model_dump(mode="json"), sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def create_home(db, payload, *, owner_id=None, idempotency_key=None):
    """Con `idempotency_key` (solo con cuenta) la repetición de la misma solicitud devuelve la misma vivienda: `(home, replayed)`."""
    if idempotency_key is not None and owner_id is None:
        raise InvalidInput("Idempotency-Key requiere una cuenta")
    with write_transaction(db):
        data = payload.model_dump()
        if idempotency_key is not None:
            # La fila de la persona se bloquea antes de leer la clave: dos envíos simultáneos con la misma clave se serializan.
            db.execute(select(User.id).where(User.id == owner_id).with_for_update())
            db.execute(delete(HomeCreateRequest).where(HomeCreateRequest.user_id == owner_id, HomeCreateRequest.created_at < func.now() - IDEMPOTENCY_TTL))
            previous = db.get(HomeCreateRequest, (owner_id, idempotency_key))
            if previous is not None:
                if previous.fingerprint != _fingerprint(payload):
                    raise IdempotencyKeyReused("La clave de idempotencia ya se usó con otra solicitud")
                rls.set_context(db, home_id=previous.home_id)
                existing = db.get(Home, previous.home_id)
                if existing is not None:
                    return existing, True
                db.delete(previous)
                db.flush()
        if owner_id is not None:
            # Auditoría C-24 (DB-11): `code` es único global; con cuentas, aceptarlo revelaría si existe en otro hogar (409). Se ignora.
            data["code"] = None
            # DB-12: tope de viviendas propias por persona (abuso de almacenamiento). Se serializa con la fila de la persona.
            db.execute(select(User.id).where(User.id == owner_id).with_for_update())
            owned = db.scalar(select(func.count()).select_from(HomeMember).where(HomeMember.user_id == owner_id, HomeMember.role == "owner"))
            if owned >= settings.MAX_HOMES_PER_USER:
                raise HomeLimitReached(f"Alcanzaste el máximo de {settings.MAX_HOMES_PER_USER} viviendas propias")
        home = Home(id=uuid.uuid4(), **data)
        rls.set_context(db, home_id=home.id)  # el INSERT … RETURNING lee la fila nueva antes de que exista la membresía
        db.add(home)
        db.flush()
        if owner_id is not None:
            db.add(HomeMember(home_id=home.id, user_id=owner_id, role="owner"))
        if idempotency_key is not None:
            db.add(HomeCreateRequest(user_id=owner_id, key=idempotency_key, fingerprint=_fingerprint(payload), home_id=home.id))
        record_change(db, home.id, home, "create")
    return home, False


def update_home(db, home_id, payload):
    with write_transaction(db):
        home = require_home(db, home_id, lock=True)
        data = payload.model_dump(exclude_unset=True)
        if any(key in data and data[key] is None for key in ("name", "distributor")):
            raise InvalidInput("name y distributor no pueden ser null")
        before = snapshot(home)
        for key, value in data.items():
            setattr(home, key, value)
        record_change(db, home_id, home, "update", before)
    return home


def delete_home(db, home_id):
    with write_transaction(db):
        home = require_home(db, home_id, lock=True)
        # Keep bill snapshots even when the pilot's explicit cascade delete is used.
        for bill in db.scalars(select(Bill).where(Bill.home_id == home_id)):
            record_change(db, home_id, bill, "delete", snapshot(bill))
        record_change(db, home_id, home, "delete", snapshot(home))
        db.delete(home)
