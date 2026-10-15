"""ERD-ANOM-01-COMPLETE: anomalías persistidas — escaneo en línea y por trabajo, estados, deduplicación y aislamiento.

Todas las fechas son relativas a HOY (hora de RD): el motor solo evalúa un horizonte móvil, así que fechas fijas caducarían."""
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings
from app.services import anomaly_scan, jobs
from app.services import consumption_calc as cc
from app.services.jobs import queue, runner
from tests.test_api_homes_bills import mk_home
from tests.test_api_readings import add_reading, r_url
from tests.test_auth import auth_client, bearer, register  # noqa: F401

TZ = cc.SANTO_DOMINGO
TODAY = datetime.now(timezone.utc).astimezone(TZ).date()


def iso(day: date, hour: int = 0) -> str:
    return datetime(day.year, day.month, day.day, hour, tzinfo=TZ).isoformat()


def url(home, *rest):
    return "/".join([f"/api/v1/homes/{home}/anomalies", *rest])


def daily_readings(client, home, kwh_per_day, start_ago=12):
    """Una lectura a medianoche por día; `kwh_per_day[i]` es lo consumido durante el día i (desde hace `start_ago` días)."""
    total, ids = 0, []
    first = TODAY - timedelta(days=start_ago)
    ids.append(add_reading(client, home, iso(first), total)["id"])
    for n, kwh in enumerate(kwh_per_day):
        total += kwh
        ids.append(add_reading(client, home, iso(first + timedelta(days=n + 1)), total)["id"])
    return first, ids


def get(client, home, **params):
    r = client.get(url(home), params=params)
    assert r.status_code == 200, r.text
    return r.json()


# ---------- escaneo en línea ----------
def test_a_reading_write_persists_a_peak_with_all_the_fields(client):
    home = mk_home(client)["id"]
    first, _ = daily_readings(client, home, [10, 10, 10, 10, 10, 10, 25, 10, 10])
    spike_day = first + timedelta(days=6)
    (a,) = get(client, home)
    assert (a["kind"], a["source"], a["granularity"], a["severity"], a["status"]) == ("peak", "readings", "day", "warning", "open")
    assert a["period_start"] == a["period_end"] == spike_day.isoformat()
    assert (a["observed_kwh"], a["baseline_kwh"], a["delta_pct"], a["days"]) == ("25.00", "10.00", "150.00", "1.00")
    assert a["confidence"] in ("low", "medium", "high") and a["bill_id"] is None and "equipo específico" in a["explanation"]
    assert set(a) == {"id", "home_id", "bill_id", "kind", "source", "granularity", "severity", "confidence", "status", "observed_kwh",
                      "baseline_kwh", "delta_pct", "days", "period_start", "period_end", "explanation", "detected_at", "last_seen_at"}


def test_rescanning_never_duplicates_and_updates_last_seen(client, migrated):
    home = mk_home(client)["id"]
    daily_readings(client, home, [10] * 6 + [30, 10, 10])
    before = get(client, home)
    with Session(migrated, expire_on_commit=False) as db:
        later = datetime.now(timezone.utc) + timedelta(minutes=5)
        result = anomaly_scan.scan_home(db, uuid.UUID(home), now=later)
        again = anomaly_scan.scan_home(db, uuid.UUID(home), now=later + timedelta(minutes=5))
    assert result.as_dict() == {"created": 0, "updated": 0, "reopened": 0, "resolved": 0} == again.as_dict()
    after = get(client, home)
    assert [a["id"] for a in after] == [a["id"] for a in before] and after[0]["last_seen_at"] > before[0]["last_seen_at"]
    assert after[0]["detected_at"] == before[0]["detected_at"]


def test_normal_consumption_creates_nothing(client):
    home = mk_home(client)["id"]
    daily_readings(client, home, [10, 11, 9, 10, 12, 10, 11, 10])
    assert get(client, home) == []


def test_an_ongoing_partial_day_is_not_judged(client):
    home = mk_home(client)["id"]
    first, _ = daily_readings(client, home, [10] * 8)
    add_reading(client, home, datetime.now(timezone.utc).isoformat(), 80 + 50)   # hoy, a medio día, +50 kWh de golpe
    assert [a for a in get(client, home) if a["period_start"] == TODAY.isoformat()] == []


