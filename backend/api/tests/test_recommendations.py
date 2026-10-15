"""ERD-SAVE-01: recomendaciones de ahorro explicables, versionadas e idempotentes (motor puro, servicio y API)."""
import uuid
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.orm import Session

from app.models import Recommendation
from app.services import recommendation_engine as engine
from app.services import recommendations as service
from tests.test_api_homes_bills import mk_home
from tests.test_api_insights import add_bill, eq_url
from tests.test_auth import auth_client, bearer, register  # noqa: F401

D = Decimal


def fact(kind="air_conditioner", name="Aire sala", power="1500", hours="6", share="60", monthly=None):
    power_w, h = D(power), D(hours)
    return engine.EquipmentFact(id=uuid.uuid4(), name=name, kind=kind, power_w=power_w, hours_per_day=h, share_pct=D(share),
                                monthly_kwh=D(monthly) if monthly is not None else power_w * h / 1000 * 30)


def facts(*equipment, **kw):
    return engine.Facts(equipment=equipment, **kw)


# ---------- motor puro ----------
def test_ac_saving_is_nominal_power_times_one_hour_times_thirty_days_with_its_assumptions():
    (c,) = engine.evaluate(facts(fact(), price_per_kwh=D("13.33"), bills_count=2))
    assert (c.rule_id, c.rule_version, c.category, c.confidence) == ("ac-one-hour", 1, "equipment", "medium")
    assert c.savings_kwh == D("45.00") and c.savings_dop == D("599.85")
    assert any("potencia nominal" in a for a in c.assumptions) and any("30 días" in a for a in c.assumptions)
    assert c.evidence["power_w"] == "1500" and c.evidence["hours_per_day"] == "6" and c.dedupe_key.startswith("ac-one-hour:")


def test_without_price_there_are_no_pesos_and_without_a_rule_match_there_is_nothing():
    (c,) = engine.evaluate(facts(fact()))
    assert c.savings_kwh == D("45.00") and c.savings_dop is None
    assert engine.evaluate(facts(fact(hours="2", share="10", monthly="90"))) == []   # AC poco usado: nada que recomendar


def test_every_equipment_gets_at_most_one_recommendation_and_totals_do_not_double_count():
    eqs = [fact(), fact("water_heater", "Calentador", "3000", "1", "20"), fact("pool_pump", "Bomba", "750", "10", "10"),
           fact("tv", "TV", "120", "14", "5"), fact("lighting", "Luces", "300", "6", "5"), fact("refrigerator", "Nevera", "150", "24", "30")]
    out = engine.evaluate(facts(*eqs, price_per_kwh=D("10")))
    ids = [c.equipment_id for c in out]
    assert len(ids) == len(set(ids)) == len(eqs)
    kwh, dop = engine.totals(out)
    assert kwh == sum((c.savings_kwh for c in out), D(0)) and dop == D(kwh) * 10


def test_pool_pump_only_saves_the_hours_above_six():
    (c,) = engine.evaluate(facts(fact("pool_pump", "Bomba", "750", "10", "50")))
    assert c.savings_kwh == D("90.00")            # 0,75 kW × 4 h × 30
    (fallback,) = engine.evaluate(facts(fact("pool_pump", "Bomba", "750", "6", "50", monthly="135")))
    assert fallback.rule_id == "top-consumer"     # a 6 h la regla específica no aplica; pesa 50 % y cae a «mayor consumidor»


def test_top_consumer_is_the_fallback_only_when_it_really_weighs():
    (c,) = engine.evaluate(facts(fact("washing_machine", "Lavadora", "500", "2", "55", monthly="30")))
    assert c.rule_id == "top-consumer" and c.savings_kwh == D("3.00") and c.confidence == "low"
    assert engine.evaluate(facts(fact("washing_machine", "Lavadora", "500", "2", "30", monthly="30"))) == []
    assert engine.evaluate(facts(fact("other", "Algo", "10", "1", "90", monthly="5"))) == []   # 10 % de 5 kWh < 1 kWh


def test_tiny_savings_are_not_shown():
    (tv,) = engine.evaluate(facts(fact("tv", "TV", "20", "12", "5", monthly="7.2")))           # 0,02 kW × 2 h × 30 = 1,2 kWh → sí
    assert tv.savings_kwh == D("1.20")
    assert engine.evaluate(facts(fact("tv", "TV", "5", "12", "5", monthly="1.8"))) == []       # 0,3 kWh → no


