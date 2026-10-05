"""ERD-GOAL-01: meta mensual (RD$ y/o kWh) y progreso del mes con etiquetas de calidad.

Las lecturas usan fechas pasadas (la API rechaza lecturas futuras). Octubre 2026 usa la tarifa oficial
BTS-1 EDESUR cargada por la migración 0008; septiembre 2026 no tiene tarifa vigente.
"""
import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from tests.test_api_homes_bills import mk_home
from tests.test_api_insights import add_bill
from tests.test_api_readings import add_reading


def g_url(home_id, *rest):
    return "/".join([f"/api/v1/homes/{home_id}/goal", *rest])


def progress(client, home_id, on):
    r = client.get(g_url(home_id, "progress"), params={"on": on})
    assert r.status_code == 200, r.text
    return r.json()


def f(value):
    return None if value is None else float(value)


def september_readings(client, h):
    add_reading(client, h, "2026-09-01T00:00:00-04:00", 1000)
    add_reading(client, h, "2026-09-11T00:00:00-04:00", 1100)   # 100 kWh en 10 días, dentro de septiembre


# ---------- meta ----------
def test_goal_put_get_and_update(client):
    h = mk_home(client)["id"]
    assert client.get(g_url(h)).json() is None
    r = client.put(g_url(h), json={"monthly_kwh": "300"})
    assert r.status_code == 200, r.text
    assert f(r.json()["monthly_kwh"]) == 300 and r.json()["monthly_amount_rd"] is None and r.json()["home_id"] == h
    r = client.put(g_url(h), json={"monthly_amount_rd": "3000", "monthly_kwh": None})
    assert f(r.json()["monthly_amount_rd"]) == 3000 and r.json()["monthly_kwh"] is None
    assert f(client.get(g_url(h)).json()["monthly_amount_rd"]) == 3000


@pytest.mark.parametrize("body", [
    {}, {"monthly_kwh": None, "monthly_amount_rd": None}, {"monthly_kwh": "0"}, {"monthly_amount_rd": "-5"},
    {"monthly_kwh": "abc"}, {"monthly_kwh": "99999999999999"},
])
def test_invalid_goal_is_422(client, body):
    h = mk_home(client)["id"]
    assert client.put(g_url(h), json=body).status_code == 422


def test_goal_mutations_are_audited(client, migrated):
    from app.models.audit import AuditEvent
    h = mk_home(client)["id"]
    client.put(g_url(h), json={"monthly_kwh": "300"})
    client.put(g_url(h), json={"monthly_kwh": "250"})
    with Session(migrated) as db:
        events = list(db.scalars(select(AuditEvent).where(AuditEvent.entity == "home_goals")
                                 .order_by(AuditEvent.created_at)))
    assert [e.operation for e in events] == ["create", "update"]
    assert events[1].before["monthly_kwh"] == "300.00" and events[1].after["monthly_kwh"] == "250.00"


def test_goal_routes_for_missing_home_are_404(client):
    missing = uuid.uuid4()
    assert client.get(g_url(missing)).status_code == 404
    assert client.put(g_url(missing), json={"monthly_kwh": "1"}).status_code == 404
    assert client.get(g_url(missing, "progress")).status_code == 404


# ---------- progreso ----------
def test_progress_without_goal_is_insufficient_data(client):
    h = mk_home(client)["id"]
    body = progress(client, h, "2026-09-15")
    assert body["goal"] is None and body["status"] == "insufficient_data" and body["reasons"]
    assert (body["month_start"], body["month_end"], body["as_of"]) == ("2026-09-01", "2026-09-30", "2026-09-15")


@pytest.mark.parametrize("target,status,pct_so_far,pct_projected", [
    ("300", "on_track", 33.33, 100.0), ("250", "at_risk", 40.0, 120.0), ("90", "exceeded", 111.11, 333.33),
])
def test_kwh_progress_from_readings(client, target, status, pct_so_far, pct_projected):
    h = mk_home(client)["id"]
    september_readings(client, h)
    client.put(g_url(h), json={"monthly_kwh": target})
    body = progress(client, h, "2026-09-15")
    k = body["kwh"]
    assert body["status"] == status and k["status"] == status and body["data_source"] == "readings"
    assert (f(k["so_far"]["value"]), k["so_far"]["quality"]) == (100, "REAL")
    # Ritmo de 10 kWh/día × 30 días: proyección PROJECTED.
    assert (f(k["projected"]["value"]), k["projected"]["quality"]) == (300, "PROJECTED")
    assert k["projection_method"] == "run_rate_readings"
    assert (f(k["percent_so_far"]), f(k["percent_projected"])) == (pct_so_far, pct_projected)
    assert body["amount"] is None


