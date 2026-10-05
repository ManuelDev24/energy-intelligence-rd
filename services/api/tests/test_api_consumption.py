"""ERD-CONS-01: consumo por día/semana/mes desde deltas de lecturas."""
import uuid

import pytest

from tests.test_api_homes_bills import mk_home
from tests.test_api_readings import add_reading


def consumption(client, home_id, **params):
    return client.get(f"/api/v1/homes/{home_id}/consumption", params=params)


def ok(client, home_id, **params):
    r = consumption(client, home_id, **params)
    assert r.status_code == 200, r.text
    return r.json()


def f(value):
    return None if value is None else float(value)


def test_daily_readings_at_local_midnight_give_real_buckets(client):
    h = mk_home(client)["id"]
    for day, kwh in [(1, 100), (2, 110), (3, 125), (4, 125)]:
        add_reading(client, h, f"2026-09-0{day}T00:00:00-04:00", kwh)
    body = ok(client, h, granularity="day", **{"from": "2026-09-01", "to": "2026-09-04"})
    assert body["timezone"] == "America/Santo_Domingo" and body["granularity"] == "day"
    b = body["buckets"]
    assert [(x["start"], x["end"]) for x in b] == [("2026-09-01", "2026-09-01"), ("2026-09-02", "2026-09-02"),
                                                   ("2026-09-03", "2026-09-03"), ("2026-09-04", "2026-09-04")]
    assert [f(x["kwh"]) for x in b] == [10, 15, 0, None]       # 0 es real (cubierto); None = sin dato
    assert [x["quality"] for x in b] == ["REAL", "REAL", "REAL", None]
    assert [f(x["coverage_ratio"]) for x in b] == [1, 1, 1, 0]
    assert b[3]["reason_code"] == "no_coverage" and b[3]["reason"]
    assert f(body["totals"]["kwh"]["value"]) == 25 and body["totals"]["kwh"]["quality"] == "REAL"
    assert f(body["totals"]["covered_days"]) == 3 and f(body["totals"]["coverage_ratio"]) == 0.75
    assert f(body["average_daily_kwh"]["value"]) == 8.33 and body["average_daily_kwh"]["quality"] == "ESTIMATED"
    assert body["peak_bucket"]["start"] == "2026-09-02" and f(body["peak_bucket"]["kwh"]) == 15
    assert body["readings_used"] == 4 and body["hourly_data_available"] is False


def test_interval_crossing_buckets_is_estimated_and_uses_readings_outside_range(client):
    h = mk_home(client)["id"]
    add_reading(client, h, "2026-08-31T12:00:00-04:00", 0)
    add_reading(client, h, "2026-09-02T12:00:00-04:00", 48)   # 48 h -> 1 kWh/h
    body = ok(client, h, granularity="day", **{"from": "2026-09-01", "to": "2026-09-02"})
    assert [f(x["kwh"]) for x in body["buckets"]] == [24, 12]
    assert [x["quality"] for x in body["buckets"]] == ["ESTIMATED", "ESTIMATED"]
    assert [f(x["coverage_ratio"]) for x in body["buckets"]] == [1, 0.5]
    assert body["totals"]["kwh"]["quality"] == "ESTIMATED" and f(body["totals"]["kwh"]["value"]) == 36
    assert body["readings_used"] == 2


def test_month_granularity_splits_interval_across_months(client):
    h = mk_home(client)["id"]
    add_reading(client, h, "2026-08-01T00:00:00-04:00", 1000)
    add_reading(client, h, "2026-10-01T00:00:00-04:00", 1610)  # 61 días, 10 kWh/día
    body = ok(client, h, granularity="month", **{"from": "2026-08-01", "to": "2026-09-30"})
    assert [(x["start"], x["end"], f(x["kwh"]), x["quality"]) for x in body["buckets"]] == [
        ("2026-08-01", "2026-08-31", 310, "ESTIMATED"), ("2026-09-01", "2026-09-30", 300, "ESTIMATED")]
    assert f(body["average_daily_kwh"]["value"]) == 10


def test_week_granularity_uses_iso_weeks(client):
    h = mk_home(client)["id"]
    body = ok(client, h, granularity="week", **{"from": "2026-09-02", "to": "2026-09-15"})
    assert [(x["start"], x["end"]) for x in body["buckets"]] == [
        ("2026-09-02", "2026-09-06"), ("2026-09-07", "2026-09-13"), ("2026-09-14", "2026-09-15")]


def test_no_readings_returns_reasons_never_zero(client):
    h = mk_home(client)["id"]
    add_reading(client, h, "2026-09-01T00:00:00-04:00", 100)   # una sola lectura: no hay intervalo
    body = ok(client, h, granularity="day", **{"from": "2026-09-01", "to": "2026-09-03"})
    assert all(x["kwh"] is None and x["quality"] is None for x in body["buckets"])
    assert body["totals"]["kwh"] is None and body["average_daily_kwh"] is None and body["peak_bucket"] is None
    assert body["insufficient_reasons"]


@pytest.mark.parametrize("params", [
    {"granularity": "hour", "from": "2026-09-01", "to": "2026-09-02"},
    {"granularity": "day", "from": "2026-09-02", "to": "2026-09-01"},
    {"granularity": "day", "from": "2025-01-01", "to": "2026-01-02"},      # 367 días
    {"granularity": "day", "from": "2026-02-30", "to": "2026-03-01"},
    {"granularity": "day", "to": "2026-03-01"},
    {"from": "2026-03-01", "to": "2026-03-02"},
])
def test_invalid_consumption_query_is_422(client, params):
    h = mk_home(client)["id"]
    assert consumption(client, h, **params).status_code == 422


def test_max_range_of_366_days_is_accepted(client):
    h = mk_home(client)["id"]
    body = ok(client, h, granularity="day", **{"from": "2024-01-01", "to": "2024-12-31"})  # año bisiesto
    assert len(body["buckets"]) == 366


def test_consumption_for_missing_home_is_404(client):
    assert consumption(client, uuid.uuid4(), granularity="day", **{"from": "2026-09-01", "to": "2026-09-02"}).status_code == 404


def test_consumption_does_not_mix_homes(client):
    h1, h2 = mk_home(client)["id"], mk_home(client)["id"]
    add_reading(client, h1, "2026-09-01T00:00:00-04:00", 100)
    add_reading(client, h1, "2026-09-02T00:00:00-04:00", 150)
    body = ok(client, h2, granularity="day", **{"from": "2026-09-01", "to": "2026-09-01"})
    assert body["buckets"][0]["kwh"] is None and body["readings_used"] == 0
