"""ERD-PROF-01: preferencias de notificación y sesiones activas de la cuenta."""
import pytest
from sqlalchemy import text

from tests.test_auth import AUTH, PASSWORD, auth_client, bearer, register  # noqa: F401

PREFS = AUTH + '/me/preferences'
SESSIONS = AUTH + '/sessions'


def login(client, address='alice@example.com'):
    r = client.post(AUTH + '/login', json={'email': address, 'password': PASSWORD})
    assert r.status_code == 200
    return r.json()


def test_preferences_default_to_enabled_without_creating_a_row(auth_client, migrated):
    tokens = register(auth_client)
    r = auth_client.get(PREFS, headers=bearer(tokens))
    assert r.status_code == 200 and r.headers['cache-control'] == 'no-store'
    assert r.json() == {'alerts_email': True, 'alerts_push': True, 'updated_at': None}
    with migrated.connect() as c:
        assert c.execute(text('SELECT count(*) FROM notification_preferences')).scalar() == 0


def test_preferences_are_saved_replaced_and_private_to_the_user(auth_client):
    alice, bob = register(auth_client), register(auth_client, 'bob@example.com')
    saved = auth_client.put(PREFS, headers=bearer(alice), json={'alerts_email': False, 'alerts_push': True})
    assert saved.status_code == 200 and saved.json()['alerts_email'] is False and saved.json()['updated_at']
    assert auth_client.get(PREFS, headers=bearer(alice)).json()['alerts_email'] is False
    assert auth_client.get(PREFS, headers=bearer(bob)).json()['alerts_email'] is True
    again = auth_client.put(PREFS, headers=bearer(alice), json={'alerts_email': True, 'alerts_push': False})
    assert (again.json()['alerts_email'], again.json()['alerts_push']) == (True, False)


@pytest.mark.parametrize('body', [{}, {'alerts_email': True}, {'alerts_email': 'yes', 'alerts_push': True},
                                  {'alerts_email': 1, 'alerts_push': 0}, {'alerts_email': True, 'alerts_push': True, 'sms': True}])
def test_preferences_require_exactly_two_real_booleans(auth_client, body):
    tokens = register(auth_client)
    assert auth_client.put(PREFS, headers=bearer(tokens), json=body).status_code == 422
    assert auth_client.get(PREFS, headers=bearer(tokens)).json()['updated_at'] is None


def test_preferences_need_a_session_and_vanish_with_the_account(auth_client, migrated):
    assert auth_client.get(PREFS).status_code == 401
    assert auth_client.put(PREFS, json={'alerts_email': True, 'alerts_push': True}).status_code == 401
    tokens = register(auth_client)
    auth_client.put(PREFS, headers=bearer(tokens), json={'alerts_email': False, 'alerts_push': False})
    assert auth_client.request('DELETE', AUTH + '/me', headers=bearer(tokens), json={'password': PASSWORD}).status_code == 204
    with migrated.connect() as c:
        assert c.execute(text('SELECT count(*) FROM notification_preferences')).scalar() == 0


def test_sessions_list_marks_the_current_one_and_hides_ended_ones(auth_client):
    first = register(auth_client)
    second = login(auth_client)
    listed = auth_client.get(SESSIONS, headers=bearer(second))
    assert listed.status_code == 200 and listed.headers['cache-control'] == 'no-store'
    body = listed.json()
    assert len(body) == 2 and [s['current'] for s in body].count(True) == 1
    assert set(body[0]) == {'id', 'created_at', 'expires_at', 'current'}
    assert 'refresh' not in listed.text and 'token' not in listed.text
    # La que consulta es la marcada como actual.
    assert next(s for s in body if s['current'])['id'] != next(s for s in auth_client.get(SESSIONS, headers=bearer(first)).json() if s['current'])['id']
    auth_client.post(AUTH + '/logout', json={'refresh_token': first['refresh_token']})
    assert len(auth_client.get(SESSIONS, headers=bearer(second)).json()) == 1


def test_a_session_can_be_closed_individually(auth_client):
    first = register(auth_client)
    second = login(auth_client)
    other = next(s for s in auth_client.get(SESSIONS, headers=bearer(second)).json() if not s['current'])
    assert auth_client.delete(f"{SESSIONS}/{other['id']}", headers=bearer(second)).status_code == 204
    assert auth_client.get(AUTH + '/me', headers=bearer(first)).status_code == 401           # la cerrada deja de servir
    assert auth_client.post(AUTH + '/refresh', json={'refresh_token': first['refresh_token']}).status_code == 401
    assert auth_client.get(AUTH + '/me', headers=bearer(second)).status_code == 200
    assert auth_client.delete(f"{SESSIONS}/{other['id']}", headers=bearer(second)).status_code == 404   # ya cerrada


def test_closing_the_others_keeps_only_the_current_session(auth_client):
    sessions = [register(auth_client), login(auth_client), login(auth_client)]
    keeper = sessions[1]
    r = auth_client.post(SESSIONS + '/revoke-others', headers=bearer(keeper))
    assert r.status_code == 204 and r.headers['cache-control'] == 'no-store'
    assert [auth_client.get(AUTH + '/me', headers=bearer(s)).status_code for s in sessions] == [401, 200, 401]
    assert [s['current'] for s in auth_client.get(SESSIONS, headers=bearer(keeper)).json()] == [True]


def test_sessions_of_other_accounts_are_untouchable(auth_client):
    alice, bob = register(auth_client), register(auth_client, 'bob@example.com')
    alice_session = auth_client.get(SESSIONS, headers=bearer(alice)).json()[0]['id']
    assert auth_client.delete(f'{SESSIONS}/{alice_session}', headers=bearer(bob)).status_code == 404
    assert auth_client.get(AUTH + '/me', headers=bearer(alice)).status_code == 200
    auth_client.post(SESSIONS + '/revoke-others', headers=bearer(bob))
    assert auth_client.get(AUTH + '/me', headers=bearer(alice)).status_code == 200


def test_sessions_need_a_valid_token_and_a_uuid(auth_client):
    tokens = register(auth_client)
    assert auth_client.get(SESSIONS).status_code == 401
    assert auth_client.delete(SESSIONS + '/00000000-0000-4000-8000-000000000001').status_code == 401
    assert auth_client.post(SESSIONS + '/revoke-others').status_code == 401
    assert auth_client.delete(SESSIONS + '/not-a-uuid', headers=bearer(tokens)).status_code == 422


def test_0016_roundtrip(migrated, alembic_cfg):
    from alembic import command
    from sqlalchemy import inspect
    command.downgrade(alembic_cfg, '0015')
    assert 'notification_preferences' not in inspect(migrated).get_table_names()
    command.upgrade(alembic_cfg, 'head')
    assert 'notification_preferences' in inspect(migrated).get_table_names()
