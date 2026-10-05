from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from datetime import date
from decimal import Decimal
import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Bill, Home
from app.models.audit import AuditEvent
from app.schemas.bill import BillCreate
from app.schemas.alert import AlertSettingsIn
from app.services.bills import create_bill
from app.services.alerts import update_settings
from app.services.errors import ApplicationError
from tests.test_api_homes_bills import mk_home, bill_url, BILL


def test_concurrent_overlapping_writes_accept_only_one(migrated):
    with Session(migrated) as db:
        home = Home(name="Concurrent", distributor="EDESUR")
        db.add(home); db.commit(); home_id = home.id
    barrier = Barrier(2)

    def write(start, end):
        payload = BillCreate(period_start=start, period_end=end, kwh="100", amount_dop="100", days=30)
        with Session(migrated, expire_on_commit=False) as db:
            barrier.wait(timeout=5)
            try:
                create_bill(db, home_id, payload)
                return "created"
            except ApplicationError:
                return "conflict"
    with ThreadPoolExecutor(2) as executor:
        a = executor.submit(write, "2026-08-01", "2026-08-31")
        b = executor.submit(write, "2026-08-15", "2026-09-14")
        assert sorted([a.result(timeout=10), b.result(timeout=10)]) == ["conflict", "created"]
    with Session(migrated) as db:
        assert len(list(db.scalars(select(Bill)))) == 1
        assert len(list(db.scalars(select(AuditEvent).where(AuditEvent.entity == "bills")))) == 1


def test_database_constraint_rejects_bypassing_service(session):
    home = Home(name="Direct SQL", distributor="EDESUR")
    session.add(home); session.flush()
    session.add(Bill(home_id=home.id, period_start=date(2026, 8, 1), period_end=date(2026, 8, 31),
                     kwh=100, amount_dop=100, days=31))
    session.flush()
    session.add(Bill(home_id=home.id, period_start=date(2026, 8, 15), period_end=date(2026, 9, 14),
                     kwh=100, amount_dop=100, days=31))
    with pytest.raises(IntegrityError) as error:
        session.flush()
    assert error.value.orig.sqlstate == "23P01"


def test_concurrent_bill_and_threshold_update_keep_alerts_consistent(migrated):
    with Session(migrated, expire_on_commit=False) as db:
        home = Home(name="Threshold race", distributor="EDESUR")
        db.add(home); db.commit(); home_id = home.id
        create_bill(db, home_id, BillCreate(period_start="2026-06-01", period_end="2026-06-30", kwh="100", amount_dop="100", days=30))
    barrier = Barrier(2)

    def write_bill():
        with Session(migrated, expire_on_commit=False) as db:
            barrier.wait(timeout=5)
            create_bill(db, home_id, BillCreate(period_start="2026-07-01", period_end="2026-07-31", kwh="130", amount_dop="100", days=31))

    def write_threshold():
        with Session(migrated, expire_on_commit=False) as db:
            barrier.wait(timeout=5)
            update_settings(db, home_id, AlertSettingsIn(warning_pct="10", critical_pct="25"))
    with ThreadPoolExecutor(2) as executor:
        jobs = [executor.submit(write_bill), executor.submit(write_threshold)]
        for job in jobs: job.result(timeout=10)
    from app.models import Alert
    with Session(migrated) as db:
        alert = db.scalar(select(Alert).where(Alert.home_id == home_id))
        assert alert.severity == "critical"
        assert alert.threshold_pct == Decimal("25")


def test_bill_audit_survives_delete_and_failed_write_leaves_no_event(client, migrated):
    home = mk_home(client)
    bill = client.post(bill_url(home["id"]), json=BILL).json()
    assert client.post(bill_url(home["id"]), json=BILL).status_code == 409
    assert client.delete(bill_url(home["id"], bill["id"])).status_code == 204
    with Session(migrated) as db:
        events = list(db.scalars(select(AuditEvent).where(AuditEvent.entity_id == uuid.UUID(bill["id"]))
                                .order_by(AuditEvent.created_at)))
        assert [e.operation for e in events] == ["create", "delete"]
        assert events[-1].before["kwh"] == "250.50"
        assert events[-1].after is None


def test_pagination_is_stable_and_rejects_unbounded_requests(client):
    for i in range(3): mk_home(client, code=f"PAGE-{i}")
    first = client.get("/api/v1/homes?limit=2&offset=0").json()
    second = client.get("/api/v1/homes?limit=2&offset=2").json()
    assert len(first) == 2 and len(second) == 1
    assert len({h["id"] for h in first + second}) == 3
    assert client.get("/api/v1/homes?limit=501").status_code == 422
    assert client.get("/api/v1/homes?offset=-1").status_code == 422


def test_liveness_does_not_query_database():
    from fastapi.testclient import TestClient
    from app.main import app
    with TestClient(app) as c:
        assert c.get("/health/live").json() == {"status": "alive"}


def test_dashboard_bounds_projection_but_counts_all_history(session):
    from calendar import monthrange
    from app.services.dashboard import build_dashboard

    home = Home(name="Long history", distributor="EDESUR")
    session.add(home); session.flush()
    for month in range(1, 9):
        session.add(Bill(home_id=home.id, period_start=date(2026, month, 1),
                         period_end=date(2026, month, monthrange(2026, month)[1]),
                         days=30, kwh=month * 100, amount_dop=month * 1000,
                         source="seed" if month == 1 else "manual"))
    session.flush()
    dashboard = build_dashboard(session, home)
    assert dashboard.data_status.bills_count == 8
    assert dashboard.data_status.data_source == "mixed"
    assert dashboard.data_status.is_demo is True
    assert dashboard.latest_bill.period_end == date(2026, 8, 31)
    assert dashboard.comparison.previous_period_end == date(2026, 7, 31)
    assert dashboard.projection.bills_used == 6
