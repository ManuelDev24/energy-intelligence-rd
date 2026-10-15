"""ERD-INT-01: registro manual de interrupciones del servicio eléctrico, historial y resumen mensual."""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError, IntegrityError

from app.services import consumption_calc as cc
from app.services import outages as service
from tests.test_api_homes_bills import mk_home
from tests.test_auth import auth_client, bearer, register  # noqa: F401

TZ = cc.SANTO_DOMINGO
NOW = datetime(2026, 10, 11, 18, 0, tzinfo=TZ)          # 11 oct 2026, 18:00 hora de RD


def url(home, *rest):
    return "/".join([f"/api/v1/homes/{home}/outages", *rest])


def ago(**delta):
    return (datetime.now(timezone.utc) - timedelta(**delta)).isoformat()


def body(start_ago=timedelta(hours=5), length=timedelta(hours=2), **over):
    started = datetime.now(timezone.utc) - start_ago
    return {"started_at": started.isoformat(), "ended_at": (started + length).isoformat(), "cause": "utility_fault", "note": "Se fue la luz", **over}


def make(client, home, **over):
    r = client.post(url(home), json=body(**over))
    assert r.status_code == 201, r.text
    return r.json()


def at(day, hour, minute=0, month=10):
    return datetime(2026, month, day, hour, minute, tzinfo=TZ)


# ---------- CRUD ----------
def test_creating_an_outage_returns_its_duration_and_lists_newest_first(client):
    home = mk_home(client)["id"]
    first = make(client, home, start_ago=timedelta(days=3), length=timedelta(minutes=95))
    second = make(client, home, start_ago=timedelta(hours=6), length=timedelta(hours=2, minutes=30), cause="weather", note="  Tormenta  ")
    assert first["duration_minutes"] == 95 and first["ongoing"] is False and first["source"] == "manual"
    assert second["duration_minutes"] == 150 and second["note"] == "Tormenta" and second["cause"] == "weather"
    assert [o["id"] for o in client.get(url(home)).json()] == [second["id"], first["id"]]
    assert client.get(url(home, second["id"])).json()["id"] == second["id"]


def test_an_open_outage_is_ongoing_without_a_duration_and_can_be_closed(client):
    home = mk_home(client)["id"]
    started = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    r = client.post(url(home), json={"started_at": started})
    assert r.status_code == 201 and r.json()["ongoing"] is True and r.json()["duration_minutes"] is None and r.json()["cause"] == "unknown"
    closed = client.put(url(home, r.json()["id"]), json={"started_at": started, "ended_at": ago(minutes=5), "cause": "scheduled"})
    assert closed.status_code == 200 and closed.json()["ongoing"] is False and 54 <= closed.json()["duration_minutes"] <= 56
    assert closed.json()["cause"] == "scheduled"


def test_update_replaces_and_delete_removes(client):
    home = mk_home(client)["id"]
    created = make(client, home)
    changed = client.put(url(home, created["id"]), json=body(start_ago=timedelta(hours=8), length=timedelta(hours=1), note="   "))
    assert changed.status_code == 200 and changed.json()["duration_minutes"] == 60 and changed.json()["note"] is None
    assert changed.json()["updated_at"] >= created["updated_at"]
    assert client.delete(url(home, created["id"])).status_code == 204
    assert client.get(url(home, created["id"])).status_code == 404
    assert client.get(url(home)).json() == []
    assert client.delete(url(home, created["id"])).status_code == 404


def test_pagination(client):
    home = mk_home(client)["id"]
    for n in range(5):
        make(client, home, start_ago=timedelta(days=10 - n * 2), length=timedelta(hours=1))
    assert len(client.get(url(home), params={"limit": 2}).json()) == 2
    assert len(client.get(url(home), params={"limit": 10, "offset": 3}).json()) == 2
    assert client.get(url(home), params={"limit": 0}).status_code == 422
    assert client.get(url(home), params={"offset": -1}).status_code == 422


