import uuid

import pytest

BILL = {"period_start": "2026-08-01", "period_end": "2026-08-31", "kwh": "250.5", "amount_dop": "3100", "days": 31}


def mk_home(client, **kw):
    body = {"name": "Casa", "distributor": "EDESUR", **kw}
    r = client.post("/api/v1/homes", json=body)
    assert r.status_code == 201, r.text
    return r.json()


def bill_url(home_id, *rest):
    return "/".join([f"/api/v1/homes/{home_id}/bills", *rest])


# ---------- runtime ----------
def test_health_checks_database(client):
    r = client.get("/health")
    assert r.status_code == 200 and r.json() == {"status": "healthy", "database": "ok"}


def test_openapi_exposes_core_routes(client):
    r = client.get("/openapi.json")
    assert r.status_code == 200
    paths = r.json()["paths"]
    for p in ["/api/v1/homes", "/api/v1/homes/{home_id}", "/api/v1/homes/{home_id}/bills",
              "/api/v1/homes/{home_id}/bills/{bill_id}", "/api/v1/homes/{home_id}/dashboard"]:
        assert p in paths, p
    assert client.get("/docs").status_code == 200


def test_cors_allows_configured_origin_only(client):
    ok = client.options("/api/v1/homes", headers={"Origin": "http://localhost:3000",
                                                 "Access-Control-Request-Method": "GET"})
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:3000"
    bad = client.options("/api/v1/homes", headers={"Origin": "https://evil.example",
                                                  "Access-Control-Request-Method": "GET"})
    assert "access-control-allow-origin" not in bad.headers


# ---------- homes ----------
def test_homes_crud(client):
    h = mk_home(client, code="T-1", city="Santiago", distributor="EDENORTE")
    assert client.get(f"/api/v1/homes/{h['id']}").json()["distributor"] == "EDENORTE"
    assert len(client.get("/api/v1/homes").json()) == 1
    r = client.patch(f"/api/v1/homes/{h['id']}", json={"name": "Nueva", "distributor": "Otra"})
    assert r.status_code == 200 and r.json()["name"] == "Nueva" and r.json()["distributor"] == "Otra"
    assert client.delete(f"/api/v1/homes/{h['id']}").status_code == 204
    assert client.get(f"/api/v1/homes/{h['id']}").status_code == 404


@pytest.mark.parametrize("body", [
    {"name": "x", "distributor": "EDEFOO"},
    {"name": "", "distributor": "EDESUR"},
    {"distributor": "EDESUR"},
    {"name": "x", "distributor": "edesur"},
])
def test_home_invalid_is_422(client, body):
    assert client.post("/api/v1/homes", json=body).status_code == 422


def test_home_patch_rejects_null_and_unknown_distributor(client):
    h = mk_home(client)
    assert client.patch(f"/api/v1/homes/{h['id']}", json={"distributor": "X"}).status_code == 422
    assert client.patch(f"/api/v1/homes/{h['id']}", json={"name": None}).status_code == 422


def test_duplicate_home_code_is_409(client):
    mk_home(client, code="DUP")
    assert client.post("/api/v1/homes", json={"name": "b", "distributor": "EDESUR", "code": "DUP"}).status_code == 409


def test_unknown_or_malformed_home_id(client):
    assert client.get(f"/api/v1/homes/{uuid.uuid4()}").status_code == 404
    assert client.get("/api/v1/homes/not-a-uuid").status_code == 422


# ---------- bills ----------
def test_bills_crud(client):
    h = mk_home(client)
    r = client.post(bill_url(h["id"]), json=BILL)
    assert r.status_code == 201, r.text
    bill = r.json()
    assert bill["source"] == "manual" and bill["home_id"] == h["id"]
    assert client.get(bill_url(h["id"], bill["id"])).json()["kwh"] in ("250.50", "250.5")
    assert len(client.get(bill_url(h["id"])).json()) == 1
    upd = {**BILL, "kwh": "300", "days": 30}
    r = client.put(bill_url(h["id"], bill["id"]), json=upd)
    assert r.status_code == 200 and float(r.json()["kwh"]) == 300
    assert client.delete(bill_url(h["id"], bill["id"])).status_code == 204
    assert client.get(bill_url(h["id"], bill["id"])).status_code == 404


