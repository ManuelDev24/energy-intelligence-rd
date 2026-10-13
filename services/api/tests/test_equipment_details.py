"""ERD-DEV-02: tipo, marca, modelo, icono y porcentaje de consumo por equipo (calculado en el servidor)."""
from decimal import Decimal

import pytest

from app.models.equipment import EQUIPMENT_ICONS, EQUIPMENT_KINDS
from app.services.calculations import shares_pct
from tests.test_api_homes_bills import mk_home
from tests.test_api_insights import EQ, eq_url


def add(client, home_id, **over):
    r = client.post(eq_url(home_id), json={**EQ, **over})
    assert r.status_code == 201, r.text
    return r.json()


def test_catalogs_have_matching_lengths_and_no_duplicates():
    assert len(EQUIPMENT_KINDS) == len(EQUIPMENT_ICONS) == len(set(EQUIPMENT_KINDS)) == len(set(EQUIPMENT_ICONS))
    assert "other" in EQUIPMENT_KINDS


def test_old_payload_still_works_and_defaults_to_other(client):
    h = mk_home(client)
    e = add(client, h["id"])
    assert (e["kind"], e["brand"], e["model"], e["icon"]) == ("other", None, None, None)


def test_details_are_saved_trimmed_and_updated(client):
    h = mk_home(client)
    e = add(client, h["id"], name="Aire sala", kind="air_conditioner", brand="  Samsung ", model=" AR12 ", icon="fan")
    assert (e["kind"], e["brand"], e["model"], e["icon"]) == ("air_conditioner", "Samsung", "AR12", "fan")
    r = client.put(eq_url(h["id"], e["id"]), json={**EQ, "kind": "refrigerator", "brand": "   ", "model": None})
    assert r.status_code == 200
    got = client.get(eq_url(h["id"], e["id"])).json()
    assert (got["kind"], got["brand"], got["model"], got["icon"]) == ("refrigerator", None, None, None)


@pytest.mark.parametrize(
    "patch",
    [{"kind": "spaceship"}, {"kind": ""}, {"icon": "skull"}, {"brand": "x" * 61}, {"model": "x" * 61}, {"kind": None}],
)
def test_invalid_details_are_422(client, patch):
    h = mk_home(client)
    assert client.post(eq_url(h["id"]), json={**EQ, **patch}).status_code == 422


def test_database_rejects_values_outside_the_catalog(session):
    db = session
    from sqlalchemy.exc import IntegrityError

    from app.models import Equipment, Home

    home = Home(code="DEV02", name="x", city="y", distributor="EDENORTE")
    db.add(home)
    db.flush()
    for bad in ({"kind": "toaster"}, {"icon": "skull"}):
        with pytest.raises(IntegrityError):
            with db.begin_nested():
                db.add(Equipment(home_id=home.id, name="n", power_w=1, hours_per_day=1, **bad))
                db.flush()


def test_share_is_computed_server_side_and_sums_to_100(client):
    h = mk_home(client)
    add(client, h["id"], name="A", power_w="1000", hours_per_day="1")   # 1 kWh/día
    add(client, h["id"], name="B", power_w="1000", hours_per_day="1")
    add(client, h["id"], name="C", power_w="1000", hours_per_day="1")
    items = client.get(eq_url(h["id"], "estimate")).json()["items"]
    shares = [Decimal(i["share_pct"]["value"]) for i in items]
    assert sorted(shares) == [Decimal("33.33"), Decimal("33.33"), Decimal("33.34")]
    assert sum(shares) == Decimal("100.00")
    assert all(i["share_pct"]["quality"] == "ESTIMATED" and i["share_pct"]["unit"] == "%" for i in items)


def test_share_follows_the_declared_hours_and_carries_the_details(client):
    h = mk_home(client)
    add(client, h["id"], name="Aire", kind="air_conditioner", brand="LG", model="X1", power_w="1500", hours_per_day="6")
    add(client, h["id"], name="Nevera", kind="refrigerator", power_w="150", hours_per_day="24")
    by_name = {i["name"]: i for i in client.get(eq_url(h["id"], "estimate")).json()["items"]}
    # 9 kWh/día contra 3,6 kWh/día
    assert Decimal(by_name["Aire"]["share_pct"]["value"]) == Decimal("71.43")
    assert Decimal(by_name["Nevera"]["share_pct"]["value"]) == Decimal("28.57")
    assert (by_name["Aire"]["kind"], by_name["Aire"]["brand"], by_name["Aire"]["model"]) == ("air_conditioner", "LG", "X1")
    assert by_name["Nevera"]["brand"] is None


def test_share_is_zero_when_nothing_consumes_and_empty_has_no_items(client):
    h = mk_home(client)
    assert client.get(eq_url(h["id"], "estimate")).json()["items"] == []
    add(client, h["id"], name="Apagado", power_w="500", hours_per_day="0")
    item = client.get(eq_url(h["id"], "estimate")).json()["items"][0]
    assert Decimal(item["share_pct"]["value"]) == 0


def test_estimate_note_says_the_share_is_not_of_the_bill(client):
    h = mk_home(client)
    assert "no de la factura" in client.get(eq_url(h["id"], "estimate")).json()["note"]


def test_shares_pct_properties():
    assert shares_pct([]) == []
    assert shares_pct([Decimal(0), Decimal(0)]) == [Decimal("0.00")] * 2
    assert shares_pct([Decimal(5)]) == [Decimal("100.00")]
    for raw in ([1, 1, 1], [1, 2, 3, 4, 5, 6, 7], [10_000, 1, 1], [7, 7, 7, 7, 7, 7]):
        got = shares_pct([Decimal(x) for x in raw])
        assert sum(got) == Decimal("100.00")
        assert all(g >= 0 for g in got)