# ---------- validación ----------
@pytest.mark.parametrize("patch, why", [
    ({"ended_at": None, "started_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()}, "inicio futuro"),
    ({"ended_at": (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()}, "fin futuro"),
    ({"ended_at": ago(hours=30)}, "fin antes del inicio"),
    ({"cause": "meteorito"}, "causa fuera del catálogo"),
    ({"note": "x" * 256}, "nota larga"),
    ({"source": "api"}, "campo extra"),
    ({"started_at": "2026-09-01T10:00:00"}, "sin zona horaria"),
    ({"started_at": "no-es-fecha"}, "fecha ilegible"),
])
def test_invalid_payloads_are_rejected_with_422(client, why, patch):
    home = mk_home(client)["id"]
    assert client.post(url(home), json={**body(), **patch}).status_code == 422, why
    assert client.get(url(home)).json() == []


def test_zero_length_and_over_thirty_days_are_rejected(client):
    home = mk_home(client)["id"]
    start = datetime.now(timezone.utc) - timedelta(days=60)
    assert client.post(url(home), json={"started_at": start.isoformat(), "ended_at": start.isoformat()}).status_code == 422
    assert client.post(url(home), json={"started_at": start.isoformat(), "ended_at": (start + timedelta(days=31)).isoformat()}).status_code == 422
    assert client.post(url(home), json={"started_at": start.isoformat(), "ended_at": (start + timedelta(days=30)).isoformat()}).status_code == 201


# ---------- solapes ----------
def test_overlapping_outages_are_refused_but_touching_ones_are_fine(client):
    home = mk_home(client)["id"]
    base = datetime.now(timezone.utc) - timedelta(days=2)
    ok = lambda s, e: client.post(url(home), json={"started_at": s.isoformat(), "ended_at": e.isoformat()})  # noqa: E731
    assert ok(base, base + timedelta(hours=2)).status_code == 201
    assert ok(base + timedelta(hours=1), base + timedelta(hours=3)).status_code == 409                    # se solapa por la cola
    assert ok(base - timedelta(hours=1), base + timedelta(minutes=1)).status_code == 409                  # por la cabeza
    assert ok(base - timedelta(hours=1), base + timedelta(hours=5)).status_code == 409                    # la envuelve
    assert ok(base + timedelta(minutes=30), base + timedelta(minutes=45)).status_code == 409              # queda dentro
    assert ok(base + timedelta(hours=2), base + timedelta(hours=3)).status_code == 201                    # empieza cuando termina la otra
    assert ok(base - timedelta(hours=1), base).status_code == 201                                          # termina cuando empieza la otra
    assert len(client.get(url(home)).json()) == 3


def test_only_one_open_outage_and_it_blocks_later_ones(client):
    home = mk_home(client)["id"]
    started = datetime.now(timezone.utc) - timedelta(hours=3)
    assert client.post(url(home), json={"started_at": started.isoformat()}).status_code == 201
    assert client.post(url(home), json={"started_at": (started + timedelta(hours=1)).isoformat()}).status_code == 409
    before = started - timedelta(hours=5)
    assert client.post(url(home), json={"started_at": before.isoformat(), "ended_at": (before + timedelta(hours=1)).isoformat()}).status_code == 201
    r = client.post(url(home), json={"started_at": (started - timedelta(minutes=30)).isoformat(), "ended_at": (started + timedelta(minutes=30)).isoformat()})
    assert r.status_code == 409 and "solapa" in r.json()["detail"]


def test_editing_an_outage_does_not_collide_with_itself_but_does_with_others(client):
    home = mk_home(client)["id"]
    a = make(client, home, start_ago=timedelta(days=2), length=timedelta(hours=2))
    b = make(client, home, start_ago=timedelta(days=1), length=timedelta(hours=2))
    same = {k: a[k] for k in ("started_at", "ended_at", "cause", "note")}
    assert client.put(url(home, a["id"]), json={**same, "note": "corregida"}).status_code == 200
    assert client.put(url(home, a["id"]), json={**same, "ended_at": b["started_at"]}).status_code == 200      # justo hasta donde empieza b
    assert client.put(url(home, a["id"]), json={**same, "ended_at": b["ended_at"]}).status_code == 409


def test_overlaps_are_per_home(client):
    one, two = mk_home(client)["id"], mk_home(client, name="Otra")["id"]
    payload = body()
    assert client.post(url(one), json=payload).status_code == 201
    assert client.post(url(two), json=payload).status_code == 201


def test_the_database_enforces_the_same_rules(client, migrated):
    home = mk_home(client)["id"]
    insert = ("INSERT INTO power_outages(id,home_id,started_at,ended_at,cause) VALUES(gen_random_uuid(),:h,{s},{e},{c})")
    row = lambda s, e, c="'unknown'": insert.format(s=s, e=e, c=c)  # noqa: E731
    with migrated.begin() as c:
        c.execute(text(row("'2026-09-01T10:00Z'", "'2026-09-01T12:00Z'")), {"h": home})
    bad = [row("'2026-09-02T10:00Z'", "'2026-09-02T10:00Z'"),                        # fin = inicio
           row("'2026-09-02T10:00Z'", "'2026-09-02T09:00Z'"),                        # fin antes del inicio
           row("'2026-09-02T10:00Z'", "'2026-10-05T10:00Z'"),                        # más de 30 días
           row("'2026-09-03T10:00Z'", "'2026-09-03T11:00Z'", "'rayo'"),              # causa fuera del catálogo
           row("'2026-09-01T11:00Z'", "'2026-09-01T13:00Z'"),                        # solape
           row("'2026-09-01T11:00Z'", "NULL")]                                       # abierta sobre otra
    for statement in bad:
        with pytest.raises((IntegrityError, DBAPIError)):
            with migrated.begin() as c:
                c.execute(text(statement), {"h": home})


# ---------- resumen mensual ----------
def seed(db, home, items):
    from app.models import PowerOutage
    for started, ended, cause in items:
        db.add(PowerOutage(home_id=home, started_at=started, ended_at=ended, cause=cause))
    db.commit()


def test_summary_aggregates_by_start_month_in_rd_time_and_fills_empty_months(client, session):
    home = uuid.UUID(mk_home(client)["id"])
    seed(session, home, [
        (at(2, 8), at(2, 10), "utility_fault"),                               # oct: 120 min
        (at(5, 20), at(5, 21, 30), "weather"),                                # oct: 90 min
        (at(30, 20, month=9), at(30, 21, 59, month=9), "scheduled"),          # sep: 119 min
        (datetime(2026, 10, 1, 3, 30, tzinfo=timezone.utc), datetime(2026, 10, 1, 4, 30, tzinfo=timezone.utc), "unknown"),   # 30 sep 23:30 RD → septiembre
    ])
    out = service.build_summary(session, home, months=3, now=NOW)
    assert (out.from_month, out.to_month, out.timezone) == ("2026-08", "2026-10", "America/Santo_Domingo")
    aug, sep, octo = out.months
    assert (aug.count, aug.total_minutes, aug.longest_minutes, aug.average_minutes) == (0, 0, 0, None)
    assert (sep.count, sep.total_minutes, sep.longest_minutes, sep.average_minutes) == (2, 179, 119, 90)
    assert (octo.count, octo.total_minutes, octo.longest_minutes, octo.average_minutes, octo.ongoing) == (2, 210, 120, 105, 0)
    assert (out.totals.count, out.totals.total_minutes, out.totals.longest_minutes, out.totals.average_minutes) == (4, 389, 120, 97)


def test_an_open_outage_counts_up_to_now_and_is_flagged(client, session):
    home = uuid.UUID(mk_home(client)["id"])
    seed(session, home, [(at(11, 15), None, "utility_fault")])
    out = service.build_summary(session, home, months=2, now=NOW)
    assert out.months[-1].count == 1 and out.months[-1].total_minutes == 180 and out.months[-1].ongoing == 1
    assert out.totals.ongoing == 1


def test_an_outage_crossing_months_belongs_entirely_to_the_month_it_started(client, session):
    home = uuid.UUID(mk_home(client)["id"])
    seed(session, home, [(at(30, 22, month=9), at(1, 2, month=10), "weather")])         # 4 h
    out = service.build_summary(session, home, months=2, now=NOW)
    sep, octo = out.months
    assert (sep.count, sep.total_minutes) == (1, 240) and (octo.count, octo.total_minutes) == (0, 0)


def test_summary_window_excludes_older_outages_and_rejects_bad_months(client, session):
    home = uuid.UUID(mk_home(client)["id"])
    seed(session, home, [(at(5, 8, month=3), at(5, 10, month=3), "unknown")])
    assert service.build_summary(session, home, months=6, now=NOW).totals.count == 0
    assert service.build_summary(session, home, months=8, now=NOW).totals.count == 1
    assert client.get(url(str(home), "summary"), params={"months": 0}).status_code == 422
    assert client.get(url(str(home), "summary"), params={"months": 25}).status_code == 422
    r = client.get(url(str(home), "summary"))
    assert r.status_code == 200 and len(r.json()["months"]) == 12 and r.headers["cache-control"] == "no-store"


def test_summary_api_matches_what_was_recorded(client):
    home = mk_home(client)["id"]
    make(client, home, start_ago=timedelta(hours=10), length=timedelta(minutes=45))
    out = client.get(url(home, "summary"), params={"months": 1}).json()
    assert out["totals"]["count"] == 1 and out["totals"]["total_minutes"] == 45 and out["months"][0]["longest_minutes"] == 45
    assert "a mano" in out["note"]


# ---------- aislamiento y autorización ----------
def test_outages_are_isolated_between_homes_and_cascade_with_the_home(client, migrated):
    one, two = mk_home(client)["id"], mk_home(client, name="Otra")["id"]
    created = make(client, one)
    assert client.get(url(two)).json() == []
    assert client.get(url(two, created["id"])).status_code == 404
    assert client.put(url(two, created["id"]), json=body()).status_code == 404
    assert client.delete(url(two, created["id"])).status_code == 404
    assert client.get(url(two, "summary")).json()["totals"]["count"] == 0
    assert client.delete(f"/api/v1/homes/{one}").status_code == 204
    with migrated.connect() as c:
        assert c.execute(text("SELECT count(*) FROM power_outages")).scalar() == 0


def test_strangers_cannot_read_or_change_outages(auth_client):
    alice, bob = register(auth_client), register(auth_client, "bob@example.com")
    home = auth_client.post("/api/v1/homes", headers=bearer(alice), json={"name": "Casa", "distributor": "EDESUR"}).json()["id"]
    created = auth_client.post(url(home), headers=bearer(alice), json=body())
    assert created.status_code == 201
    oid = created.json()["id"]
    for method, path, payload in (("GET", url(home), None), ("GET", url(home, "summary"), None), ("POST", url(home), body()),
                                  ("GET", url(home, oid), None), ("PUT", url(home, oid), body()), ("DELETE", url(home, oid), None)):
        assert auth_client.request(method, path, headers=bearer(bob), json=payload).status_code == 404, (method, path)
        assert auth_client.request(method, path, json=payload).status_code == 401, (method, path)
    assert len(auth_client.get(url(home), headers=bearer(alice)).json()) == 1


def test_audit_trail_records_create_update_delete(client, migrated):
    home = mk_home(client)["id"]
    created = make(client, home)
    client.put(url(home, created["id"]), json=body(note="otra"))
    client.delete(url(home, created["id"]))
    with migrated.connect() as c:
        ops = c.execute(text("SELECT operation FROM audit_events WHERE entity='power_outages' ORDER BY created_at")).scalars().all()
    assert ops == ["create", "update", "delete"]


def test_the_export_includes_the_users_outages(auth_client):
    tokens = register(auth_client)
    home = auth_client.post("/api/v1/homes", headers=bearer(tokens), json={"name": "Casa", "distributor": "EDESUR"}).json()["id"]
    assert auth_client.post(url(home), headers=bearer(tokens), json=body()).status_code == 201
    export = auth_client.get("/api/v1/auth/me/export", headers=bearer(tokens)).json()
    assert [o["cause"] for o in export["homes"][0]["outages"]] == ["utility_fault"] and "recommendations" in export["homes"][0]
