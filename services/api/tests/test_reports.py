"""ERD-RPT-01: GET /homes/{id}/reports/energy — informe por período con calidad por cifra, comparación y límites honestos."""
from datetime import date
from decimal import Decimal

from app.services import reports
from tests.test_api_homes_bills import mk_home
from tests.test_api_insights import add_bill, eq_url
from tests.test_auth import auth_client, bearer, register  # noqa: F401

D = Decimal


def url(home, **params):
    q = "&".join(f"{k}={v}" for k, v in params.items())
    return f"/api/v1/homes/{home}/reports/energy" + (f"?{q}" if q else "")


def seeded(client):
    home = mk_home(client, province="Santo Domingo", municipality="Distrito Nacional")["id"]
    add_bill(client, home, "2026-04-01", "2026-04-30", "280", amount="3640")     # período anterior
    add_bill(client, home, "2026-05-01", "2026-05-30", "300", amount="3900")
    add_bill(client, home, "2026-06-01", "2026-06-30", "340", amount="4420")
    return home


def test_report_totals_comparison_and_quality_labels(client):
    home = seeded(client)
    r = client.get(url(home, **{"from": "2026-05-01", "to": "2026-06-30"}))
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["period"] == {"period_from": "2026-05-01", "period_to": "2026-06-30", "days": 61}
    assert [b["kwh"]["value"] for b in out["bills"]] == ["300.00", "340.00"]
    assert out["totals"]["kwh"] == {"value": "640.00", "unit": "kWh", "quality": "REAL"}
    assert out["totals"]["amount_dop"] == {"value": "8320.00", "unit": "RD$", "quality": "REAL"}
    assert out["totals"]["avg_price_per_kwh"] == {"value": "13.00", "unit": "RD$/kWh", "quality": "ESTIMATED"}
    assert out["peak_bill"]["kwh"]["value"] == "340.00"
    cmp = out["comparison"]
    assert (cmp["previous_from"], cmp["previous_to"]) == ("2026-03-01", "2026-04-30")
    assert cmp["previous_kwh"]["value"] == "280.00" and cmp["kwh_pct"]["quality"] == "ESTIMATED" and D(cmp["kwh_pct"]["value"]) > 100
    assert out["home"]["province"] == "Santo Domingo" and out["home"]["municipality"] == "Distrito Nacional"
    assert set(out["home"]) == {"id", "name", "distributor", "province", "municipality"} and out["home"]["id"] == out["home_id"] == home
    assert "address" not in out["home"] and "account_number" not in str(out)
    assert any("mensuales" in n for n in out["notes"]) and out["sources"][0]["quality"] == "REAL"


def test_report_without_bills_says_so_and_invents_nothing(client):
    home = mk_home(client)["id"]
    out = client.get(url(home, **{"from": "2026-05-01", "to": "2026-05-31"})).json()
    assert out["bills"] == [] and out["peak_bill"] is None and out["comparison"] is None
    assert out["totals"] == {"bills_count": 0, "kwh": None, "amount_dop": None, "avg_price_per_kwh": None, "avg_kwh_per_bill": None}
    assert out["sources"] == [] and any("No hay facturas" in n for n in out["notes"])


def test_report_marks_equipment_and_recommendations_as_estimated(client):
    home = seeded(client)
    client.post(eq_url(home), json={"name": "Aire sala", "room": "Sala", "power_w": "1500", "hours_per_day": "6", "kind": "air_conditioner"})
    out = client.get(url(home, **{"from": "2026-05-01", "to": "2026-06-30"})).json()
    assert out["equipment"][0]["share_pct"]["quality"] == "ESTIMATED" and out["equipment"][0]["monthly_kwh"]["quality"] == "ESTIMATED"
    rec = out["recommendations"][0]
    assert rec["savings_kwh_month"]["quality"] == "ESTIMATED" and rec["difficulty"] == "easy" and rec["impact"] == "high"
    assert {s["quality"] for s in out["sources"]} == {"REAL", "ESTIMATED"}
    assert any("estimación" in n or "estimaciones" in n for n in out["notes"])


def test_period_validation(client):
    home = mk_home(client)["id"]
    for params in ({"from": "2026-06-30", "to": "2026-06-01"}, {"from": "2020-01-01", "to": "2026-06-01"}, {"to": "2999-01-01"}, {"from": "no-fecha"}):
        assert client.get(url(home, **params)).status_code in (400, 422), params
    assert client.get(url(home)).status_code == 200      # por defecto: últimos 365 días hasta hoy
    assert client.get(url(home)).headers["Cache-Control"] == "no-store"


def test_resolve_period_defaults_use_santo_domingo_day():
    start, end = reports.resolve_period(None, None, today=date(2026, 10, 14))
    assert (end, (end - start).days + 1) == (date(2026, 10, 14), 365)


