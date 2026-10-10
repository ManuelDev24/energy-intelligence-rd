"""Dashboard: cálculos exactos con fixtures conocidas y sin inventar métricas."""
from tests.test_api_homes_bills import bill_url, mk_home


def add_bill(client, home_id, start, end, days, kwh, amount):
    r = client.post(bill_url(home_id), json={"period_start": start, "period_end": end, "days": days,
                                             "kwh": kwh, "amount_dop": amount})
    assert r.status_code == 201, r.text


def dash(client, home_id):
    r = client.get(f"/api/v1/homes/{home_id}/dashboard")
    assert r.status_code == 200, r.text
    return r.json()


def test_dashboard_empty_home_invents_nothing(client):
    h = mk_home(client)
    d = dash(client, h["id"])
    assert d["latest_bill"] is None and d["comparison"] is None
    assert d["projection"] is None and d["alert"] is None and d["recommendation"] is None
    assert d["data_status"]["bills_count"] == 0 and d["data_status"]["data_source"] == "none"
    assert d["data_status"]["insufficient_reasons"]


def test_dashboard_one_bill_real_and_estimated_only(client):
    h = mk_home(client)
    add_bill(client, h["id"], "2026-08-01", "2026-08-30", 30, "300", "3600")
    d = dash(client, h["id"])
    lb = d["latest_bill"]
    assert lb["kwh"]["quality"] == "REAL" and lb["amount_dop"]["quality"] == "REAL"
    assert float(lb["avg_daily_kwh"]["value"]) == 10.0 and lb["avg_daily_kwh"]["quality"] == "ESTIMATED"
    assert float(lb["avg_price_per_kwh"]["value"]) == 12.0
    assert d["comparison"] is None and d["projection"] is None and d["alert"] is None
    assert any("2 facturas" in r for r in d["data_status"]["insufficient_reasons"])


def test_dashboard_exact_values_and_labels(client):
    h = mk_home(client)
    add_bill(client, h["id"], "2026-06-01", "2026-06-30", 30, "250", "3000")
    add_bill(client, h["id"], "2026-07-01", "2026-07-31", 31, "300", "3600")
    add_bill(client, h["id"], "2026-08-01", "2026-08-31", 31, "350", "4200")
    d = dash(client, h["id"])
    c, p = d["comparison"], d["projection"]
    assert float(c["kwh_delta"]["value"]) == 50 and float(c["kwh_pct"]["value"]) == 16.67
    assert c["kwh_pct"]["quality"] == "REAL"
    assert float(p["kwh"]["value"]) == 400 and float(p["amount_dop"]["value"]) == 4800
    assert p["kwh"]["quality"] == "PROJECTED" and p["bills_used"] == 3
    assert d["alert"] is None  # 16.67 % < 20 %
    # ERD-PROJECTION-METRIC-API: la variación de la proyección frente a la última factura la calcula la API.
    assert p["kwh_pct_vs_latest"] == {"value": "14.29", "unit": "%", "quality": "PROJECTED"}  # (400-350)/350
    assert set(d["quality_legend"]) == {"REAL", "ESTIMATED", "PROJECTED"}
    assert d["data_status"]["resolution"] == "monthly" and d["data_status"]["hourly_data_available"] is False


def test_dashboard_alert_severity_and_unordered_insertion(client):
    h = mk_home(client)
    # Insertadas en desorden: el "último" se decide por período, no por orden de inserción.
    add_bill(client, h["id"], "2026-08-01", "2026-08-31", 31, "420", "5600")
    add_bill(client, h["id"], "2026-07-01", "2026-07-31", 31, "280", "3560")
    d = dash(client, h["id"])
    assert float(d["latest_bill"]["kwh"]["value"]) == 420
    assert d["alert"]["severity"] == "critical" and "50" in d["alert"]["message"]
    assert d["recommendation"]
    assert d["alert"]["basis_period_start"] == "2026-07-01"


def test_dashboard_zero_base_no_percentage(client):
    h = mk_home(client)
    add_bill(client, h["id"], "2026-07-01", "2026-07-31", 31, "0", "0")
    add_bill(client, h["id"], "2026-08-01", "2026-08-31", 31, "100", "1000")
    d = dash(client, h["id"])
    assert d["comparison"]["kwh_pct"] is None and d["alert"] is None
    assert any("0 kWh" in r for r in d["data_status"]["insufficient_reasons"])