def test_goal_gap_by_kwh_and_by_pesos_and_silence_when_under_goal():
    only_goal = lambda f: [c for c in engine.evaluate(f) if c.category == "goal"]  # noqa: E731
    (g,) = only_goal(engine.Facts(goal_kwh=D("250"), projected_kwh=D("300.50"), bills_count=3))
    assert g.rule_id == "goal-gap" and g.savings_kwh is None and g.evidence["gap_kwh"] == "50.50"
    (p,) = only_goal(engine.Facts(goal_amount_dop=D("3000"), projected_amount_dop=D("3500"), bills_count=3))
    assert p.evidence["gap_dop"] == "500.00"
    assert only_goal(engine.Facts(goal_kwh=D("400"), projected_kwh=D("300"), bills_count=3)) == []
    assert only_goal(engine.Facts(goal_kwh=D("400"))) == []                              # sin proyección no se inventa


def test_goal_gap_mentions_how_much_the_equipment_advice_could_cover():
    out = engine.evaluate(facts(fact(), goal_kwh=D("250"), projected_kwh=D("300"), bills_count=3))
    goal = next(c for c in out if c.category == "goal")
    assert goal.evidence["covered_by_recommendations_kwh"] == "45.00" and "45.00" in goal.summary


def test_only_open_warning_or_critical_anomalies_become_recommendations():
    a = lambda sev, kind="increase": engine.AnomalyFact(uuid.uuid4(), kind, sev, date(2026, 9, 1), date(2026, 9, 30), D("80"))  # noqa: E731
    out = engine.evaluate(engine.Facts(anomalies=[a("critical"), a("warning", "night"), a("info"), a("warning", "drop")]))
    assert sorted(c.rule_id for c in out) == ["anomaly-increase", "anomaly-night"]
    assert all(c.savings_kwh is None and c.anomaly_id for c in out)


def test_no_equipment_asks_to_declare_it_only_once_there_is_a_bill():
    assert engine.evaluate(engine.Facts()) == []
    (c,) = engine.evaluate(engine.Facts(bills_count=1))
    assert c.rule_id == "declare-equipment" and c.category == "data" and c.savings_kwh is None


def test_evaluation_is_deterministic_and_ordered_by_saving():
    eqs = [fact(), fact("water_heater", "Calentador", "3000", "1", "20")]
    first = engine.evaluate(facts(*eqs, price_per_kwh=D("12")))
    assert first == engine.evaluate(facts(*reversed(eqs), price_per_kwh=D("12")))
    assert [c.savings_kwh for c in first] == sorted((c.savings_kwh for c in first), reverse=True)


def test_savings_are_never_negative_across_a_grid_of_inputs():
    for kind in ("air_conditioner", "water_heater", "pool_pump", "lighting", "tv", "computer", "fan", "refrigerator", "microwave", "other"):
        for power in ("0", "5", "100", "1500"):
            for hours in ("0", "0.5", "4", "6", "7", "24"):
                for c in engine.evaluate(facts(fact(kind, "x", power, hours, "50"), price_per_kwh=D("15"))):
                    assert c.savings_kwh is None or c.savings_kwh >= D(1)
                    assert c.savings_dop is None or c.savings_dop >= 0


# ---------- API ----------
def rec_url(home, *rest):
    return "/".join([f"/api/v1/homes/{home}/recommendations", *rest])


def add_eq(client, home, **over):
    body = {"name": "Aire sala", "room": "Sala", "power_w": "1500", "hours_per_day": "6", "kind": "air_conditioner", **over}
    r = client.post(eq_url(home), json=body)
    assert r.status_code == 201, r.text
    return r.json()


def listing(client, home, **params):
    r = client.get(rec_url(home), params=params)
    assert r.status_code == 200, r.text
    return r.json()


def test_declaring_equipment_creates_an_explainable_estimated_recommendation(client):
    home = mk_home(client)["id"]
    add_bill(client, home, "2026-07-01", "2026-07-30", "300", amount="3900")
    eq = add_eq(client, home)
    out = listing(client, home)
    (r,) = [i for i in out["items"] if i["category"] == "equipment"]
    assert (r["rule_id"], r["rule_version"], r["ruleset_version"], r["status"]) == ("ac-one-hour", 1, engine.RULESET_VERSION, "active")
    assert r["equipment_id"] == eq["id"] and r["confidence"] == "medium"
    assert r["savings_kwh_month"] == "45.00" and r["savings_dop_month"] == "585.00"     # precio medio 13,00 RD$/kWh
    assert r["assumptions"] and r["evidence"]["power_w"] == "1500" and r["action"] and r["summary"]
    assert out["total_savings_kwh_month"] == {"value": "45.00", "unit": "kWh/mes", "quality": "ESTIMATED"}
    assert out["total_savings_dop_month"]["quality"] == "ESTIMATED" and "ESTIMADO" in out["note"]


