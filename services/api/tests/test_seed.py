import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Alert, Bill, Equipment, Home
from app.seed import seed_pilot

ZERO = {"homes_created": 0, "bills_created": 0, "equipment_created": 0}


def test_seed_is_idempotent(migrated):
    with Session(migrated) as s:
        first = seed_pilot(s)
        second = seed_pilot(s)
        third = seed_pilot(s)
        assert first["homes_created"] == 5 and first["bills_created"] >= 10
        assert first["equipment_created"] >= 10
        assert second == third == ZERO
        assert s.scalar(select(func.count()).select_from(Home)) == 5
        assert s.scalar(select(func.count()).select_from(Bill)) == first["bills_created"]
        assert s.scalar(select(func.count()).select_from(Equipment)) == first["equipment_created"]


def test_seed_generates_expected_alerts_and_keeps_status(migrated):
    with Session(migrated) as s:
        seed_pilot(s)
        by_code = {a.home.code: a for a in s.scalars(select(Alert))}
        assert set(by_code) == {"PILOT-01", "PILOT-03"}  # solo donde se supera el umbral
        assert by_code["PILOT-01"].severity == "critical" and by_code["PILOT-03"].severity == "warning"
        by_code["PILOT-01"].status = "dismissed"
        s.commit()
        seed_pilot(s)
        assert s.scalar(select(func.count()).select_from(Alert)) == 2
        assert s.scalar(select(Alert.status).where(Alert.id == by_code["PILOT-01"].id)) == "dismissed"


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
