from tests.test_api_homes_bills import mk_home
from tests.test_api_readings import add_reading


def anomaly_url(home_id):
    return f"/api/v1/homes/{home_id}/anomalies"


def test_anomalies_endpoint_returns_explainable_current_daily_anomaly_without_duplicates(client, migrated):
    home = mk_home(client)["id"]
    for day, kwh in [(1, 100), (2, 110), (3, 119), (4, 139), (5, 159)]:
        add_reading(client, home, f"2026-09-{day:02d}T00:00:00-04:00", kwh)

    params = {"granularity": "day", "warning_delta_pct": 10, "critical_delta_pct": 50}
    first = client.get(anomaly_url(home), params=params)
    second = client.get(anomaly_url(home), params=params)

    assert first.status_code == 200, first.text
    assert first.json() == second.json()
    assert len(first.json()) == 1
    anomaly = first.json()[0]
    assert anomaly["severity"] == "critical"
    assert anomaly["observed_kwh"] == "20.00"
    assert anomaly["baseline_kwh"] == "10.00"
    assert anomaly["delta_pct"] == "100.00"
    assert anomaly["period_start"] == "2026-09-04"
    assert "equipo específico" in anomaly["explanation"]

    with migrated.connect() as connection:
        assert connection.exec_driver_sql("SELECT count(*) FROM alerts").scalar() == 0


def test_anomalies_endpoint_supports_monthly_buckets(client):
    home = mk_home(client)["id"]
    for month, kwh in [(1, 0), (2, 100), (3, 210), (4, 300), (5, 500)]:
        add_reading(client, home, f"2026-{month:02d}-01T00:00:00-04:00", kwh)

    response = client.get(anomaly_url(home), params={"granularity": "month", "warning_delta_pct": 50,
                                                       "critical_delta_pct": 100})

    assert response.status_code == 200, response.text
    assert len(response.json()) == 1
    anomaly = response.json()[0]
    assert anomaly["period_start"] == "2026-04-01"
    assert anomaly["period_end"] == "2026-04-30"
    assert anomaly["baseline_kwh"] == "100.00"
    assert anomaly["observed_kwh"] == "200.00"
