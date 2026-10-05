from decimal import Decimal
from sqlalchemy import select
from app.models.bill_detail import BillSnapshot

from app.models import Bill
from app.services.alerts import recompute_alerts
from app.services.audit import record_change, snapshot
from app.services.errors import ApplicationError, NotFound
from app.services.transactions import require_home, write_transaction


def get_bill(db, home_id, bill_id):
    bill = db.scalar(select(Bill).where(Bill.id == bill_id, Bill.home_id == home_id)
                     .execution_options(populate_existing=True))
    if bill is None:
        raise NotFound("Factura no encontrada para esta vivienda")
    return bill


def list_bills(db, home_id, *, limit=100, offset=0):
    require_home(db, home_id)
    return list(db.scalars(select(Bill).where(Bill.home_id == home_id)
                          .order_by(Bill.period_end.desc(), Bill.id.desc()).limit(limit).offset(offset)))


def ensure_no_overlap(db, home_id, start, end, exclude_id=None):
    query = select(Bill.id).where(Bill.home_id == home_id, Bill.period_start <= end, Bill.period_end >= start)
    if exclude_id is not None:
        query = query.where(Bill.id != exclude_id)
    if db.scalar(query.limit(1)) is not None:
        raise ApplicationError("El período se solapa con otra factura de esta vivienda")


def normalized_fields(payload):
    return {key: value.quantize(Decimal("0.01")) if isinstance(value, Decimal) else value
            for key, value in payload.model_dump().items()}


def create_bill(db, home_id, payload):
    with write_transaction(db):
        require_home(db, home_id, lock=True)
        ensure_no_overlap(db, home_id, payload.period_start, payload.period_end)
        bill = Bill(home_id=home_id, **normalized_fields(payload))
        db.add(bill)
        record_change(db, home_id, bill, "create")
        db.add(BillSnapshot(bill_id=bill.id, origin="creation", data=snapshot(bill)))
        recompute_alerts(db, home_id)
    return bill


def update_bill(db, home_id, bill_id, payload):
    with write_transaction(db):
        require_home(db, home_id, lock=True)
        bill = get_bill(db, home_id, bill_id)
        before = snapshot(bill)
        ensure_no_overlap(db, home_id, payload.period_start, payload.period_end, bill_id)
        for key, value in normalized_fields(payload).items():
            setattr(bill, key, value)
        record_change(db, home_id, bill, "update", before)
        recompute_alerts(db, home_id)
    return bill


def delete_bill(db, home_id, bill_id):
    with write_transaction(db):
        require_home(db, home_id, lock=True)
        bill = get_bill(db, home_id, bill_id)
        record_change(db, home_id, bill, "delete", snapshot(bill))
        db.delete(bill)
        db.flush()
        # Expire identity-map alerts removed through PostgreSQL cascades.
        db.expire_all()
        recompute_alerts(db, home_id)