# ---------- estados ----------
def test_acknowledge_dismiss_reopen_and_dismissed_never_returns(client, migrated):
    home = mk_home(client)["id"]
    daily_readings(client, home, [10] * 6 + [30, 10, 10])
    (a,) = get(client, home)
    patch = lambda status: client.patch(url(home, a["id"]), json={"status": status})  # noqa: E731
    r = patch("acknowledged")
    assert r.status_code == 200 and r.json()["status"] == "acknowledged"
    assert [x["id"] for x in get(client, home)] == [a["id"]]                       # revisada sigue visible
    assert patch("dismissed").json()["status"] == "dismissed"
    assert get(client, home) == []                                                  # descartada sale del listado
    with Session(migrated, expire_on_commit=False) as db:
        assert anomaly_scan.scan_home(db, uuid.UUID(home)).as_dict() == {"created": 0, "updated": 0, "reopened": 0, "resolved": 0}
    assert get(client, home) == [] and [x["id"] for x in get(client, home, status="dismissed")] == [a["id"]]
    assert patch("open").json()["status"] == "open" and len(get(client, home)) == 1


def test_status_validation_and_unknown_ids(client):
    home = mk_home(client)["id"]
    assert client.patch(url(home, str(uuid.uuid4())), json={"status": "dismissed"}).status_code == 404
    daily_readings(client, home, [10] * 6 + [30, 10, 10])
    (a,) = get(client, home)
    for body in ({"status": "resolved"}, {"status": "x"}, {}, {"status": "open", "severity": "info"}):
        assert client.patch(url(home, a["id"]), json=body).status_code == 422, body
    assert client.patch(url(home, "no-es-uuid"), json={"status": "open"}).status_code == 422


def test_an_anomaly_that_stops_being_detected_is_resolved_and_reopens_if_it_returns(client):
    home = mk_home(client)["id"]
    first, ids = daily_readings(client, home, [10] * 6 + [30])     # el pico es el último intervalo
    (a,) = get(client, home)
    closing = ids[-1]     # la lectura que cierra el día pico: sin ella ese intervalo deja de existir
    assert client.delete(r_url(home, closing)).status_code == 204
    assert get(client, home) == []
    resolved = get(client, home, status="resolved")
    assert [x["id"] for x in resolved] == [a["id"]] and resolved[0]["status"] == "resolved"
    assert client.patch(url(home, a["id"]), json={"status": "dismissed"}).status_code == 409   # ya no se detecta
    add_reading(client, home, iso(first + timedelta(days=7)), 10 * 6 + 30)
    (back,) = get(client, home)
    assert back["id"] == a["id"] and back["status"] == "open"


def test_listing_filters_and_limits(client):
    home = mk_home(client)["id"]
    daily_readings(client, home, [10] * 6 + [30, 10, 10])
    assert len(get(client, home, kind="peak")) == 1 and get(client, home, kind="night") == []
    assert len(get(client, home, granularity="day")) == 1 and get(client, home, granularity="month") == []
    assert len(get(client, home, status="all")) == 1 and get(client, home, status="resolved") == []
    assert len(get(client, home, limit=1)) == 1
    for bad in ({"status": "x"}, {"kind": "x"}, {"granularity": "week"}, {"limit": 0}, {"limit": 101}):
        assert client.get(url(home), params=bad).status_code == 422, bad


# ---------- facturas ----------
def add_bill(client, home, months_ago, kwh, days=30):
    end = TODAY - timedelta(days=30 * months_ago)
    start = end - timedelta(days=days - 1)
    r = client.post(f"/api/v1/homes/{home}/bills", json={"period_start": start.isoformat(), "period_end": end.isoformat(), "days": days,
                                                         "kwh": str(kwh), "amount_dop": str(kwh * 12)})
    assert r.status_code == 201, r.text
    return r.json()


def test_a_bill_far_above_the_previous_ones_is_flagged_by_billing_rate(client):
    home = mk_home(client)["id"]
    for months_ago in (5, 4, 3, 2):
        add_bill(client, home, months_ago, 300)
    assert get(client, home) == []
    bill = add_bill(client, home, 1, 650)
    (a,) = get(client, home)
    assert (a["kind"], a["source"], a["granularity"], a["severity"], a["bill_id"]) == ("increase", "bills", "billing", "critical", bill["id"])
    assert (a["observed_kwh"], a["baseline_kwh"], a["delta_pct"]) == ("650.00", "300.00", "116.67")
    assert "la factura del" in a["explanation"] and a["status"] == "open"