def test_amount_progress_uses_official_tariff_as_estimated_with_source(client):
    h = mk_home(client)["id"]   # EDESUR
    add_reading(client, h, "2026-10-01T00:00:00-04:00", 2000)
    add_reading(client, h, "2026-10-03T00:00:00-04:00", 2020)   # 20 kWh en 2 días
    client.put(g_url(h), json={"monthly_amount_rd": "2000"})
    body = progress(client, h, "2026-10-03")
    a = body["amount"]
    # 20 kWh: 42.10 + 20×6.05 = 163.10 (ESTIMATED: el pliego no incluye impuestos ni otros cargos)
    assert (f(a["so_far"]["value"]), a["so_far"]["quality"]) == (163.10, "ESTIMATED")
    # 10 kWh/día × 31 = 310 kWh -> 128.59 + 200×6.05 + 100×8.59 + 10×12.89 = 2326.49
    assert (f(a["projected"]["value"]), a["projected"]["quality"]) == (2326.49, "PROJECTED")
    assert a["basis"] == "tariff" and a["tariff"]["source_resolution"] == "SIE-121-2026-TF"
    assert a["tariff"]["tariff_code"] == "BTS-1"
    assert a["status"] == "at_risk" and f(a["percent_projected"]) == 116.32 and body["status"] == "at_risk"


def test_amount_goal_without_tariff_or_bill_amounts_is_insufficient_data(client):
    h = mk_home(client)["id"]
    september_readings(client, h)      # septiembre 2026: no hay tarifa vigente cargada
    client.put(g_url(h), json={"monthly_amount_rd": "3000", "monthly_kwh": "400"})
    body = progress(client, h, "2026-09-15")
    a = body["amount"]
    assert a["so_far"] is None and a["projected"] is None and a["status"] == "insufficient_data"
    assert any("tarifa" in reason.lower() for reason in a["reasons"])
    assert body["kwh"]["status"] == "on_track"
    assert body["status"] == "insufficient_data"   # no se inventa RD$ desde kWh


def test_amount_goal_without_tariff_for_distributor_otra(client):
    h = mk_home(client, distributor="Otra")["id"]
    add_reading(client, h, "2026-10-01T00:00:00-04:00", 2000)
    add_reading(client, h, "2026-10-03T00:00:00-04:00", 2020)
    client.put(g_url(h), json={"monthly_amount_rd": "2000"})
    assert progress(client, h, "2026-10-03")["amount"]["status"] == "insufficient_data"


def test_amount_from_readings_uses_latest_bill_average_price_when_no_tariff(client):
    h = mk_home(client)["id"]
    september_readings(client, h)
    add_bill(client, h, "2026-08-01", "2026-08-31", "300", days=31, amount="3000")   # 10 RD$/kWh
    client.put(g_url(h), json={"monthly_amount_rd": "2500"})
    a = progress(client, h, "2026-09-15")["amount"]
    assert a["basis"] == "bill_average_price" and a["tariff"] is None
    assert (f(a["so_far"]["value"]), a["so_far"]["quality"]) == (1000, "ESTIMATED")
    assert (f(a["projected"]["value"]), a["projected"]["quality"]) == (3000, "PROJECTED")
    assert a["status"] == "at_risk"


def test_bills_only_uses_existing_linear_projection(client):
    h = mk_home(client)["id"]
    add_bill(client, h, "2026-07-01", "2026-07-31", "200", days=31, amount="2000")
    add_bill(client, h, "2026-08-01", "2026-08-31", "300", days=31, amount="3000")
    client.put(g_url(h), json={"monthly_kwh": "350", "monthly_amount_rd": "5000"})
    body = progress(client, h, "2026-09-15")
    assert body["data_source"] == "bills"
    k, a = body["kwh"], body["amount"]
    assert k["so_far"] is None and (f(k["projected"]["value"]), k["projected"]["quality"]) == (400, "PROJECTED")
    assert k["projection_method"] == "linear_least_squares" and k["status"] == "at_risk"
    assert (f(a["projected"]["value"]), a["projected"]["quality"]) == (4000, "PROJECTED")
    assert a["status"] == "on_track" and body["status"] == "at_risk"


def test_bill_overlapping_month_is_prorated_as_estimated(client):
    h = mk_home(client)["id"]
    add_bill(client, h, "2026-09-01", "2026-09-30", "300", days=30, amount="3000")
    client.put(g_url(h), json={"monthly_kwh": "1000", "monthly_amount_rd": "10000"})
    body = progress(client, h, "2026-09-15")
    k, a = body["kwh"], body["amount"]
    assert (f(k["so_far"]["value"]), k["so_far"]["quality"]) == (150, "ESTIMATED")   # 15 de 30 días
    assert (f(a["so_far"]["value"]), a["so_far"]["quality"]) == (1500, "ESTIMATED")
    assert a["basis"] == "bills_prorated"
    # Una sola factura: no hay proyección; sin exceso -> datos insuficientes
    assert k["projected"] is None and k["status"] == "insufficient_data"


def test_progress_with_goal_and_no_data_is_insufficient(client):
    h = mk_home(client)["id"]
    client.put(g_url(h), json={"monthly_kwh": "300"})
    body = progress(client, h, "2026-09-15")
    assert body["status"] == "insufficient_data" and body["data_source"] == "none"
    assert body["kwh"]["so_far"] is None and body["kwh"]["reasons"]


def test_progress_defaults_to_today_in_santo_domingo(client):
    h = mk_home(client)["id"]
    r = client.get(g_url(h, "progress"))
    assert r.status_code == 200 and r.json()["timezone"] == "America/Santo_Domingo"