@pytest.mark.parametrize("patch", [
    {"kwh": "-1"}, {"amount_dop": "-0.01"}, {"days": -1},
    {"period_start": "2026-09-01", "period_end": "2026-08-01"},
    {"days": 5000},
    {"kwh": "abc"},
    {"kwh": "99999999999999"},                       # excede Numeric(12,2)
    {"reading_previous": "100", "reading_current": "50"},
    {"reading_current": "-1"},
    {"source": "seed"},                               # seed no se puede crear por API
])
def test_invalid_bill_is_4xx(client, patch):
    h = mk_home(client)
    r = client.post(bill_url(h["id"]), json={**BILL, **patch})
    assert 400 <= r.status_code < 500, (patch, r.status_code)


def test_bill_for_missing_home_is_404(client):
    assert client.post(bill_url(uuid.uuid4()), json=BILL).status_code == 404
    assert client.get(bill_url(uuid.uuid4())).status_code == 404


def test_overlapping_period_is_409(client):
    h = mk_home(client)
    assert client.post(bill_url(h["id"]), json=BILL).status_code == 201
    r = client.post(bill_url(h["id"]), json={**BILL, "period_start": "2026-08-15", "period_end": "2026-09-14"})
    assert r.status_code == 409
    assert client.post(bill_url(h["id"]), json=BILL).status_code == 409  # duplicado exacto


def test_bill_cannot_be_read_via_other_home(client):
    h1, h2 = mk_home(client), mk_home(client)
    b = client.post(bill_url(h1["id"]), json=BILL).json()
    assert client.get(bill_url(h2["id"], b["id"])).status_code == 404
    assert client.delete(bill_url(h2["id"], b["id"])).status_code == 404
    assert client.get(bill_url(h2["id"])).json() == []


def test_zero_values_are_accepted(client):
    h = mk_home(client)
    r = client.post(bill_url(h["id"]), json={**BILL, "kwh": "0", "amount_dop": "0", "days": 0})
    assert r.status_code == 201


def test_delete_home_cascades_bills(client):
    h = mk_home(client)
    client.post(bill_url(h["id"]), json=BILL)
    assert client.delete(f"/api/v1/homes/{h['id']}").status_code == 204
    assert client.get(bill_url(h["id"])).status_code == 404


def _render_bill_image():
    from io import BytesIO
    from PIL import Image, ImageDraw
    img = Image.new("RGB", (900, 400), "white")
    d = ImageDraw.Draw(img)
    d.text((20, 20), "EDESUR DOMINICANA", fill="black")
    d.text((20, 60), "Periodo del 01/08/2026 al 31/08/2026 (31 dias)", fill="black")
    d.text((20, 100), "Lectura anterior: 1000 kWh", fill="black")
    d.text((20, 140), "Lectura actual: 1300 kWh", fill="black")
    d.text((20, 180), "Consumo del periodo: 300 kWh", fill="black")
    d.text((20, 220), "Total a pagar: RD$ 4520.75", fill="black")
    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_ocr_endpoint_returns_a_draft_never_creates_a_bill(client):
    """ERD-OCR-01: 'nunca OCR -> BD'; el único camino real sigue siendo POST /bills ya existente."""
    home = mk_home(client)["id"]
    png = _render_bill_image()
    before = client.get(f"/api/v1/homes/{home}/bills").json()
    r = client.post(f"/api/v1/homes/{home}/bills/ocr", files={"file": ("factura.png", png, "image/png")})
    assert r.status_code == 200
    body = r.json()
    assert "amount_dop" in body and "warnings" in body and "raw_text_excerpt" in body
    after = client.get(f"/api/v1/homes/{home}/bills").json()
    assert after == before


def test_ocr_endpoint_rejects_unreadable_file(client):
    home = mk_home(client)["id"]
    r = client.post(f"/api/v1/homes/{home}/bills/ocr",
                    files={"file": ("no-es-imagen.png", b"esto no es una imagen", "image/png")})
    assert r.status_code == 422


def test_ocr_endpoint_rejects_file_over_10mb(client):
    home = mk_home(client)["id"]
    huge = b"\x00" * (10 * 1024 * 1024 + 1)
    r = client.post(f"/api/v1/homes/{home}/bills/ocr", files={"file": ("grande.png", huge, "image/png")})
    assert r.status_code == 422
