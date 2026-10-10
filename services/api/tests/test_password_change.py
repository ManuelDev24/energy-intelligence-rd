"""ERD-AUTH-06: cambio de contraseña con sesión iniciada (reautenticación, rotación de sesiones)."""
import pytest
from sqlalchemy import text

from app.config import settings
from tests.test_auth import AUTH, PASSWORD, auth_client, bearer, register  # noqa: F401
from tests.test_password_recovery import FORGOT, recovery_client, tokens_in_outbox  # noqa: F401

CHANGE = AUTH + '/password/change'
NEW_PASSWORD = 'another-new-password-789'


def change(client, tokens, current=PASSWORD, new=NEW_PASSWORD, **extra):
    return client.post(CHANGE, json={'current_password': current, 'new_password': new, **extra},
                       headers=bearer(tokens) if tokens else {})


def login(client, password, address='alice@example.com'):
    return client.post(AUTH + '/login', json={'email': address, 'password': password})


def test_change_returns_fresh_tokens_and_updates_credentials(auth_client, migrated):
    old = register(auth_client)
    r = change(auth_client, old)
    assert r.status_code == 200, r.text
    assert r.headers['cache-control'] == 'no-store'
    fresh = r.json()
    assert fresh['token_type'] == 'bearer' and fresh['refresh_token'] != old['refresh_token']
    assert login(auth_client, PASSWORD).status_code == 401
    assert login(auth_client, NEW_PASSWORD).status_code == 200
    assert auth_client.get(AUTH + '/me', headers=bearer(fresh)).status_code == 200
    with migrated.connect() as c:
        hashed = c.execute(text('SELECT password_hash FROM users')).scalar_one()
    assert hashed.startswith('$argon2id$') and NEW_PASSWORD not in hashed


def test_change_revokes_every_previous_session(auth_client):
    first = register(auth_client)
    second = login(auth_client, PASSWORD).json()
    assert change(auth_client, first).status_code == 200
    for tokens in (first, second):
        assert auth_client.get(AUTH + '/me', headers=bearer(tokens)).status_code == 401
        assert auth_client.post(AUTH + '/refresh', json={'refresh_token': tokens['refresh_token']}).status_code == 401


def test_wrong_current_password_is_403_and_changes_nothing(auth_client):
    tokens = register(auth_client)
    r = change(auth_client, tokens, current='not-the-real-password-1')
    assert r.status_code == 403 and r.json()['code'] == 'reauthentication_failed'
    assert login(auth_client, PASSWORD).status_code == 200
    assert auth_client.get(AUTH + '/me', headers=bearer(tokens)).status_code == 200


def test_requires_a_valid_access_token(auth_client):
    register(auth_client)
    assert change(auth_client, None).status_code == 401
    assert auth_client.post(CHANGE, json={'current_password': PASSWORD, 'new_password': NEW_PASSWORD},
                            headers={'Authorization': 'Bearer garbage'}).status_code == 401


@pytest.mark.parametrize('new', ['short-pw-1', 'x' * 129, PASSWORD])
def test_new_password_must_be_valid_and_different(auth_client, new):
    tokens = register(auth_client)
    assert change(auth_client, tokens, new=new).status_code == 422
    assert login(auth_client, PASSWORD).status_code == 200


def test_unknown_fields_are_rejected(auth_client):
    tokens = register(auth_client)
    assert change(auth_client, tokens, email='bob@example.com').status_code == 422


def test_pending_reset_links_die_with_the_change(recovery_client):
    tokens = register(recovery_client)
    assert recovery_client.post(FORGOT, json={'email': 'alice@example.com'}).status_code == 202
    leaked = tokens_in_outbox()[0]
    assert change(recovery_client, tokens).status_code == 200
    r = recovery_client.post(AUTH + '/password/reset', json={'token': leaked, 'new_password': 'attacker-password-000'})
    assert r.status_code == 400 and r.json()['code'] == 'reset_token_invalid'
    assert login(recovery_client, NEW_PASSWORD).status_code == 200


def test_failed_reauthentication_spends_the_login_budget(auth_client, monkeypatch):
    monkeypatch.setitem(settings.__dict__, 'AUTH_LOGIN_LIMIT', 3)
    tokens = register(auth_client)
    codes = [change(auth_client, tokens, current='not-the-real-password-1').status_code for _ in range(5)]
    assert codes[:3] == [403] * 3 and 429 in codes[3:]


def test_unauthenticated_requests_do_not_spend_the_login_budget(auth_client, monkeypatch):
    monkeypatch.setitem(settings.__dict__, 'AUTH_LOGIN_LIMIT', 2)
    register(auth_client)
    for _ in range(5):
        assert change(auth_client, None).status_code == 401
    assert login(auth_client, PASSWORD).status_code == 200


def test_disabled_auth_hides_the_route(client):
    r = client.post(CHANGE, json={'current_password': PASSWORD, 'new_password': NEW_PASSWORD})
    assert r.status_code == 404
