"""ERD-SCORE-01: Energy Score 0–100 — fórmula pura, API, autorización y honestidad con los datos faltantes."""
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest

from app.services import consumption_calc as cc
from app.services import energy_score_engine as engine
from tests.test_api_homes_bills import mk_home
from tests.test_api_insights import add_bill, eq_url
from tests.test_auth import auth_client, bearer, register  # noqa: F401

D = Decimal
TODAY = date(2026, 10, 11)
TZ = cc.SANTO_DOMINGO


def bill(end_ago=20, days=30, kwh="300", due=None, paid=False):
    end = TODAY - timedelta(days=end_ago)
    return engine.BillFact(end - timedelta(days=days - 1), end, days, D(kwh), due, paid)


def bills_history(*kwh, last_end_ago=20):
    """Facturas mensuales consecutivas (de la más antigua a la más reciente) con los kWh dados."""
    n = len(kwh)
    return [bill(end_ago=last_end_ago + 30 * (n - 1 - i), kwh=str(k)) for i, k in enumerate(kwh)]


def comp(result, key):
    return next(c for c in result.components if c.key == key)


# ---------- fórmula pura ----------
def test_weights_add_up_to_100_and_every_component_is_documented():
    assert sum(engine.WEIGHTS.values()) == 100
    assert set(engine.WEIGHTS) == set(engine.LABELS) == set(engine.SUMMARY) == set(engine.NEXT_STEP) == {"consumption", "efficiency", "habits", "consistency"}


def test_nothing_known_means_no_score_and_no_invented_components():
    r = engine.evaluate(engine.ScoreFacts(today=TODAY))
    assert r.score is None and r.band is None and r.coverage_pct == 0
    assert all(not c.available and c.reasons for c in r.components) and r.reasons


def test_a_single_available_component_is_not_enough():
    r = engine.evaluate(engine.ScoreFacts(today=TODAY, readings_count=1, last_reading_days_ago=2))   # solo Hábitos
    assert comp(r, "habits").score == 100 and r.score is None and r.coverage_pct == 15


def test_consumption_against_the_goal_is_linear_between_100_and_150_percent():
    score = lambda projected: comp(engine.evaluate(engine.ScoreFacts(today=TODAY, goal_kwh=D("300"), projected_kwh=D(projected))), "consumption").score  # noqa: E731
    assert (score("240"), score("300"), score("337.5"), score("375"), score("450"), score("900")) == (100, 100, 75, 50, 0, 0)


def test_consumption_by_history_needs_four_bills_and_compares_rates():
    flat = engine.evaluate(engine.ScoreFacts(today=TODAY, bills=bills_history(300, 300, 300, 300)))
    assert comp(flat, "consumption").score == 100 and comp(flat, "consumption").inputs["method"] == "history"
    up = engine.evaluate(engine.ScoreFacts(today=TODAY, bills=bills_history(300, 300, 300, 375)))     # +25 %
    assert comp(up, "consumption").score == 50
    down = engine.evaluate(engine.ScoreFacts(today=TODAY, bills=bills_history(300, 300, 300, 150)))
    assert comp(down, "consumption").score == 100
    short = engine.evaluate(engine.ScoreFacts(today=TODAY, bills=bills_history(300, 300, 300)))
    assert comp(short, "consumption").score is None


def test_efficiency_is_the_share_of_equipment_use_that_could_still_be_saved():
    f = lambda saved: engine.ScoreFacts(today=TODAY, equipment_count=2, equipment_monthly_kwh=D("200"), potential_savings_kwh=D(saved))  # noqa: E731
    assert [comp(engine.evaluate(f(s)), "efficiency").score for s in ("0", "20", "50", "100")] == [100, 80, 50, 0]
    assert comp(engine.evaluate(engine.ScoreFacts(today=TODAY, equipment_count=1, equipment_monthly_kwh=D("0"))), "efficiency").score is None
    assert comp(engine.evaluate(engine.ScoreFacts(today=TODAY)), "efficiency").score is None


def test_habits_combine_readings_recent_bill_and_payments_but_skip_what_does_not_apply():
    fresh = engine.evaluate(engine.ScoreFacts(today=TODAY, readings_count=5, last_reading_days_ago=3, bills=[bill(end_ago=10, due=TODAY + timedelta(days=5), paid=True)]))
    assert comp(fresh, "habits").score == 100
    stale = engine.evaluate(engine.ScoreFacts(today=TODAY, readings_count=5, last_reading_days_ago=30, bills=[bill(end_ago=90)]))
    assert comp(stale, "habits").score == 0
    late = engine.evaluate(engine.ScoreFacts(today=TODAY, bills=[bill(end_ago=10, due=TODAY - timedelta(days=3), paid=False)]))
    assert comp(late, "habits").inputs["pagos"] == "0"
    notdue = engine.evaluate(engine.ScoreFacts(today=TODAY, bills=[bill(end_ago=10, due=TODAY + timedelta(days=9), paid=False)]))
    assert "pagos" not in comp(notdue, "habits").inputs          # aún no vence y no está pagada: no cuenta ni a favor ni en contra
    assert comp(engine.evaluate(engine.ScoreFacts(today=TODAY)), "habits").score is None


