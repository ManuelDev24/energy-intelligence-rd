"""ERD-CLAIM-01: reclamaciones — evidencia neutral congelada, duplicados, límites, historial, cierre y aislamiento."""
import uuid

from sqlalchemy import text

from tests.test_api_homes_bills import mk_home
from tests.test_api_insights import add_bill
from tests.test_auth import auth_client, bearer, register  # noqa: F401


def url(home, *rest):
    return "/".join([f"/api/v1/homes/{home}/claims", *rest])


def seeded(client):
    home = mk_home(client)["id"]
    first = add_bill(client, home, "2026-07-01", "2026-07-30", "300", amount="3900.00")
    second = add_bill(client, home, "2026-08-01", "2026-08-30", "390", amount="5460.00")
    return home, first["id"], second["id"]


def body(bill=None, **over):
    return {"kind": "billing_error", "bill_id": bill, "subject": "Cobro mayor al esperado", "description": "Creo que el cobro de agosto es más alto de lo normal.", **over}


def test_create_freezes_a_neutral_summary_with_comparison(client):
    home, first, second = seeded(client)
    r = client.post(url(home), json=body(second, disputed_amount_dop="500.00", reference_number=" R-1 "))
    assert r.status_code == 201, r.text
    out = r.json()
    assert out["status"] == "open" and out["reference_number"] == "R-1" and out["disputed_amount_dop"] == "500.00"
    assert "no afirma que la distribuidora haya cometido un error" in out["disclaimer"]
    ev = out["evidence"]
    assert ev["bill"]["kwh"] == {"value": "390.00", "unit": "kWh", "quality": "REAL"}
    assert ev["previous"]["kwh"]["value"] == "300.00" and ev["previous"]["kwh_pct"] == {"value": "30.00", "unit": "%", "quality": "ESTIMATED"}
    assert "no demuestra por sí sola un error" in ev["note"] and ev["readings_in_period"] == 0 and ev["document_id"] is None
    assert [e["kind"] for e in out["events"]] == ["created"] and out["events"][0]["actor"] == "user"


def test_first_bill_has_no_comparison_and_evidence_does_not_change_later(client):
    home, first, second = seeded(client)
    claim = client.post(url(home), json=body(first)).json()
    assert claim["evidence"]["previous"] is None
    assert client.put(f"/api/v1/homes/{home}/bills/{first}", json={"period_start": "2026-07-01", "period_end": "2026-07-30", "days": 30, "kwh": "999", "amount_dop": "9999"}).status_code == 200
    again = client.get(url(home, claim["id"])).json()
    assert again["evidence"]["bill"]["kwh"]["value"] == "300.00"          # congelado al crear


def test_validation_rules(client):
    home, first, second = seeded(client)
    assert client.post(url(home), json=body(None)).status_code == 422                                  # error de cobro exige factura
    assert client.post(url(home), json=body(first, subject="ab")).status_code == 422
    assert client.post(url(home), json=body(first, description="corto")).status_code == 422
    assert client.post(url(home), json=body(first, disputed_amount_dop="0")).status_code == 422
    assert client.post(url(home), json=body(first, extra="x")).status_code == 422
    assert client.post(url(home), json=body(str(uuid.uuid4()))).status_code == 404                     # factura inexistente
    other = client.post(url(home), json={"kind": "service_quality", "subject": "Voltaje bajo", "description": "Hay variaciones de voltaje por las noches."})
    assert other.status_code == 201 and other.json()["evidence"] is None and other.json()["bill_id"] is None


def test_one_open_claim_per_bill_and_kind(client):
    home, first, second = seeded(client)
    c = client.post(url(home), json=body(first)).json()
    dup = client.post(url(home), json=body(first))
    assert dup.status_code == 409 and dup.json()["code"] == "claim_conflict"
    assert client.post(url(home), json=body(first, kind="consumption_dispute")).status_code == 201     # otro tipo, misma factura: permitido
    assert client.post(url(home), json=body(second)).status_code == 201                                # otra factura: permitido
    assert client.post(url(home, c["id"], "close")).status_code == 200
    assert client.post(url(home), json=body(first)).status_code == 201                                 # cerrada: se puede abrir otra