def test_correcting_the_bill_resolves_and_deleting_it_removes_the_anomaly(client, migrated):
    home = mk_home(client)["id"]
    for months_ago in (5, 4, 3, 2):
        add_bill(client, home, months_ago, 300)
    bill = add_bill(client, home, 1, 650)
    (a,) = get(client, home)
    fixed = {k: bill[k] for k in ("period_start", "period_end", "days", "amount_dop")} | {"kwh": "310"}
    assert client.put(f"/api/v1/homes/{home}/bills/{bill['id']}", json=fixed).status_code == 200
    assert get(client, home) == [] and [x["id"] for x in get(client, home, status="resolved")] == [a["id"]]
    again = {**fixed, "kwh": "700"}
    assert client.put(f"/api/v1/homes/{home}/bills/{bill['id']}", json=again).status_code == 200
    assert [x["id"] for x in get(client, home)] == [a["id"]]
    assert client.delete(f"/api/v1/homes/{home}/bills/{bill['id']}").status_code == 204
    with migrated.connect() as c:
        assert c.execute(text("SELECT count(*) FROM anomalies WHERE home_id=:h"), {"h": home}).scalar() == 0


def test_the_same_event_from_bills_and_readings_is_reported_once(client):
    home = mk_home(client)["id"]
    first = TODAY - timedelta(days=150)
    total = 0
    add_reading(client, home, iso(first), 0)
    for step in range(5):                        # cinco períodos de 30 días por lecturas: 300, 300, 300, 300, 700
        total += 300 if step < 4 else 700
        add_reading(client, home, iso(first + timedelta(days=30 * (step + 1))), total)
    for months_ago in (5, 4, 3, 2):
        add_bill(client, home, months_ago, 300)
    add_bill(client, home, 1, 700)
    increases = [a for a in get(client, home) if a["kind"] == "increase"]
    bills_side = [a for a in increases if a["source"] == "bills"]
    assert len(bills_side) == 1
    for reading_side in (a for a in increases if a["source"] == "readings"):   # lo que quede por lecturas no se solapa con la factura
        assert reading_side["period_end"] < bills_side[0]["period_start"] or reading_side["period_start"] > bills_side[0]["period_end"]


# ---------- noche ----------
def test_a_heavy_night_is_found_from_readings_taken_inside_the_night(client):
    home = mk_home(client)["id"]
    start = TODAY - timedelta(days=16)
    total = 0
    add_reading(client, home, iso(start, 5), total)
    for n in range(14):
        total += 9
        add_reading(client, home, iso(start + timedelta(days=n), 23), total)
        total = round(total + (2.4 if n == 9 else 0.6), 2)
        add_reading(client, home, iso(start + timedelta(days=n + 1), 5), total)
    found = get(client, home, kind="night")
    assert [a["period_start"] for a in found] == [(start + timedelta(days=9)).isoformat()]
    assert found[0]["delta_pct"] is None and found[0]["observed_kwh"] == "2.40"


# ---------- el escaneo nunca rompe la escritura ----------
def test_a_failing_scan_does_not_lose_the_users_reading(client, monkeypatch):
    home = mk_home(client)["id"]

    def boom(*a, **k):
        raise RuntimeError("motor roto")
    monkeypatch.setattr(anomaly_scan, "scan_home", boom)
    r = client.post(r_url(home), json={"read_at": iso(TODAY - timedelta(days=3)), "reading_kwh": "10"})
    assert r.status_code == 201 and len(client.get(r_url(home)).json()) == 1


def test_a_database_error_inside_the_scan_rolls_back_only_the_scan(client, monkeypatch):
    home = mk_home(client)["id"]
    real = anomaly_scan.scan_home

    def poison(db, home_id, **k):
        real(db, home_id, **k)
        db.execute(text("SELECT * FROM tabla_que_no_existe"))
    monkeypatch.setattr(anomaly_scan, "scan_home", poison)
    r = client.post(f"/api/v1/homes/{home}/bills", json={"period_start": "2026-01-01", "period_end": "2026-01-30", "days": 30,
                                                          "kwh": "100", "amount_dop": "1000"})
    assert r.status_code == 201
    assert len(client.get(f"/api/v1/homes/{home}/bills").json()) == 1


# ---------- trabajos ----------
def run_jobs(engine, limit=10):
    from app.services.jobs import handlers  # noqa: F401
    outcomes = []
    with sessionmaker(bind=engine, expire_on_commit=False)() as db:
        for _ in range(limit):
            got = queue.claim(db, "w", lease_of=runner.lease_of, limit=1)
            if not got:
                break
            outcomes.append(runner.execute(db, got[0], "w"))
    return outcomes


def test_requesting_a_scan_queues_one_job_per_minute_and_the_worker_runs_it(client, migrated):
    home = mk_home(client)["id"]
    r = client.post(url(home, "scan"))
    assert r.status_code == 202 and r.json() == {"status": "queued"} and r.headers["cache-control"] == "no-store"
    client.post(url(home, "scan"))
    with migrated.connect() as c:
        assert c.execute(text("SELECT count(*) FROM jobs WHERE kind='anomalies.scan_home'")).scalar() == 1
    assert run_jobs(migrated) == ["succeeded"]
    assert client.post(url(str(uuid.uuid4()), "scan")).status_code == 404


