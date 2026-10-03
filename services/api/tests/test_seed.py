import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Bill, Home
from app.seed import seed_pilot


def test_seed_is_idempotent(migrated):
    with Session(migrated) as s:
        first = seed_pilot(s)
        second = seed_pilot(s)
        third = seed_pilot(s)
        assert first["homes_created"] == 5 and first["bills_created"] >= 10
        assert second == third == {"homes_created": 0, "bills_created": 0}
        assert s.scalar(select(func.count()).select_from(Home)) == 5
        assert s.scalar(select(func.count()).select_from(Bill)) == first["bills_created"]


def test_seed_each_home_has_two_bills_and_valid_distributor(migrated):
    with Session(migrated) as s:
        seed_pilot(s)
        for h in s.scalars(select(Home)):
            assert len(h.bills) >= 2
            assert h.distributor in {"EDESUR", "EDENORTE", "EDEESTE", "Otra"}
            assert all(b.source == "seed" for b in h.bills)  # etiquetado como demo


def test_seed_does_not_overwrite_user_edits(migrated):
    with Session(migrated) as s:
        seed_pilot(s)
        h = s.scalar(select(Home).where(Home.code == "PILOT-01"))
        h.name = "Editada"
        s.commit()
        seed_pilot(s)
        assert s.scalar(select(Home.name).where(Home.code == "PILOT-01")) == "Editada"
