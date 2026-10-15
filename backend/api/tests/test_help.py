"""ERD-HELP-01: centro de ayuda público, versionado, con búsqueda sin acentos y vía de contacto honesta."""
from app.config import settings
from app.services import help_content, help_search


def test_index_lists_categories_articles_and_version(client):
    r = client.get("/api/v1/help")
    assert r.status_code == 200
    body = r.json()
    assert body["content_version"] == help_content.CONTENT_VERSION
    assert {c["id"] for c in body["categories"]} == set(help_content.CATEGORIES)
    assert len(body["articles"]) == len(help_content.ARTICLES) and "body" not in body["articles"][0]
    assert r.headers["Cache-Control"] == "public, max-age=300"


def test_every_article_is_consistent_and_readable_by_id(client):
    ids = [a.id for a in help_content.ARTICLES]
    assert len(ids) == len(set(ids))
    for a in help_content.ARTICLES:
        assert a.category in help_content.CATEGORIES and a.title and a.summary and a.body
        assert all("<" not in p and ">" not in p for p in (a.title, a.summary, *a.body)), a.id          # texto simple, sin HTML
        r = client.get(f"/api/v1/help/articles/{a.id}")
        assert r.status_code == 200 and r.json()["body"] == list(a.body)
    assert client.get("/api/v1/help/articles/no-existe").status_code == 404


def test_search_ignores_accents_and_case_and_ranks_title_first(client):
    for q in ("contraseña", "CONTRASENA", "contrasena"):
        found = client.get("/api/v1/help", params={"q": q}).json()["articles"]
        assert found and found[0]["id"] == "olvide-contrasena", q
    ranked = [a["id"] for a in client.get("/api/v1/help", params={"q": "estimado"}).json()["articles"]]
    assert ranked[0] in {"real-estimado", "por-que-estimado-equipos"}
    assert client.get("/api/v1/help", params={"q": "zzzzzz"}).json()["articles"] == []
    assert client.get("/api/v1/help", params={"q": "a"}).json()["articles"] == []            # menos de 2 letras: sin resultados
    both = client.get("/api/v1/help", params={"q": "factura error"}).json()["articles"]
    assert both and all(a["id"] for a in both)


def test_category_filter_and_long_query_rejected(client):
    only = client.get("/api/v1/help", params={"category": "cuenta"}).json()["articles"]
    assert only and {a["category"] for a in only} == {"cuenta"}
    assert client.get("/api/v1/help", params={"q": "x" * 81}).status_code == 422


def test_contact_never_invents_an_email(client, monkeypatch):
    monkeypatch.setattr(settings, "SUPPORT_EMAIL", "")
    none = client.get("/api/v1/help").json()["contact"]
    assert none["email"] is None and "no está configurado" in none["note"]
    monkeypatch.setattr(settings, "SUPPORT_EMAIL", " soporte@example.com ")
    some = client.get("/api/v1/help").json()["contact"]
    assert some["email"] == "soporte@example.com" and "contraseñas" in some["note"]


def test_score_requires_every_term():
    art = help_content.get_article("registrar-primera-factura")
    assert help_search.score(art, ["factura"]) > 0 and help_search.score(art, ["factura", "zzzz"]) == 0