def test_consistency_penalises_recent_anomalies_by_severity_and_unstable_bills():
    anomalies = lambda *items: [engine.AnomalyFact(sev, st, TODAY - timedelta(days=5)) for sev, st in items]  # noqa: E731
    base = dict(today=TODAY, bills=bills_history(300, 300, 300))
    assert comp(engine.evaluate(engine.ScoreFacts(**base)), "consistency").score == 100
    assert comp(engine.evaluate(engine.ScoreFacts(**base, anomalies=anomalies(("critical", "open")))), "consistency").inputs["desviaciones"] == "70"
    assert comp(engine.evaluate(engine.ScoreFacts(**base, anomalies=anomalies(("critical", "acknowledged")))), "consistency").inputs["desviaciones"] == "85"
    many = anomalies(*[("critical", "open")] * 5)
    assert comp(engine.evaluate(engine.ScoreFacts(**base, anomalies=many)), "consistency").inputs["desviaciones"] == "0"
    old = [engine.AnomalyFact("critical", "open", TODAY - timedelta(days=200))]
    assert comp(engine.evaluate(engine.ScoreFacts(**base, anomalies=old)), "consistency").inputs["desviaciones"] == "100"
    wild = engine.evaluate(engine.ScoreFacts(today=TODAY, bills=bills_history(100, 500, 100, 500)))
    assert comp(wild, "consistency").inputs["estabilidad"] == "0"
    assert comp(engine.evaluate(engine.ScoreFacts(today=TODAY, bills=bills_history(300))), "consistency").score is None


def test_missing_components_do_not_count_as_zero_their_weight_is_redistributed():
    facts = engine.ScoreFacts(today=TODAY, goal_kwh=D("300"), projected_kwh=D("300"), equipment_count=1, equipment_monthly_kwh=D("100"), potential_savings_kwh=D("25"))
    r = engine.evaluate(facts)                       # Consumo 100 (peso 35) y Eficiencia 50 (peso 25)
    assert [c.available for c in r.components] == [True, True, False, False] and r.coverage_pct == 60
    assert r.score == round((100 * 35 + 50 * 25) / 60) == 79
    assert (r.band, r.band_label) == ("good", "Bueno")


@pytest.mark.parametrize("score, expected", [(100, "good"), (70, "good"), (69, "fair"), (40, "fair"), (39, "poor"), (0, "poor")])
def test_bands(score, expected):
    assert engine.band_for(score)[0] == expected


def test_scores_stay_within_0_100_and_are_monotonic_in_the_goal_ratio():
    previous = 101
    for projected in range(0, 700, 25):
        s = comp(engine.evaluate(engine.ScoreFacts(today=TODAY, goal_kwh=D("300"), projected_kwh=D(projected))), "consumption").score
        assert 0 <= s <= 100 and s <= previous
        previous = s


def test_evaluation_is_deterministic():
    facts = engine.ScoreFacts(today=TODAY, bills=bills_history(300, 310, 290, 305), readings_count=3, last_reading_days_ago=4, equipment_count=1,
                              equipment_monthly_kwh=D("120"), potential_savings_kwh=D("12"))
    assert engine.evaluate(facts) == engine.evaluate(facts)


# ---------- API ----------
def score_url(home):
    return f"/api/v1/homes/{home}/energy-score"


def get_score(client, home):
    r = client.get(score_url(home))
    assert r.status_code == 200, r.text
    assert r.headers["cache-control"] == "no-store"
    return r.json()


def comp_api(body, key):
    return next(c for c in body["components"] if c["key"] == key)


def months_ago(n):
    end = datetime.now(timezone.utc).astimezone(TZ).date() - timedelta(days=20 + 30 * n)
    return (end - timedelta(days=29)).isoformat(), end.isoformat()


def test_a_new_home_has_no_score_and_says_why(client):
    home = mk_home(client)["id"]
    body = get_score(client, home)
    assert (body["status"], body["score"], body["band"], body["quality"], body["coverage_pct"]) == ("insufficient_data", None, None, "INFERRED", 0)
    assert body["reasons"] and all(c["score"] is None and c["available"] is False and c["reasons"] for c in body["components"])
    assert [c["key"] for c in body["components"]] == ["consumption", "efficiency", "habits", "consistency"]
    assert body["score_version"] == engine.SCORE_VERSION


