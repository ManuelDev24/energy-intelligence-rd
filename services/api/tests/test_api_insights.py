"""ERD-API-INSIGHTS: equipos declarados (ESTIMATED) y alertas por variación de factura."""
import uuid

import pytest

from tests.test_api_homes_bills import bill_url, mk_home

EQ = {"name": "Nevera", "room": "Cocina", "power_w": "150", "hours_per_day": "24"}


def eq_url(home_id, *rest):
    return "/".join([f"/api/v1/homes/{home_id}/equipment", *rest])


def add_bill(client, home_id, start, end, kwh, days=30, amount="1000"):
    r = client.post(bill_url(home_id), json={"period_start": start, "period_end": end, "days": days,
                                             "kwh": kwh, "amount_dop": amount})
    assert r.status_code == 201, r.text
    return r.json()


def alerts(client, home_id, **params):
    r = client.get(f"/api/v1/homes/{home_id}/alerts", params=params)
    assert r.status_code == 200, r.text
    return r.json()


# ---------- equipos ----------
def test_equipment_crud(client):
    h = mk_home(client)
    e = client.post(eq_url(h["id"]), json=EQ)
    assert e.status_code == 201, e.text
    e = e.json()
    assert e["home_id"] == h["id"] and float(e["power_w"]) == 150
    assert len(client.get(eq_url(h["id"])).json()) == 1
    assert client.get(eq_url(h["id"], e["id"])).json()["name"] == "Nevera"
    r = client.put(eq_url(h["id"], e["id"]), json={**EQ, "hours_per_day": "12", "room": None})
    assert r.status_code == 200 and float(r.json()["hours_per_day"]) == 12 and r.json()["room"] is None
    assert client.delete(eq_url(h["id"], e["id"])).status_code == 204
    assert client.get(eq_url(h["id"], e["id"])).status_code == 404


@pytest.mark.parametrize("patch", [
    {"power_w": "-1"}, {"hours_per_day": "-0.5"}, {"hours_per_day": "24.5"}, {"power_w": "100001"},
    {"name": ""}, {"power_w": "abc"}, {"hours_per_day": "1.234"},
])
def test_equipment_invalid_is_422(client, patch):
    h = mk_home(client)
    assert client.post(eq_url(h["id"]), json={**EQ, **patch}).status_code == 422


def test_equipment_isolated_per_home_and_404(client):
    h1, h2 = mk_home(client), mk_home(client)
    e = client.post(eq_url(h1["id"]), json=EQ).json()
    assert client.get(eq_url(h2["id"], e["id"])).status_code == 404
    assert client.put(eq_url(h2["id"], e["id"]), json=EQ).status_code == 404
    assert client.delete(eq_url(h2["id"], e["id"])).status_code == 404
    assert client.get(eq_url(h2["id"])).json() == []
    assert client.post(eq_url(uuid.uuid4()), json=EQ).status_code == 404


def test_estimate_exact_and_labeled_estimated(client):
    h = mk_home(client)
    client.post(eq_url(h["id"]), json=EQ)                                                    # 3.6 kWh/día
    client.post(eq_url(h["id"]), json={"name": "AC", "room": "Sala", "power_w": "1000", "hours_per_day": "5"})  # 5
    add_bill(client, h["id"], "2026-08-01", "2026-08-30", "430", days=30)
    r = client.get(eq_url(h["id"], "estimate"))
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["equipment_count"] == 2 and d["days_per_month"] == 30
    assert float(d["total_daily_kwh"]["value"]) == 8.6 and d["total_daily_kwh"]["quality"] == "ESTIMATED"
    assert float(d["total_monthly_kwh"]["value"]) == 258 and d["total_monthly_kwh"]["quality"] == "ESTIMATED"
    assert all(i["daily_kwh"]["quality"] == i["monthly_kwh"]["quality"] == "ESTIMATED" for i in d["items"])
    assert d["latest_bill_kwh"]["quality"] == "REAL" and float(d["latest_bill_kwh"]["value"]) == 430
    assert float(d["bill_coverage_pct"]["value"]) == 60 and d["bill_coverage_pct"]["quality"] == "ESTIMATED"
    assert "No es una medición" in d["note"]


def test_estimate_empty_home_has_no_invented_values(client):
    h = mk_home(client)
    d = client.get(eq_url(h["id"], "estimate")).json()
    assert d["equipment_count"] == 0 and d["items"] == []
    assert float(d["total_monthly_kwh"]["value"]) == 0
    assert d["latest_bill_kwh"] is None and d["bill_coverage_pct"] is None


# ---------- alertas ----------
def test_no_alert_without_history_or_below_threshold(client):
    h = mk_home(client)
    add_bill(client, h["id"], "2026-06-01", "2026-06-30", "100")
    assert alerts(client, h["id"]) == []                       # sin historial
    add_bill(client, h["id"], "2026-07-01", "2026-07-30", "119")
    assert alerts(client, h["id"]) == []                       # +19 % < 20 %


def test_alert_created_with_basis_period_severity_and_unread(client):
    h = mk_home(client)
    add_bill(client, h["id"], "2026-06-01", "2026-06-30", "100")
    b2 = add_bill(client, h["id"], "2026-07-01", "2026-07-30", "125")
    [a] = alerts(client, h["id"])
    assert a["severity"] == "warning" and a["status"] == "unread" and a["bill_id"] == b2["id"]
    assert float(a["kwh_pct"]) == 25 and float(a["threshold_pct"]) == 20
    assert a["message"].endswith("(100.00 kWh → 125.00 kWh).")
    assert a["basis_period_start"] == "2026-06-01" and a["basis_period_end"] == "2026-06-30"
    add_bill(client, h["id"], "2026-08-01", "2026-08-30", "200")    # +60 % vs 125
    crit = [x for x in alerts(client, h["id"]) if x["severity"] == "critical"]
    assert len(crit) == 1 and crit[0]["basis_period_start"] == "2026-07-01"


