"""Auditoría C-24: tope de viviendas por persona (DB-12), `code` ajeno no se revela (DB-11) e índices de claves foráneas (DB-08)."""
from sqlalchemy import text

from app.config import settings
from tests.test_auth import auth_client, bearer, register  # noqa: F401 (fixture)


def create(client, tokens, **extra):
    return client.post("/api/v1/homes", headers=bearer(tokens), json={"name": "Casa", "distributor": "EDESUR", **extra})


def test_a_person_cannot_own_more_than_the_configured_number_of_homes(auth_client, migrated, monkeypatch):
    monkeypatch.setattr(settings, "MAX_HOMES_PER_USER", 2)
    alice, bob = register(auth_client), register(auth_client, "bob@example.com")
    assert [create(auth_client, alice).status_code for _ in range(2)] == [201, 201]
    blocked = create(auth_client, alice)
    assert blocked.status_code == 409 and blocked.json()["code"] == "home_limit_reached"
    assert create(auth_client, bob).status_code == 201          # el tope es por persona


def test_a_client_chosen_code_is_ignored_so_it_cannot_reveal_other_households(auth_client, migrated):
    alice, bob = register(auth_client), register(auth_client, "bob@example.com")
    assert create(auth_client, alice, code="MICASA").status_code == 201
    second = create(auth_client, bob, code="MICASA")
    assert second.status_code == 201 and second.json()["code"] is None


def test_foreign_keys_have_supporting_indexes(migrated):
    with migrated.connect() as c:
        rows = c.execute(text("""
            SELECT conrelid::regclass::text AS tbl, a.attname AS col
            FROM pg_constraint k JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
            WHERE k.contype = 'f' AND array_length(k.conkey, 1) = 1
              AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = k.conrelid AND i.indkey[0] = k.conkey[1])
        """)).all()
    assert [tuple(r) for r in rows] == [], "claves foráneas sin índice de soporte"