def test_the_scan_job_ignores_a_home_that_no_longer_exists(client, migrated):
    home = mk_home(client)["id"]
    client.post(url(home, "scan"))
    assert client.delete(f"/api/v1/homes/{home}").status_code == 204
    assert run_jobs(migrated) == ["succeeded"]


def test_the_daily_job_scans_only_homes_with_recent_data_and_never_twice_a_day(client, migrated):
    with_data, empty = mk_home(client)["id"], mk_home(client, name="Vacía")["id"]
    add_reading(client, with_data, iso(TODAY - timedelta(days=2)), 5)
    with Session(migrated, expire_on_commit=False) as db:
        queue.enqueue(db, "anomalies.scan_all", now=datetime.now(timezone.utc))
        assert anomaly_scan.homes_with_recent_data(db, TODAY) == [uuid.UUID(with_data)]
    assert run_jobs(migrated)[0] == "succeeded"
    with migrated.connect() as c:
        keys = [r[0] for r in c.execute(text("SELECT idempotency_key FROM jobs WHERE kind='anomalies.scan_home'"))]
    assert keys == [f"{with_data}:{TODAY.isoformat()}"] and empty not in keys[0]
    with Session(migrated, expire_on_commit=False) as db:     # un segundo pase del programador el mismo día no duplica
        queue.enqueue(db, "anomalies.scan_all", idempotency_key="again")
    run_jobs(migrated)
    with migrated.connect() as c:
        assert c.execute(text("SELECT count(*) FROM jobs WHERE kind='anomalies.scan_home'")).scalar() == 1


# ---------- aislamiento y datos ----------
def test_anomalies_are_isolated_between_homes_and_cascade_with_the_home(client, migrated):
    one, two = mk_home(client)["id"], mk_home(client, name="Otra")["id"]
    daily_readings(client, one, [10] * 6 + [30, 10, 10])
    (a,) = get(client, one)
    assert get(client, two) == []
    assert client.patch(url(two, a["id"]), json={"status": "dismissed"}).status_code == 404
    assert client.delete(f"/api/v1/homes/{one}").status_code == 204
    with migrated.connect() as c:
        assert c.execute(text("SELECT count(*) FROM anomalies")).scalar() == 0


def test_strangers_cannot_read_or_change_anomalies(auth_client):
    alice, bob = register(auth_client), register(auth_client, "bob@example.com")
    home = auth_client.post("/api/v1/homes", headers=bearer(alice), json={"name": "Casa", "distributor": "EDESUR"}).json()["id"]
    for method, path, body in (("GET", url(home), None), ("POST", url(home, "scan"), None),
                               ("PATCH", url(home, str(uuid.uuid4())), {"status": "open"})):
        assert auth_client.request(method, path, headers=bearer(bob), json=body).status_code == 404, (method, path)
        assert auth_client.request(method, path).status_code == 401, (method, path)


def test_the_database_rejects_inconsistent_rows(client, migrated):
    home = mk_home(client)["id"]
    base = ("INSERT INTO anomalies(id,home_id,kind,source,granularity,severity,confidence,period_start,period_end,observed_kwh,baseline_kwh,days,"
            "explanation,dedupe_key) VALUES(gen_random_uuid(),:h,'peak','readings','day','warning','low','2026-09-01','2026-09-01',1,1,1,'x','k{n}')")
    with migrated.begin() as c:
        c.execute(text(base.format(n=0)), {"h": home})                      # la fila válida entra
    bad = [base.format(n=1).replace("'warning'", "'high'"), base.format(n=2).replace("'low'", "'certain'"),
           base.format(n=3).replace("'2026-09-01','2026-09-01'", "'2026-09-02','2026-09-01'"), base.format(n=4).replace("'peak'", "'spike'"),
           base.format(n=5).replace("'readings','day'", "'bills','billing'"), base.format(n=6).replace(",1,1,1,", ",1,1,0,"),
           base.format(n=0)]                                                  # clave repetida
    for statement in bad:
        with pytest.raises((IntegrityError, DBAPIError)):
            with migrated.begin() as c:
                c.execute(text(statement), {"h": home})


def test_migration_roundtrip(migrated, alembic_cfg):
    from alembic import command
    command.downgrade(alembic_cfg, "0018")
    with migrated.connect() as c:
        assert c.execute(text("SELECT to_regclass('public.anomalies')")).scalar() is None
    command.upgrade(alembic_cfg, "head")
    with migrated.connect() as c:
        assert c.execute(text("SELECT to_regclass('public.anomalies')")).scalar() is not None
