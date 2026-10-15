"""ERD-DB-02: lecturas acumuladas del medidor."""
import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from tests.test_api_homes_bills import mk_home

READING = {"read_at": "2026-09-15T08:00:00-04:00", "reading_kwh": "1500"}


def r_url(home_id, *rest):
    return "/".join([f"/api/v1/homes/{home_id}/readings", *rest])


def add_reading(client, home_id, read_at, kwh, **kw):
    r = client.post(r_url(home_id), json={"read_at": read_at, "reading_kwh": str(kwh), **kw})
    assert r.status_code == 201, r.text
    return r.json()


def test_readings_crud(client):
    h = mk_home(client)["id"]
    r = client.post(r_url(h), json={**READING, "note": "medidor patio"})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["home_id"] == h and body["source"] == "manual" and body["note"] == "medidor patio"
    assert body["reading_kwh"] in ("1500.00", "1500")
    assert body["read_at"].startswith("2026-09-15T12:00:00")  # normalizado a UTC
    assert [x["id"] for x in client.get(r_url(h)).json()] == [body["id"]]
    assert client.delete(r_url(h, body["id"])).status_code == 204
    assert client.get(r_url(h)).json() == []
    assert client.delete(r_url(h, body["id"])).status_code == 404


def test_readings_list_is_newest_first_and_paginated(client):
    h = mk_home(client)["id"]
    for day, kwh in [(1, 100), (2, 110), (3, 125)]:
        add_reading(client, h, f"2026-09-0{day}T00:00:00-04:00", kwh)
    page = client.get(r_url(h), params={"limit": 2}).json()
    assert [x["reading_kwh"] for x in page] in (["125.00", "110.00"], ["125", "110"])
    assert len(client.get(r_url(h), params={"limit": 2, "offset": 2}).json()) == 1
    assert client.get(r_url(h), params={"limit": 501}).status_code == 422
    assert client.get(r_url(h), params={"offset": -1}).status_code == 422


@pytest.mark.parametrize("patch", [
    {"reading_kwh": "-1"}, {"reading_kwh": "abc"}, {"reading_kwh": "99999999999999"},
    {"read_at": "2026-09-15T08:00:00"},            # sin zona horaria
    {"read_at": "2999-01-01T00:00:00Z"},           # lectura futura
    {"source": "seed"}, {"note": "x" * 256},
])
def test_invalid_reading_is_422(client, patch):
    h = mk_home(client)["id"]
    assert client.post(r_url(h), json={**READING, **patch}).status_code == 422


def test_readings_must_be_monotonic_non_decreasing(client):
    h = mk_home(client)["id"]
    add_reading(client, h, "2026-09-01T00:00:00-04:00", 100)
    add_reading(client, h, "2026-09-10T00:00:00-04:00", 200)
    # menor que la anterior
    r = client.post(r_url(h), json={"read_at": "2026-09-12T00:00:00-04:00", "reading_kwh": "150"})
    assert r.status_code == 422 and r.json()["code"] == "invalid_input"
    # insertada en medio pero mayor que la siguiente
    assert client.post(r_url(h), json={"read_at": "2026-09-05T00:00:00-04:00", "reading_kwh": "250"}).status_code == 422
    # anterior a todas pero mayor que la primera
    assert client.post(r_url(h), json={"read_at": "2026-08-01T00:00:00-04:00", "reading_kwh": "101"}).status_code == 422
    # válidas: en medio, iguales a vecinos
    add_reading(client, h, "2026-09-05T00:00:00-04:00", 100)
    add_reading(client, h, "2026-09-11T00:00:00-04:00", 200)
    assert len(client.get(r_url(h)).json()) == 4


def test_duplicate_read_at_is_409(client):
    h = mk_home(client)["id"]
    add_reading(client, h, "2026-09-01T00:00:00-04:00", 100)
    # mismo instante expresado en UTC
    assert client.post(r_url(h), json={"read_at": "2026-09-01T04:00:00Z", "reading_kwh": "100"}).status_code == 409


def test_monotonicity_is_per_home(client):
    h1, h2 = mk_home(client)["id"], mk_home(client)["id"]
    add_reading(client, h1, "2026-09-01T00:00:00-04:00", 5000)
    add_reading(client, h2, "2026-09-02T00:00:00-04:00", 10)


def test_reading_cannot_be_deleted_via_other_home_and_missing_home_404(client):
    h1, h2 = mk_home(client)["id"], mk_home(client)["id"]
    rid = add_reading(client, h1, "2026-09-01T00:00:00-04:00", 100)["id"]
    assert client.delete(r_url(h2, rid)).status_code == 404
    assert client.get(r_url(h2)).json() == []
    assert len(client.get(r_url(h1)).json()) == 1
    assert client.post(r_url(uuid.uuid4()), json=READING).status_code == 404
    assert client.get(r_url(uuid.uuid4())).status_code == 404


def test_reading_mutations_are_audited(client, migrated):
    from app.models.audit import AuditEvent
    h = mk_home(client)["id"]
    rid = add_reading(client, h, "2026-09-01T00:00:00-04:00", 100)["id"]
    assert client.delete(r_url(h, rid)).status_code == 204
    with Session(migrated) as db:
        events = list(db.scalars(select(AuditEvent).where(AuditEvent.entity_id == uuid.UUID(rid))
                                 .order_by(AuditEvent.created_at)))
    assert [(e.entity, e.operation) for e in events] == [("meter_readings", "create"), ("meter_readings", "delete")]
    assert events[-1].before["reading_kwh"] == "100.00" and events[-1].after is None


def test_delete_home_cascades_readings(client, migrated):
    from sqlalchemy import text
    h = mk_home(client)["id"]
    add_reading(client, h, "2026-09-01T00:00:00-04:00", 100)
    assert client.delete(f"/api/v1/homes/{h}").status_code == 204
    with migrated.connect() as c:
        assert c.execute(text("SELECT count(*) FROM meter_readings")).scalar() == 0
