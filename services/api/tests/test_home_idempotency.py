"""ERD-ONB-ACCEPTANCE: POST /homes con Idempotency-Key — reintentar tras perder la respuesta no duplica la vivienda."""
import uuid

from sqlalchemy import text

from tests.test_auth import auth_client, bearer, register  # noqa: F401 (fixture)

BODY = {"name": "Casa", "distributor": "EDESUR", "province": "Santo Domingo"}


def post(client, tokens, key=None, body=BODY, **extra):
    headers = {**bearer(tokens), **({"Idempotency-Key": str(key)} if key else {}), **extra}
    return client.post("/api/v1/homes", headers=headers, json=body)


def count(migrated, user_email="alice@example.com"):
    with migrated.connect() as c:
        return c.execute(text("SELECT count(*) FROM home_members m JOIN users u ON u.id = m.user_id WHERE u.email = :e"), {"e": user_email}).scalar_one()


def test_replaying_the_same_request_returns_the_same_home_without_duplicating(auth_client, migrated):
    alice, key = register(auth_client), uuid.uuid4()
    first = post(auth_client, alice, key)
    second = post(auth_client, alice, key)
    assert first.status_code == 201 and second.status_code == 201
    assert second.json()["id"] == first.json()["id"]
    assert second.headers["Idempotent-Replayed"] == "true" and "Idempotent-Replayed" not in first.headers
    assert count(migrated) == 1


def test_same_key_with_different_content_is_rejected(auth_client, migrated):
    alice, key = register(auth_client), uuid.uuid4()
    assert post(auth_client, alice, key).status_code == 201
    other = post(auth_client, alice, key, body={**BODY, "name": "Otra"})
    assert other.status_code == 409 and other.json()["code"] == "idempotency_key_reused"
    assert count(migrated) == 1


def test_without_a_key_each_request_creates_a_home_and_a_bad_key_is_422(auth_client, migrated):
    alice = register(auth_client)
    assert post(auth_client, alice).status_code == 201 and post(auth_client, alice).status_code == 201
    assert count(migrated) == 2
    assert post(auth_client, alice, "no-es-uuid").status_code == 422


def test_a_key_is_private_to_the_person(auth_client, migrated):
    alice, bob, key = register(auth_client), register(auth_client, "bob@example.com"), uuid.uuid4()
    a, b = post(auth_client, alice, key), post(auth_client, bob, key)
    assert a.status_code == b.status_code == 201 and a.json()["id"] != b.json()["id"]
    assert b.headers.get("Idempotent-Replayed") is None


def test_replay_does_not_count_against_the_home_limit(auth_client, migrated, monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "MAX_HOMES_PER_USER", 1)
    alice, key = register(auth_client), uuid.uuid4()
    assert post(auth_client, alice, key).status_code == 201
    assert post(auth_client, alice, key).status_code == 201        # repetición: no choca con el tope
    assert post(auth_client, alice, uuid.uuid4()).status_code == 409


def test_deleted_home_and_expired_keys_do_not_resurrect_anything(auth_client, migrated):
    alice, key = register(auth_client), uuid.uuid4()
    first = post(auth_client, alice, key).json()["id"]
    assert auth_client.delete(f"/api/v1/homes/{first}", headers=bearer(alice)).status_code == 204
    with migrated.connect() as c:
        assert c.execute(text("SELECT count(*) FROM home_create_requests")).scalar_one() == 0   # cae con la vivienda
    again = post(auth_client, alice, key)
    assert again.status_code == 201 and again.json()["id"] != first
    with migrated.begin() as c:
        c.execute(text("UPDATE home_create_requests SET created_at = now() - interval '25 hours'"))
    third = post(auth_client, alice, key)      # clave vencida (24 h): se trata como nueva
    assert third.status_code == 201 and third.json()["id"] != again.json()["id"]