def test_alert_status_transitions_and_filters(client):
    h = mk_home(client)
    add_bill(client, h["id"], "2026-06-01", "2026-06-30", "100")
    add_bill(client, h["id"], "2026-07-01", "2026-07-30", "150")
    [a] = alerts(client, h["id"])
    url = f"/api/v1/homes/{h['id']}/alerts/{a['id']}"
    assert client.patch(url, json={"status": "read"}).json()["status"] == "read"
    assert client.patch(url, json={"status": "dismissed"}).json()["status"] == "dismissed"
    assert alerts(client, h["id"]) == []                                     # descartadas ocultas
    assert len(alerts(client, h["id"], include_dismissed=True)) == 1
    assert len(alerts(client, h["id"], status="dismissed")) == 1
    assert client.patch(url, json={"status": "deleted"}).status_code == 422
    other = mk_home(client)
    assert client.patch(f"/api/v1/homes/{other['id']}/alerts/{a['id']}", json={"status": "read"}).status_code == 404


def test_dismissed_alert_survives_unrelated_bill_but_resets_if_changed(client):
    h = mk_home(client)
    add_bill(client, h["id"], "2026-06-01", "2026-06-30", "100")
    b2 = add_bill(client, h["id"], "2026-07-01", "2026-07-30", "150")
    [a] = alerts(client, h["id"])
    client.patch(f"/api/v1/homes/{h['id']}/alerts/{a['id']}", json={"status": "dismissed"})
    add_bill(client, h["id"], "2026-08-01", "2026-08-30", "150")              # 0 %: no afecta
    assert alerts(client, h["id"], status="dismissed")[0]["id"] == a["id"]
    upd = {"period_start": "2026-07-01", "period_end": "2026-07-30", "days": 30, "kwh": "130", "amount_dop": "1"}
    assert client.put(bill_url(h["id"], b2["id"]), json=upd).status_code == 200   # cambia el %: vuelve a unread
    [again] = alerts(client, h["id"])
    assert again["status"] == "unread" and float(again["kwh_pct"]) == 30


def test_alert_disappears_when_bill_deleted_or_corrected(client):
    h = mk_home(client)
    add_bill(client, h["id"], "2026-06-01", "2026-06-30", "100")
    b2 = add_bill(client, h["id"], "2026-07-01", "2026-07-30", "150")
    assert len(alerts(client, h["id"])) == 1
    assert client.delete(bill_url(h["id"], b2["id"])).status_code == 204
    assert alerts(client, h["id"], include_dismissed=True) == []


def test_zero_base_never_alerts(client):
    h = mk_home(client)
    add_bill(client, h["id"], "2026-06-01", "2026-06-30", "0")
    add_bill(client, h["id"], "2026-07-01", "2026-07-30", "500")
    assert alerts(client, h["id"]) == []


def test_alert_settings_change_thresholds_and_recompute(client):
    h = mk_home(client)
    url = f"/api/v1/homes/{h['id']}/alert-settings"
    s = client.get(url).json()
    assert float(s["warning_pct"]) == 20 and float(s["critical_pct"]) == 40
    add_bill(client, h["id"], "2026-06-01", "2026-06-30", "100")
    add_bill(client, h["id"], "2026-07-01", "2026-07-30", "115")              # +15 %
    assert alerts(client, h["id"]) == []
    r = client.put(url, json={"warning_pct": "10", "critical_pct": "15"})
    assert r.status_code == 200
    [a] = alerts(client, h["id"])
    assert a["severity"] == "critical" and float(a["threshold_pct"]) == 15
    dash = client.get(f"/api/v1/homes/{h['id']}/dashboard").json()
    assert dash["alert"]["severity"] == "critical"                            # dashboard usa los mismos umbrales


@pytest.mark.parametrize("body", [
    {"warning_pct": "0", "critical_pct": "40"},
    {"warning_pct": "-5", "critical_pct": "40"},
    {"warning_pct": "50", "critical_pct": "40"},
    {"warning_pct": "abc", "critical_pct": "40"},
])
def test_alert_settings_invalid_is_422(client, body):
    h = mk_home(client)
    assert client.put(f"/api/v1/homes/{h['id']}/alert-settings", json=body).status_code == 422


def test_seeded_pilots_alerts_and_estimates(seeded_client):
    homes = {h["code"]: h["id"] for h in seeded_client.get("/api/v1/homes").json()}
    assert alerts(seeded_client, homes["PILOT-01"])[0]["severity"] == "critical"
    assert alerts(seeded_client, homes["PILOT-03"])[0]["severity"] == "warning"
    assert alerts(seeded_client, homes["PILOT-02"]) == []
    for hid in homes.values():
        d = seeded_client.get(eq_url(hid, "estimate")).json()
        assert d["equipment_count"] >= 2 and d["total_monthly_kwh"]["quality"] == "ESTIMATED"


def test_openapi_exposes_insights_routes(client):
    paths = client.get("/openapi.json").json()["paths"]
    for p in ["/api/v1/homes/{home_id}/equipment", "/api/v1/homes/{home_id}/equipment/estimate",
              "/api/v1/homes/{home_id}/equipment/{equipment_id}", "/api/v1/homes/{home_id}/alerts",
              "/api/v1/homes/{home_id}/alerts/{alert_id}", "/api/v1/homes/{home_id}/alert-settings"]:
        assert p in paths, p
