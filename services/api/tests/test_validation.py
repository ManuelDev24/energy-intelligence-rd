from datetime import date
from decimal import Decimal

import pytest
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError

from app.models import Alert, Bill, Home
from app.schemas import BillCreate, HomeCreate


# ---- Pydantic ----
@pytest.mark.parametrize("d", ["EDESUR", "EDENORTE", "EDEESTE", "Otra"])
def test_schema_accepts_distributors(d):
    assert HomeCreate(name="Casa", distributor=d).distributor == d


def test_schema_rejects_unknown_distributor():
    with pytest.raises(ValidationError):
        HomeCreate(name="Casa", distributor="EDEFOO")


def _bill(**kw):
    base = dict(home_id="x", period_start=date(2026, 8, 1), period_end=date(2026, 8, 31),
                kwh=Decimal("100"), amount_dop=Decimal("1500"), days=30)
    base.update(kw)
    return BillCreate(**base)


@pytest.mark.parametrize("field,val", [("kwh", Decimal("-1")), ("amount_dop", Decimal("-0.01")), ("days", -1)])
def test_schema_rejects_negatives(field, val):
    with pytest.raises(ValidationError):
        _bill(**{field: val})


def test_schema_rejects_inverted_period():
    with pytest.raises(ValidationError):
        _bill(period_start=date(2026, 9, 1), period_end=date(2026, 8, 1))


def test_schema_accepts_zero_values():
    _bill(kwh=Decimal("0"), amount_dop=Decimal("0"), days=0)


# ---- DB constraints ----
def _home(session, dist="EDESUR"):
    h = Home(name="Casa 1", distributor=dist)
    session.add(h)
    session.flush()
    return h


def test_db_insert_ok(session):
    h = _home(session)
    b = Bill(home_id=h.id, period_start=date(2026, 8, 1), period_end=date(2026, 8, 31),
             kwh=Decimal("250.5"), amount_dop=Decimal("3000"), days=31)
    session.add(b)
    session.flush()
    a = Alert(home_id=h.id, bill_id=b.id, type="high_consumption", message="Consumo alto")
    session.add(a)
    session.flush()
    session.refresh(a)
    assert a.status == "open" and a.severity == "info"


def test_db_rejects_bad_distributor(session):
    with pytest.raises(IntegrityError):
        _home(session, dist="OTRA_X")


@pytest.mark.parametrize("kw", [
    {"kwh": Decimal("-1")},
    {"amount_dop": Decimal("-1")},
    {"days": -1},
    {"period_start": date(2026, 9, 1), "period_end": date(2026, 8, 1)},
])
def test_db_rejects_invalid_bill(session, kw):
    h = _home(session)
    vals = dict(home_id=h.id, period_start=date(2026, 8, 1), period_end=date(2026, 8, 31),
                kwh=Decimal("1"), amount_dop=Decimal("1"), days=1)
    vals.update(kw)
    session.add(Bill(**vals))
    with pytest.raises(IntegrityError):
        session.flush()