def test_refresh_is_idempotent_and_never_duplicates(client, session):
    home = mk_home(client)["id"]
    add_eq(client, home)
    first = listing(client, home)["items"]
    for _ in range(3):
        r = client.post(rec_url(home, "refresh"))
        assert r.status_code == 200 and r.headers["cache-control"] == "no-store"
    assert [(i["id"], i["savings_kwh_month"]) for i in listing(client, home)["items"]] == [(i["id"], i["savings_kwh_month"]) for i in first]
    result = service.refresh_home(session, uuid.UUID(home))
    assert result.as_dict() == {"created": 0, "updated": 0, "reopened": 0, "resolved": 0}
    assert session.query(Recommendation).count() == len(first)


def test_changing_the_equipment_updates_in_place_and_removing_it_resolves(client):
    home = mk_home(client)["id"]
    eq = add_eq(client, home)
    (before,) = listing(client, home)["items"]
    r = client.put(eq_url(home, eq["id"]), json={"name": "Aire sala", "room": "Sala", "power_w": "2000", "hours_per_day": "8", "kind": "air_conditioner"})
    assert r.status_code == 200, r.text
    (after,) = listing(client, home)["items"]
    assert after["id"] == before["id"] and after["savings_kwh_month"] == "60.00"
    assert client.delete(eq_url(home, eq["id"])).status_code == 204
    assert listing(client, home)["items"] == []
    (gone,) = listing(client, home, status="resolved")["items"]
    assert gone["id"] == before["id"] and gone["equipment_id"] is None
    again = add_eq(client, home)                                              # volver a declararlo reabre otra (nuevo equipo)
    assert [i["equipment_id"] for i in listing(client, home)["items"]] == [again["id"]]


def test_user_decisions_stick_and_resolved_cannot_be_forced(client):
    home = mk_home(client)["id"]
    eq = add_eq(client, home)
    (r,) = listing(client, home)["items"]
    for status in ("applied", "dismissed"):
        done = client.patch(rec_url(home, r["id"]), json={"status": status})
        assert done.status_code == 200 and done.json()["status"] == status
        client.put(eq_url(home, eq["id"]), json={"name": "Aire sala", "room": "Sala", "power_w": "1800", "hours_per_day": "7", "kind": "air_conditioner"})
        client.post(rec_url(home, "refresh"))
        stored = listing(client, home, status=status)["items"]
        assert [i["id"] for i in stored] == [r["id"]] and stored[0]["savings_kwh_month"] == "45.00"   # congelada: no se recalcula
        assert listing(client, home)["items"] == []
        assert client.patch(rec_url(home, r["id"]), json={"status": "active"}).json()["status"] == "active"
    client.delete(eq_url(home, eq["id"]))
    (gone,) = listing(client, home, status="resolved")["items"]
    assert client.patch(rec_url(home, gone["id"]), json={"status": "dismissed"}).status_code == 409


def test_a_new_rule_version_updates_active_rows_but_not_the_decided_ones(client, session, monkeypatch):
    home = mk_home(client)["id"]
    add_eq(client, home)
    add_eq(client, home, name="Calentador", kind="water_heater", power_w="3000", hours_per_day="1")
    ac, heater = sorted(listing(client, home)["items"], key=lambda i: i["rule_id"])
    assert client.patch(rec_url(home, heater["id"]), json={"status": "dismissed"}).status_code == 200
    rules = tuple(type(r)(**{**r.__dict__, "version": 2, "title": r.title + " v2"}) for r in engine.RULES)
    monkeypatch.setattr(engine, "RULES", rules)
    monkeypatch.setattr(engine, "RULE_BY_KIND", {k: r for r in rules for k in r.kinds})
    monkeypatch.setattr(engine, "RULESET_VERSION", 2)
    result = service.refresh_home(session, uuid.UUID(home))
    assert result.updated == 1 and result.created == 0
    rows = {r.rule_id: r for r in session.query(Recommendation).all()}
    assert (rows["ac-one-hour"].rule_version, rows["ac-one-hour"].ruleset_version) == (2, 2) and rows["ac-one-hour"].title.startswith("Una hora menos de aire acondicionado al día v2")
    assert (rows["water-heater-half-hour"].rule_version, rows["water-heater-half-hour"].status) == (1, "dismissed")
    assert ac["id"] == str(rows["ac-one-hour"].id)                            # misma fila, no una nueva