def test_report_is_private_to_the_home(auth_client):
    alice, bob = register(auth_client), register(auth_client, "bob@example.com")
    home = auth_client.post("/api/v1/homes", headers=bearer(alice), json={"name": "Casa", "distributor": "EDESUR"}).json()["id"]
    assert auth_client.get(url(home), headers=bearer(alice)).status_code == 200
    assert auth_client.get(url(home), headers=bearer(bob)).status_code == 404
    assert auth_client.get(url(home)).status_code == 401


# ---------- PDF ----------
def pdf_text(content: bytes) -> str:
    import pypdfium2 as pdfium
    doc = pdfium.PdfDocument(content)
    try:
        return "\n".join(doc[i].get_textpage().get_text_range() for i in range(len(doc)))
    finally:
        doc.close()


def test_pdf_has_the_same_content_labels_and_safe_headers(client):
    home = seeded(client)
    client.post(eq_url(home), json={"name": "Aire <b>sala</b> & co", "room": "Sala", "power_w": "1500", "hours_per_day": "6", "kind": "air_conditioner"})
    r = client.get(f"/api/v1/homes/{home}/reports/energy.pdf", params={"from": "2026-05-01", "to": "2026-06-30"})
    assert r.status_code == 200 and r.content.startswith(b"%PDF")
    assert r.headers["content-type"] == "application/pdf" and r.headers["Cache-Control"] == "private, no-store"
    assert r.headers["Content-Disposition"] == 'attachment; filename="informe-energetico-2026-05-01-2026-06-30.pdf"'
    assert r.headers["X-Content-Type-Options"] == "nosniff"
    text = pdf_text(r.content)
    for expected in ("Informe energético", "Consumo total", "640 kWh", "RD$ 8,320.00", "Precio medio (estimado)", "Equipos que más pesan (estimado)",
                     "Aire <b>sala</b> & co", "Fuentes", "no tiene medición diaria ni por hora", "no son mediciones ni garantías"):
        assert expected in text, expected
    assert len(r.content) < 200_000


def test_pdf_without_bills_says_so(client):
    home = mk_home(client)["id"]
    text = pdf_text(client.get(f"/api/v1/homes/{home}/reports/energy.pdf", params={"from": "2026-01-01", "to": "2026-01-31"}).content)
    assert "No hay facturas registradas en este período." in text and "Consumo total" not in text


def test_pdf_period_validation_matches_the_json_report(client):
    home = mk_home(client)["id"]
    assert client.get(f"/api/v1/homes/{home}/reports/energy.pdf", params={"from": "2026-06-30", "to": "2026-06-01"}).status_code == 422


def test_signed_link_downloads_the_pdf_without_a_session_and_expires(auth_client, migrated, monkeypatch):
    from datetime import datetime, timedelta, timezone
    from app.services import report_link
    alice, bob = register(auth_client), register(auth_client, "bob@example.com")
    home = auth_client.post("/api/v1/homes", headers=bearer(alice), json={"name": "Casa", "distributor": "EDESUR"}).json()["id"]
    link = auth_client.post(f"/api/v1/homes/{home}/reports/energy/pdf-link", params={"from": "2026-01-01", "to": "2026-01-31"}, headers=bearer(alice))
    assert link.status_code == 200 and link.headers["Cache-Control"] == "no-store"
    url = link.json()["url"]
    assert url.startswith("/api/v1/reports/download?token=rpt1.")
    got = auth_client.get(url)                                           # sin Authorization: la firma sustituye a la sesión
    assert got.status_code == 200 and got.content.startswith(b"%PDF") and got.headers["content-type"] == "application/pdf"
    assert auth_client.post(f"/api/v1/homes/{home}/reports/energy/pdf-link", headers=bearer(bob)).status_code == 404
    assert auth_client.post(f"/api/v1/homes/{home}/reports/energy/pdf-link").status_code == 401
    token = url.split("token=")[1]
    for bad in (token[:-2] + "xx", "rpt1.abc.def", "v1." + token.split(".", 1)[1], "x" * 40):
        assert auth_client.get("/api/v1/reports/download", params={"token": bad}).status_code in (404, 422), bad
    past = datetime.now(timezone.utc) + timedelta(seconds=report_link.TTL_SECONDS + 5)
    import pytest
    from app.services.errors import NotFound
    with pytest.raises(NotFound):
        report_link.verify_report(token, now=past)
    # Quien deja la vivienda pierde el enlace aunque no haya vencido.
    with migrated.begin() as c:
        c.execute(__import__("sqlalchemy").text("DELETE FROM home_members WHERE user_id = (SELECT id FROM users WHERE email = 'alice@example.com')"))
    assert auth_client.get(url).status_code == 404


def test_a_document_token_is_not_a_report_token():
    import uuid
    from datetime import date
    from app.services import report_link
    from app.services.storage.signing import sign_download, verify_download
    doc_token, _ = sign_download(uuid.uuid4(), uuid.uuid4(), None)
    rep_token, _ = report_link.sign_report(uuid.uuid4(), None, date(2026, 1, 1), date(2026, 1, 31))
    import pytest
    from app.services.errors import NotFound
    with pytest.raises(NotFound):
        report_link.verify_report(doc_token)
    with pytest.raises(NotFound):
        verify_download(rep_token)