def test_a_home_with_bills_and_equipment_gets_an_explained_score(client):
    home = mk_home(client)["id"]
    for n, kwh in zip((3, 2, 1, 0), ("300", "300", "300", "300")):
        start, end = months_ago(n)
        add_bill(client, home, start, end, kwh)
    assert client.post(eq_url(home), json={"name": "Aire", "room": "Sala", "kind": "air_conditioner", "power_w": "1500", "hours_per_day": "6"}).status_code == 201
    body = get_score(client, home)
    assert body["status"] == "ok" and 0 <= body["score"] <= 100 and body["band"] in ("good", "fair", "poor")
    eff = comp_api(body, "efficiency")
    assert eff["available"] and eff["inputs"]["potential_savings_kwh"] == "45.00" and eff["inputs"]["equipment_monthly_kwh"] == "270.00"
    assert eff["score"] == 67                       # 45 de 270 kWh = 16,7 % por ahorrar → 100 − 2 × 16,7
    assert comp_api(body, "consumption")["inputs"]["method"] == "history"
    for c in body["components"]:
        assert c["summary"] and c["next_step"] and c["label"]
        assert (c["detail"] != "") and (c["score"] is None or 0 <= c["score"] <= 100)
    assert "INFERIDO" in body["note"] and body["method"]


def test_applying_a_recommendation_improves_efficiency_and_dismissing_it_hides_it_from_the_potential(client):
    home = mk_home(client)["id"]
    client.post(eq_url(home), json={"name": "Aire", "room": "Sala", "kind": "air_conditioner", "power_w": "1500", "hours_per_day": "6"})
    start, end = months_ago(0)
    add_bill(client, home, start, end, "300")
    before = comp_api(get_score(client, home), "efficiency")["score"]
    (rec,) = client.get(f"/api/v1/homes/{home}/recommendations").json()["items"]
    assert client.patch(f"/api/v1/homes/{home}/recommendations/{rec['id']}", json={"status": "applied"}).status_code == 200
    after = comp_api(get_score(client, home), "efficiency")
    assert after["score"] > before and after["inputs"]["potential_savings_kwh"] == "0.00"


def test_the_goal_drives_the_consumption_component(client):
    home = mk_home(client)["id"]
    start1, end1 = months_ago(1)
    start0, end0 = months_ago(0)
    add_bill(client, home, start1, end1, "200")
    add_bill(client, home, start0, end0, "300")
    assert client.put(f"/api/v1/homes/{home}/goal", json={"monthly_kwh": "250"}).status_code == 200
    c = comp_api(get_score(client, home), "consumption")
    assert c["inputs"]["method"] == "goal" and Decimal(c["inputs"]["projected_kwh"]) > Decimal(c["inputs"]["goal_kwh"]) and c["score"] < 100
    assert client.put(f"/api/v1/homes/{home}/goal", json={"monthly_kwh": "900"}).status_code == 200
    assert comp_api(get_score(client, home), "consumption")["score"] == 100


def test_the_score_is_isolated_between_homes_and_removed_with_them(client):
    one, two = mk_home(client)["id"], mk_home(client, name="Otra")["id"]
    start, end = months_ago(0)
    add_bill(client, one, start, end, "300")
    assert get_score(client, two)["coverage_pct"] == 0
    assert client.delete(f"/api/v1/homes/{one}").status_code == 204
    assert client.get(score_url(one)).status_code == 404


def test_strangers_cannot_read_the_score(auth_client):
    alice, bob = register(auth_client), register(auth_client, "bob@example.com")
    home = auth_client.post("/api/v1/homes", headers=bearer(alice), json={"name": "Casa", "distributor": "EDESUR"}).json()["id"]
    assert auth_client.get(score_url(home), headers=bearer(bob)).status_code == 404
    assert auth_client.get(score_url(home)).status_code == 401
    assert auth_client.get(score_url(home), headers=bearer(alice)).status_code == 200
    for method in ("post", "put", "patch", "delete"):
        assert getattr(auth_client, method)(score_url(home), headers=bearer(alice)).status_code == 405


def test_unknown_home_is_404(client):
    assert client.get(score_url(str(uuid.uuid4()))).status_code == 404


def test_core_bands_match_the_engine_bands():
    """El front (`packages/core/src/energyScore.ts`) repite los umbrales para dibujar el gauge; deben ser los del motor."""
    import re
    from pathlib import Path
    source = (Path(__file__).resolve().parents[3] / "packages/core/src/energyScore.ts").read_text(encoding="utf-8")
    front = re.findall(r"key: '(\w+)', word: '(\w+)', min: (\d+)", source)
    assert front == [(key, word, str(minimum)) for key, word, minimum in engine.BANDS]