def test_dashboard_zero_days_has_no_daily_average(client):
    h = mk_home(client)
    add_bill(client, h["id"], "2026-08-01", "2026-08-31", 0, "100", "1000")
    assert dash(client, h["id"])["latest_bill"]["avg_daily_kwh"] is None


def test_dashboard_unknown_home_404(client):
    import uuid
    assert client.get(f"/api/v1/homes/{uuid.uuid4()}/dashboard").status_code == 404


def test_dashboard_selected_period_excludes_future_bills(client):
    h = mk_home(client)
    add_bill(client, h["id"], "2026-06-01", "2026-06-30", 30, "250", "3000")
    add_bill(client, h["id"], "2026-07-01", "2026-07-31", 31, "300", "3600")
    add_bill(client, h["id"], "2026-08-01", "2026-08-31", 31, "900", "10800")
    bills = client.get(bill_url(h["id"])).json()
    july = next(b for b in bills if b["period_end"] == "2026-07-31")
    r = client.get(f'/api/v1/homes/{h["id"]}/dashboard', params={"bill_id": july["id"]})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["latest_bill"]["bill_id"] == july["id"]
    assert d["comparison"]["kwh_delta"]["value"] == "50.00"
    assert d["projection"]["kwh"]["value"] == "350.00"
    assert d["projection"]["bills_used"] == 2
    assert d["data_status"]["bills_count"] == 2
    assert d["alert"]["severity"] == "warning"
    june = next(b for b in bills if b["period_end"] == "2026-06-30")
    first = client.get(f'/api/v1/homes/{h["id"]}/dashboard', params={"bill_id": june["id"]}).json()
    assert first["comparison"] is None and first["projection"] is None


def test_dashboard_selected_bill_must_belong_to_home(client):
    import uuid
    h, other = mk_home(client), mk_home(client)
    add_bill(client, other["id"], "2026-08-01", "2026-08-31", 31, "100", "1000")
    foreign = client.get(bill_url(other["id"])).json()[0]["id"]
    url = f'/api/v1/homes/{h["id"]}/dashboard'
    assert client.get(url, params={"bill_id": foreign}).status_code == 404
    assert client.get(url, params={"bill_id": str(uuid.uuid4())}).status_code == 404
    assert client.get(url, params={"bill_id": "invalid"}).status_code == 422


def test_dashboard_seeded_pilots_are_labeled_demo(seeded_client):
    homes = seeded_client.get("/api/v1/homes").json()
    assert len(homes) == 5
    by_code = {h["code"]: dash(seeded_client, h["id"]) for h in homes}
    assert all(d["data_status"]["is_demo"] and d["data_status"]["data_source"] == "seed" for d in by_code.values())
    assert by_code["PILOT-01"]["alert"]["severity"] == "critical"
    assert by_code["PILOT-02"]["alert"] is None
    assert by_code["PILOT-03"]["alert"]["severity"] == "warning"
    assert by_code["PILOT-03"]["projection"]["bills_used"] == 2
    # cada vivienda ve solo sus propios resultados
    assert len({d["latest_bill"]["bill_id"] for d in by_code.values()}) == 5


def test_projection_variation_is_negative_when_consumption_is_falling(client):
    h = mk_home(client)
    add_bill(client, h["id"], "2026-07-01", "2026-07-31", 31, "400", "5000")
    add_bill(client, h["id"], "2026-08-01", "2026-08-31", 31, "300", "4000")
    p = dash(client, h["id"])["projection"]
    assert p["kwh"]["value"] == "200.00"
    assert p["kwh_pct_vs_latest"] == {"value": "-33.33", "unit": "%", "quality": "PROJECTED"}


def test_projection_variation_is_absent_when_the_latest_bill_has_zero_kwh(client):
    h = mk_home(client)
    add_bill(client, h["id"], "2026-07-01", "2026-07-31", 31, "100", "1000")
    add_bill(client, h["id"], "2026-08-01", "2026-08-31", 31, "0", "0")
    p = dash(client, h["id"])["projection"]
    assert p is not None and p["kwh_pct_vs_latest"] is None
