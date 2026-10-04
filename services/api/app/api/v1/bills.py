import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_home_or_404
from app.database import get_db
from app.models import Bill
from app.schemas import BillCreate, BillOut, BillUpdate
from app.services.alerts import recompute_alerts

router = APIRouter(prefix="/homes/{home_id}/bills", tags=["bills"])


def _get_bill_or_404(db: Session, home_id: uuid.UUID, bill_id: uuid.UUID) -> Bill:
    bill = db.get(Bill, bill_id)
    if bill is None or bill.home_id != home_id:
        raise HTTPException(status_code=404, detail="Factura no encontrada para esta vivienda")
    return bill


def _ensure_no_overlap(db: Session, home_id: uuid.UUID, start, end, exclude_id: uuid.UUID | None = None) -> None:
    q = select(Bill.id).where(Bill.home_id == home_id, Bill.period_start <= end, Bill.period_end >= start)
    if exclude_id is not None:
        q = q.where(Bill.id != exclude_id)
    if db.scalars(q.limit(1)).first() is not None:
        raise HTTPException(status_code=409, detail="El período se solapa con otra factura de esta vivienda")


def _commit_with_alerts(db: Session, home_id: uuid.UUID) -> None:
    """Toda escritura de facturas recalcula las alertas de la vivienda en la misma transacción."""
    try:
        db.flush()
        recompute_alerts(db, home_id)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Factura duplicada o datos inconsistentes")


@router.get("", response_model=list[BillOut])
def list_bills(home_id: uuid.UUID, db: Session = Depends(get_db)):
    get_home_or_404(db, home_id)
    return list(db.scalars(
        select(Bill).where(Bill.home_id == home_id).order_by(Bill.period_start.desc())
    ))


@router.post("", response_model=BillOut, status_code=status.HTTP_201_CREATED)
def create_bill(home_id: uuid.UUID, payload: BillCreate, db: Session = Depends(get_db)):
    get_home_or_404(db, home_id)
    _ensure_no_overlap(db, home_id, payload.period_start, payload.period_end)
    bill = Bill(home_id=home_id, **payload.model_dump())
    db.add(bill)
    _commit_with_alerts(db, home_id)
    return bill


@router.get("/{bill_id}", response_model=BillOut)
def get_bill(home_id: uuid.UUID, bill_id: uuid.UUID, db: Session = Depends(get_db)):
    get_home_or_404(db, home_id)
    return _get_bill_or_404(db, home_id, bill_id)


@router.put("/{bill_id}", response_model=BillOut)
def update_bill(home_id: uuid.UUID, bill_id: uuid.UUID, payload: BillUpdate, db: Session = Depends(get_db)):
    get_home_or_404(db, home_id)
    bill = _get_bill_or_404(db, home_id, bill_id)
    _ensure_no_overlap(db, home_id, payload.period_start, payload.period_end, exclude_id=bill.id)
    for k, v in payload.model_dump().items():
        setattr(bill, k, v)
    _commit_with_alerts(db, home_id)
    return bill


@router.delete("/{bill_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_bill(home_id: uuid.UUID, bill_id: uuid.UUID, db: Session = Depends(get_db)):
    get_home_or_404(db, home_id)
    db.delete(_get_bill_or_404(db, home_id, bill_id))
    _commit_with_alerts(db, home_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
