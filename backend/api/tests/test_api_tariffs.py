"""ERD-TARIFF-01: tarifas publicadas (BTS-1 oct–dic 2026 cargada por 0008) y resolución por fecha."""
from datetime import date
from decimal import Decimal as D

from sqlalchemy import text
from sqlalchemy.orm import Session

from tests.test_auth import auth_client  # noqa: F401  (fixture)

URL = "/api/v1/tariffs"


def test_lists_official_bts1_with_source(client):
    body = client.get(URL, params={"distributor": "EDESUR", "on": "2026-10-15"}).json()
    assert len(body) == 1
    t = body[0]
    assert (t["distributor"], t["tariff_code"], t["effective_from"], t["effective_to"]) == (
        "EDESUR", "BTS-1", "2026-10-01", "2026-12-31")
    assert t["source_resolution"] == "SIE-121-2026-TF"
    assert t["source_url"] == "https://sie.gob.do/document/sie-121-2026-tf/"
    assert "Transición" in t["scope_note"]
    assert float(t["flat_all_units_from_kwh"]) == 701
    assert [(float(f["from_kwh"]), f["to_kwh"] and float(f["to_kwh"]), float(f["amount_rd"])) for f in t["fixed_charges"]] == [
        (0, 100, 42.10), (100, None, 128.59)]
    assert [float(b["price_rd_per_kwh"]) for b in t["blocks"]] == [6.05, 8.59, 12.89, 13.09]


def test_lists_all_distributors_without_filters_sorted(client):
    body = client.get(URL).json()
    assert [t["distributor"] for t in body] == ["EDEESTE", "EDENORTE", "EDESUR"]


def test_no_tariff_outside_validity_or_for_otra_returns_empty_list(client):
    assert client.get(URL, params={"distributor": "EDESUR", "on": "2027-01-01"}).json() == []
    assert client.get(URL, params={"distributor": "EDESUR", "on": "2026-09-30"}).json() == []
    assert client.get(URL, params={"distributor": "Otra"}).json() == []


def test_empty_tariff_table_is_handled(client, migrated):
    with migrated.begin() as c:
        c.execute(text("DELETE FROM tariffs"))
    assert client.get(URL).json() == []


def test_invalid_filters_are_422(client):
    assert client.get(URL, params={"distributor": "edesur"}).status_code == 422
    assert client.get(URL, params={"on": "2026-13-01"}).status_code == 422
    assert client.get(URL, params={"limit": 0}).status_code == 422


def test_tariffs_are_public_even_with_auth_enabled(auth_client):  # noqa: F811
    r = auth_client.get(URL, params={"distributor": "EDENORTE", "on": "2026-12-31"})
    assert r.status_code == 200 and len(r.json()) == 1


# ---------- resolución y costo (servicio) ----------
def test_resolve_tariff_for_date_and_cost_golden(migrated):
    from app.services.tariffs import estimate_cost, resolve_tariff
    with Session(migrated) as db:
        res = resolve_tariff(db, "EDESUR", date(2026, 11, 1))
        assert res.status == "available" and res.tariff.source_resolution == "SIE-121-2026-TF"
        est = estimate_cost(db, "EDESUR", date(2026, 11, 1), D("250"))
        assert est.status == "available" and est.breakdown.total_rd == D("1768.09")
        assert est.source_resolution == "SIE-121-2026-TF"


def test_resolve_after_validity_is_tariff_unavailable_never_reused(migrated):
    from app.services.tariffs import estimate_cost, resolve_tariff
    with Session(migrated) as db:
        res = resolve_tariff(db, "EDESUR", date(2027, 1, 1))
        assert res.status == "tariff_unavailable" and res.tariff is None and res.reason
        est = estimate_cost(db, "EDESUR", date(2027, 1, 1), D("250"))
        assert est.status == "tariff_unavailable" and est.breakdown is None
        assert resolve_tariff(db, "Otra", date(2026, 11, 1)).status == "tariff_unavailable"


def test_resolve_with_empty_table_is_tariff_unavailable(migrated):
    from app.services.tariffs import resolve_tariff
    with migrated.begin() as c:
        c.execute(text("DELETE FROM tariffs"))
    with Session(migrated) as db:
        assert resolve_tariff(db, "EDESUR", date(2026, 11, 1)).status == "tariff_unavailable"
