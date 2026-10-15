"""ERD-CLAIM-01: reclamaciones. Reglas: la persona describe el caso; la app congela un resumen NEUTRAL de sus datos (no acusa a nadie),
evita duplicados abiertos por factura y tipo, limita el abuso y deja un historial que solo crece. La persona puede anotar, guardar el
número de referencia de su distribuidora y cerrar el caso; «en revisión» y «resuelto» los fijará un panel de soporte (aún no existe)."""
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import Date, cast, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Bill, Claim, ClaimEvent, Document, MeterReading
from app.schemas.claim import ClaimDetailOut
from app.services import calculations as calc
from app.services.audit import record_change
from app.services.errors import ApplicationError, InvalidInput, NotFound
from app.services.transactions import require_home, write_transaction

MAX_OPEN_PER_HOME = 20
MAX_EVENTS_PER_CLAIM = 100
BILL_REQUIRED = {"billing_error", "consumption_dispute"}
EVIDENCE_NOTE = ("Comparación hecha con los datos que registraste. Sirve de apoyo, pero no demuestra por sí sola un error de la distribuidora.")


class ClaimConflict(ApplicationError):
    status_code = 409
    code = "claim_conflict"


class ClaimLimit(ApplicationError):
    status_code = 409
    code = "claim_limit"


def _m(value: Decimal, unit: str, quality: str) -> dict:
    return {"value": str(value), "unit": unit, "quality": quality}


def _bill_block(b: Bill) -> dict:
    price = calc.q2(b.amount_dop / b.kwh) if b.kwh > 0 else None
    return {"period_start": b.period_start.isoformat(), "period_end": b.period_end.isoformat(), "days": b.days, "kwh": _m(b.kwh, "kWh", "REAL"),
            "amount_dop": _m(b.amount_dop, "RD$", "REAL"), "avg_price_per_kwh": _m(price, "RD$/kWh", "ESTIMATED") if price is not None else None}


def build_evidence(db: Session, bill: Bill, *, now: datetime | None = None) -> dict:
    previous = db.scalar(select(Bill).where(Bill.home_id == bill.home_id, Bill.period_end < bill.period_start).order_by(Bill.period_end.desc()).limit(1))
    prev_block = None
    if previous is not None:
        v = calc.variation(bill, previous)
        prev_block = {**_bill_block(previous), "kwh_pct": _m(v.kwh_pct, "%", "ESTIMATED") if v.kwh_pct is not None else None,
                      "amount_pct": _m(v.amount_pct, "%", "ESTIMATED") if v.amount_pct is not None else None}
    readings = db.scalar(select(func.count()).select_from(MeterReading).where(
        MeterReading.home_id == bill.home_id, cast(MeterReading.read_at, Date) >= bill.period_start, cast(MeterReading.read_at, Date) <= bill.period_end)) or 0
    document = db.scalar(select(Document.id).where(Document.bill_id == bill.id).order_by(Document.created_at).limit(1))
    return {"bill": _bill_block(bill), "previous": prev_block, "readings_in_period": int(readings), "document_id": str(document) if document else None,
            "captured_at": (now or datetime.now(timezone.utc)).isoformat(), "note": EVIDENCE_NOTE}


def _event(claim: Claim, kind: str, *, note: str | None = None, status_to: str | None = None, actor: str = "user") -> ClaimEvent:
    return ClaimEvent(id=uuid.uuid4(), claim_id=claim.id, kind=kind, actor=actor, note=note, status_to=status_to)


def create_claim(db: Session, home_id, payload, *, user_id=None) -> Claim:
    try:
        return _create_claim(db, home_id, payload, user_id=user_id)
    except IntegrityError:  # carrera improbable (la vivienda se bloquea antes): el índice parcial único gana
        raise ClaimConflict("Ya tienes una reclamación abierta de este tipo para esa factura") from None