def test_goal_gap_appears_from_the_projection_and_resolves_when_goal_is_met(client):
    home = mk_home(client)["id"]
    add_bill(client, home, "2026-06-01", "2026-06-30", "200")
    add_bill(client, home, "2026-07-01", "2026-07-31", "300", days=31)
    assert client.put(f"/api/v1/homes/{home}/goal", json={"monthly_kwh": "250"}).status_code == 200
    (g,) = [i for i in listing(client, home)["items"] if i["category"] == "goal"]
    assert g["rule_id"] == "goal-gap" and g["savings_kwh_month"] is None and Decimal(g["evidence"]["gap_kwh"]) > 0
    assert client.put(f"/api/v1/homes/{home}/goal", json={"monthly_kwh": "900"}).status_code == 200
    assert [i for i in listing(client, home)["items"] if i["category"] == "goal"] == []
    assert listing(client, home, status="resolved")["items"][0]["id"] == g["id"]


def test_no_equipment_with_a_bill_suggests_declaring_it(client):
    home = mk_home(client)["id"]
    assert listing(client, home)["items"] == []
    add_bill(client, home, "2026-07-01", "2026-07-30", "300")
    client.post(rec_url(home, "refresh"))
    (r,) = listing(client, home)["items"]
    assert r["rule_id"] == "declare-equipment" and r["savings_kwh_month"] is None
    assert listing(client, home)["total_savings_kwh_month"] is None


def test_recommendations_are_isolated_between_homes_and_cascade_with_the_home(client, migrated):
    one, two = mk_home(client)["id"], mk_home(client, name="Otra")["id"]
    add_eq(client, one)
    (r,) = listing(client, one)["items"]
    assert listing(client, two)["items"] == []
    assert client.patch(rec_url(two, r["id"]), json={"status": "dismissed"}).status_code == 404
    assert client.patch(rec_url(one, str(uuid.uuid4())), json={"status": "dismissed"}).status_code == 404
    assert client.delete(f"/api/v1/homes/{one}").status_code == 204
    with migrated.connect() as c:
        assert c.execute(text("SELECT count(*) FROM recommendations")).scalar() == 0


def test_strangers_cannot_read_refresh_or_change_recommendations(auth_client):
    alice, bob = register(auth_client), register(auth_client, "bob@example.com")
    home = auth_client.post("/api/v1/homes", headers=bearer(alice), json={"name": "Casa", "distributor": "EDESUR"}).json()["id"]
    for method, path, body in (("GET", rec_url(home), None), ("POST", rec_url(home, "refresh"), None),
                               ("GET", rec_url(home, "goal-proposal"), None), ("POST", rec_url(home, "goal-proposal", "apply"), None),
                               ("PATCH", rec_url(home, str(uuid.uuid4())), {"status": "applied"})):
        assert auth_client.request(method, path, headers=bearer(bob), json=body).status_code == 404, (method, path)
        assert auth_client.request(method, path).status_code == 401, (method, path)


def test_input_validation(client):
    home = mk_home(client)["id"]
    add_eq(client, home)
    (r,) = listing(client, home)["items"]
    for bad in ({"status": "resolved"}, {"status": "nope"}, {"status": "applied", "title": "hack"}, {}):
        assert client.patch(rec_url(home, r["id"]), json=bad).status_code == 422, bad
    assert client.get(rec_url(home), params={"status": "x"}).status_code == 422
    assert client.get(rec_url(home), params={"limit": 0}).status_code == 422


def test_a_failing_engine_never_breaks_the_equipment_write(client, monkeypatch):
    home = mk_home(client)["id"]
    monkeypatch.setattr(service, "gather_facts", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("boom")))
    eq = add_eq(client, home)
    assert client.get(eq_url(home, eq["id"])).status_code == 200
    assert listing(client, home)["items"] == []