def test_notes_reference_close_and_history(client):
    home, first, _ = seeded(client)
    c = client.post(url(home), json=body(first)).json()["id"]
    assert client.post(url(home, c, "notes"), json={"note": "  Llamé a la distribuidora.  "}).status_code == 201
    assert client.post(url(home, c, "notes"), json={"note": "x"}).status_code == 422
    ref = client.put(url(home, c, "reference"), json={"reference_number": " DIST-2026-55 "}).json()
    assert ref["reference_number"] == "DIST-2026-55"
    closed = client.post(url(home, c, "close"), json={"note": "Me dieron la razón."})
    assert closed.status_code == 200 and closed.json()["status"] == "closed" and closed.json()["closed_at"]
    kinds = [(e["kind"], e["status_to"]) for e in closed.json()["events"]]
    assert kinds == [("created", "open"), ("note", None), ("note", None), ("status", "closed")]
    assert closed.json()["events"][1]["note"] == "Llamé a la distribuidora."
    for call in (lambda: client.post(url(home, c, "notes"), json={"note": "otra nota"}), lambda: client.post(url(home, c, "close")),
                 lambda: client.put(url(home, c, "reference"), json={"reference_number": "X"})):
        assert call().status_code == 409                                                               # cerrada: no admite cambios


def test_close_accepts_an_empty_body_and_rejects_unknown_fields(client):
    home, first, second = seeded(client)
    a = client.post(url(home), json=body(first)).json()["id"]
    b = client.post(url(home), json=body(second)).json()["id"]
    assert client.post(url(home, a, "close"), json={}).status_code == 200                              # lo que envían web y móvil sin nota
    assert client.post(url(home, b, "close"), json={"note": "x"}).status_code == 422
    assert client.post(url(home, b, "close"), json={"status": "resolved"}).status_code == 422


def test_limits(client, monkeypatch):
    from app.services import claims
    monkeypatch.setattr(claims, "MAX_OPEN_PER_HOME", 2)
    monkeypatch.setattr(claims, "MAX_EVENTS_PER_CLAIM", 3)
    home, first, second = seeded(client)
    a = client.post(url(home), json=body(first)).json()["id"]
    assert client.post(url(home), json=body(second)).status_code == 201
    limited = client.post(url(home), json={"kind": "other", "subject": "Otro tema", "description": "Descripción suficiente aquí."})
    assert limited.status_code == 409 and limited.json()["code"] == "claim_limit"
    assert client.post(url(home, a, "notes"), json={"note": "nota uno"}).status_code == 201
    assert client.post(url(home, a, "notes"), json={"note": "nota dos"}).status_code == 201
    assert client.post(url(home, a, "notes"), json={"note": "nota tres"}).json()["code"] == "claim_limit"


def test_list_filters_and_orders_newest_first(client):
    home, first, second = seeded(client)
    a = client.post(url(home), json=body(first)).json()["id"]
    b = client.post(url(home), json=body(second)).json()["id"]
    client.post(url(home, a, "close"))
    assert [c["id"] for c in client.get(url(home)).json()] == [b, a]
    assert [c["id"] for c in client.get(url(home), params={"status": "closed"}).json()] == [a]
    assert "evidence" not in client.get(url(home)).json()[0] and client.get(url(home), params={"status": "x"}).status_code == 422


def test_deleting_the_bill_keeps_the_case_and_its_frozen_summary(client):
    home, first, second = seeded(client)
    c = client.post(url(home), json=body(second)).json()["id"]
    assert client.delete(f"/api/v1/homes/{home}/bills/{second}").status_code == 204
    out = client.get(url(home, c)).json()
    assert out["bill_id"] is None and out["evidence"]["bill"]["kwh"]["value"] == "390.00"


def test_claims_are_private_to_the_home_and_cascade_with_it(auth_client, migrated):
    alice, bob = register(auth_client), register(auth_client, "bob@example.com")
    h = lambda t: auth_client.post("/api/v1/homes", headers=bearer(t), json={"name": "Casa", "distributor": "EDESUR"}).json()["id"]
    ha, hb = h(alice), h(bob)
    created = auth_client.post(url(ha), headers=bearer(alice), json={"kind": "other", "subject": "Asunto privado", "description": "Descripción privada suficiente."})
    assert created.status_code == 201
    cid = created.json()["id"]
    assert auth_client.get(url(ha, cid), headers=bearer(bob)).status_code == 404
    assert auth_client.get(url(ha), headers=bearer(bob)).status_code == 404
    assert auth_client.get(url(hb, cid), headers=bearer(bob)).status_code == 404                        # su propia vivienda, caso ajeno
    assert auth_client.post(url(ha, cid, "close"), headers=bearer(bob)).status_code == 404
    assert auth_client.get(url(ha, cid)).status_code == 401
    assert auth_client.get(url(ha, cid), headers=bearer(alice)).json()["events"][0]["kind"] == "created"
    auth_client.delete(f"/api/v1/homes/{ha}", headers=bearer(alice))
    with migrated.connect() as c:
        assert c.execute(text("SELECT count(*) FROM claims")).scalar_one() == 0 and c.execute(text("SELECT count(*) FROM claim_events")).scalar_one() == 0
