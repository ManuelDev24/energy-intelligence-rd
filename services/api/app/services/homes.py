from sqlalchemy import select

from app.models import Bill, Home, HomeMember
from app.services.audit import record_change, snapshot
from app.services.errors import InvalidInput
from app.services.transactions import require_home, write_transaction


def list_homes(db, limit=100, offset=0, *, user_id=None):
    query = select(Home)
    if user_id is not None:
        query = query.join(HomeMember).where(HomeMember.user_id == user_id)
    return list(db.scalars(query.order_by(Home.code, Home.created_at, Home.id).limit(limit).offset(offset)))


def create_home(db, payload, *, owner_id=None):
    with write_transaction(db):
        home = Home(**payload.model_dump())
        db.add(home)
        db.flush()
        if owner_id is not None:
            db.add(HomeMember(home_id=home.id, user_id=owner_id, role="owner"))
        record_change(db, home.id, home, "create")
    return home


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