def _create_claim(db: Session, home_id, payload, *, user_id=None) -> Claim:
    if payload.kind in BILL_REQUIRED and payload.bill_id is None:
        raise InvalidInput("Este tipo de reclamación debe ir ligada a una factura")
    with write_transaction(db):
        require_home(db, home_id, lock=True)          # serializa el tope y el chequeo de duplicados por vivienda
        open_count = db.scalar(select(func.count()).select_from(Claim).where(Claim.home_id == home_id, Claim.status.in_(("open", "in_review")))) or 0
        if open_count >= MAX_OPEN_PER_HOME:
            raise ClaimLimit(f"Hay {MAX_OPEN_PER_HOME} reclamaciones abiertas: cierra alguna antes de crear otra")
        evidence = None
        if payload.bill_id is not None:
            bill = db.scalar(select(Bill).where(Bill.id == payload.bill_id, Bill.home_id == home_id))
            if bill is None:
                raise NotFound("Factura no encontrada")
            evidence = build_evidence(db, bill)
            duplicate = db.scalar(select(Claim.id).where(Claim.home_id == home_id, Claim.bill_id == bill.id, Claim.kind == payload.kind,
                                                         Claim.status.in_(("open", "in_review"))))
            if duplicate is not None:
                raise ClaimConflict("Ya tienes una reclamación abierta de este tipo para esa factura")
        claim = Claim(id=uuid.uuid4(), home_id=home_id, created_by=user_id, bill_id=payload.bill_id, kind=payload.kind, status="open",
                      subject=payload.subject, description=payload.description, disputed_amount_dop=payload.disputed_amount_dop,
                      reference_number=payload.reference_number or None, evidence=evidence)
        db.add(claim)
        db.flush()
        db.add(_event(claim, "created", status_to="open"))
        record_change(db, home_id, claim, "create")
    return claim


def list_claims(db: Session, home_id, *, status: str | None = None, limit: int = 50, offset: int = 0) -> list[Claim]:
    require_home(db, home_id)
    query = select(Claim).where(Claim.home_id == home_id)
    if status:
        query = query.where(Claim.status == status)
    return list(db.scalars(query.order_by(Claim.created_at.desc(), Claim.id).limit(limit).offset(offset)))


def get_claim(db: Session, home_id, claim_id, *, lock=False) -> Claim:
    query = select(Claim).where(Claim.id == claim_id, Claim.home_id == home_id)
    if lock:
        query = query.with_for_update()
    claim = db.scalar(query.execution_options(populate_existing=True))
    if claim is None:
        raise NotFound("Reclamación no encontrada")
    return claim


def claim_detail(db: Session, home_id, claim_id) -> ClaimDetailOut:
    claim = get_claim(db, home_id, claim_id)
    events = list(db.scalars(select(ClaimEvent).where(ClaimEvent.claim_id == claim.id).order_by(ClaimEvent.created_at, ClaimEvent.id)))
    return ClaimDetailOut.model_validate({**{k: getattr(claim, k) for k in ClaimDetailOut.model_fields if k not in ("evidence", "events", "disclaimer")},
                                          "evidence": claim.evidence, "events": events})


def _touch(claim: Claim) -> None:
    claim.updated_at = datetime.now(timezone.utc)


def add_note(db: Session, home_id, claim_id, note: str) -> None:
    with write_transaction(db):
        claim = get_claim(db, home_id, claim_id, lock=True)
        if claim.status in ("resolved", "closed"):
            raise ClaimConflict("La reclamación ya está cerrada")
        count = db.scalar(select(func.count()).select_from(ClaimEvent).where(ClaimEvent.claim_id == claim.id)) or 0
        if count >= MAX_EVENTS_PER_CLAIM:
            raise ClaimLimit("Este caso alcanzó el máximo de anotaciones")
        db.add(_event(claim, "note", note=note))
        _touch(claim)


def set_reference(db: Session, home_id, claim_id, reference: str) -> Claim:
    with write_transaction(db):
        claim = get_claim(db, home_id, claim_id, lock=True)
        if claim.status in ("resolved", "closed"):
            raise ClaimConflict("La reclamación ya está cerrada")
        claim.reference_number = reference
        db.add(_event(claim, "note", note=f"Número de referencia de la distribuidora: {reference}"))
        _touch(claim)
        record_change(db, home_id, claim, "update")
    return claim


def close_claim(db: Session, home_id, claim_id, note: str | None = None) -> Claim:
    """La persona retira/cierra su caso. Un caso resuelto por soporte o ya cerrado no cambia (409)."""
    with write_transaction(db):
        claim = get_claim(db, home_id, claim_id, lock=True)
        if claim.status in ("resolved", "closed"):
            raise ClaimConflict("La reclamación ya está cerrada")
        claim.status, claim.closed_at = "closed", datetime.now(timezone.utc)
        db.add(_event(claim, "status", note=note, status_to="closed"))
        _touch(claim)
        record_change(db, home_id, claim, "update")
    return claim