# ---------- base de datos ----------
def test_the_database_rejects_inconsistent_rows(client, migrated):
    home = mk_home(client)["id"]
    base = ("INSERT INTO recommendations(id,home_id,rule_id,rule_version,ruleset_version,category,title,summary,action,confidence,"
            "dedupe_key,savings_kwh_month,savings_dop_month) VALUES(gen_random_uuid(),:h,'r',1,1,'equipment','t','s','a','low','k{n}',{kwh},{dop})")
    with migrated.begin() as c:
        c.execute(text(base.format(n=0, kwh="5", dop="50")), {"h": home})
    bad = [base.format(n=1, kwh="-1", dop="NULL"), base.format(n=2, kwh="NULL", dop="10"), base.format(n=3, kwh="5", dop="-2"),
           base.format(n=4, kwh="5", dop="5").replace("'low'", "'sure'"), base.format(n=5, kwh="5", dop="5").replace("'equipment'", "'misc'"),
           base.format(n=6, kwh="5", dop="5").replace(",1,1,'equipment'", ",0,1,'equipment'"), base.format(n=0, kwh="5", dop="5")]
    for statement in bad:
        with pytest.raises((IntegrityError, DBAPIError)):
            with migrated.begin() as c:
                c.execute(text(statement), {"h": home})


# ---------- ERD-SAVE-01-CLOSE: dificultad, impacto y «Aplicar objetivo» ----------
def test_every_recommendation_exposes_difficulty_and_impact_from_fixed_rules(client):
    home = mk_home(client)["id"]
    add_bill(client, home, "2026-07-01", "2026-07-30", "300", amount="3900")
    add_eq(client, home)                                            # 45 kWh/mes → impacto alto
    add_eq(client, home, name="Calentador", kind="water_heater", power_w="2000", hours_per_day="1")   # 30 kWh → medio
    items = {i["rule_id"]: i for i in listing(client, home)["items"] if i["category"] == "equipment"}
    assert (items["ac-one-hour"]["difficulty"], items["ac-one-hour"]["impact"]) == ("easy", "high")
    assert items["water-heater-half-hour"]["impact"] == "medium"
    assert engine.impact_for(None) is None and engine.impact_for(Decimal("9.99")) == "low" and engine.difficulty_for("desconocida") == "medium"


def test_goal_proposal_is_average_minus_estimated_savings_and_saves_nothing(client):
    home = mk_home(client)["id"]
    empty = client.get(rec_url(home, "goal-proposal")).json()
    assert empty["proposal"] is None and empty["bills_used"] == 0 and "factura" in empty["reason"]
    add_bill(client, home, "2026-07-01", "2026-07-30", "300", amount="3900")
    add_bill(client, home, "2026-08-01", "2026-08-30", "320", amount="4160")
    no_equipment = client.get(rec_url(home, "goal-proposal")).json()
    assert no_equipment["proposal"] is None and no_equipment["baseline"]["value"] == "310.00" and no_equipment["baseline"]["quality"] == "REAL"
    add_eq(client, home)
    out = client.get(rec_url(home, "goal-proposal")).json()
    assert out["baseline"]["value"] == "310.00" and out["potential_savings"] == {"value": "45.00", "unit": "kWh/mes", "quality": "ESTIMATED"}
    assert out["proposal"]["quality"] == "ESTIMATED" and Decimal(out["proposal"]["value"]) == 265
    assert out["current_goal_kwh"] is None and out["assumptions"]
    assert client.get(f"/api/v1/homes/{home}/goal").json() is None      # solo lectura: nada se guardó


def test_apply_goal_saves_the_server_proposal_and_keeps_the_peso_goal(client):
    home = mk_home(client)["id"]
    add_bill(client, home, "2026-07-01", "2026-07-30", "300", amount="3900")
    add_eq(client, home)
    assert client.put(f"/api/v1/homes/{home}/goal", json={"monthly_amount_rd": "5000"}).status_code == 200
    applied = client.post(rec_url(home, "goal-proposal", "apply"), json={"monthly_kwh": "1"})        # cifras del cliente se ignoran
    assert applied.status_code == 200, applied.text
    body = applied.json()
    assert Decimal(body["monthly_kwh"]) == 255 and Decimal(body["monthly_amount_rd"]) == 5000
    assert client.get(rec_url(home, "goal-proposal")).json()["current_goal_kwh"] == "255.00"


def test_apply_goal_without_a_proposal_is_409(client):
    home = mk_home(client)["id"]
    r = client.post(rec_url(home, "goal-proposal", "apply"))
    assert r.status_code == 409 and r.json()["code"] == "no_goal_proposal"
    assert client.get(f"/api/v1/homes/{home}/goal").json() is None
