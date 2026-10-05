"""ERD-AUTH-05: recuperación de contraseña (forgot/reset) sin enumeración de cuentas."""
import json
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from alembic import command
from sqlalchemy import inspect, text

from app.config import settings
from app.services import email
from tests.test_auth import AUTH, PASSWORD, auth_client, bearer, register  # noqa: F401
from tests.test_email import api_logs  # noqa: F401

FORGOT = AUTH + '/password/forgot'
RESET = AUTH + '/password/reset'
NEW_PASSWORD = 'brand-new-password-456'


@pytest.fixture
def recovery_client(auth_client, monkeypatch):
    monkeypatch.setitem(settings.__dict__, 'EMAIL_BACKEND', 'console')
    monkeypatch.setitem(settings.__dict__, 'EMAIL_DEV_OUTBOX', '')
    monkeypatch.setitem(settings.__dict__, 'PASSWORD_RESET_URL', 'https://app.energy.example/restablecer')
    email.DEV_OUTBOX.clear()
    yield auth_client
    email.DEV_OUTBOX.clear()


def tokens_in_outbox():
    return [re.search(r'#token=([A-Za-z0-9_-]{43})', m.text).group(1) for m in email.DEV_OUTBOX]


def forgot(client, address='alice@example.com'):
    return client.post(FORGOT, json={'email': address})


def without_request_id(response):
    body = response.json()
    body.pop('request_id', None)
    return body


def test_forgot_is_identical_for_known_and_unknown_accounts(recovery_client, migrated):
    register(recovery_client)
    known, unknown = forgot(recovery_client), forgot(recovery_client, 'nobody@example.com')
    assert known.status_code == unknown.status_code == 202
    assert known.json() == unknown.json() == {'status': 'accepted'}
    assert known.headers['cache-control'] == unknown.headers['cache-control'] == 'no-store'
    assert [m.to for m in email.DEV_OUTBOX] == ['alice@example.com']
    token = tokens_in_outbox()[0]
    assert '?token=' not in email.DEV_OUTBOX[0].text
    with migrated.connect() as c:
        row = c.execute(text('SELECT token_hash, created_at, expires_at, used_at, requested_peer_hash '
                             'FROM password_reset_tokens')).one()
    assert row.token_hash != token and len(row.token_hash) == 64
    assert row.used_at is None
    assert timedelta(minutes=29) < row.expires_at - row.created_at <= timedelta(minutes=30, seconds=1)
    assert len(row.requested_peer_hash) == 64 and 'testclient' not in row.requested_peer_hash


def test_forgot_does_comparable_work_for_unknown_accounts(recovery_client, monkeypatch):
    from app.services import password_recovery
    calls = []
    original = password_recovery.hash_token
    monkeypatch.setattr(password_recovery, 'hash_token', lambda t: calls.append(t) or original(t))
    register(recovery_client)
    forgot(recovery_client)
    forgot(recovery_client, 'nobody@example.com')
    assert len(calls) == 2 and all(len(t) == 43 for t in calls)


def test_email_is_sent_after_the_response_path_and_failures_do_not_change_it(recovery_client, monkeypatch):
    def failing(request):
        return httpx.Response(500, json={'message': 'down'})
    sender = email.ResendEmailSender('re_test_key', 'no-reply@energy.example', transport=httpx.MockTransport(failing))
    monkeypatch.setattr(email, 'get_email_sender', lambda: sender)
    register(recovery_client)
    known, unknown = forgot(recovery_client), forgot(recovery_client, 'nobody@example.com')
    assert known.status_code == unknown.status_code == 202
    assert known.json() == unknown.json()


def test_unexpected_sender_exception_never_changes_the_response(recovery_client, monkeypatch):
    class Broken:
        def send(self, message):
            raise RuntimeError('sender bug')
    monkeypatch.setattr(email, 'get_email_sender', lambda: Broken())
    register(recovery_client)
    assert forgot(recovery_client).status_code == 202


def test_new_request_invalidates_previous_unused_token(recovery_client):
    register(recovery_client)
    forgot(recovery_client)
    forgot(recovery_client)
    first, second = tokens_in_outbox()
    assert recovery_client.post(RESET, json={'token': first, 'new_password': NEW_PASSWORD}).status_code == 400
    assert recovery_client.post(RESET, json={'token': second, 'new_password': NEW_PASSWORD}).status_code == 204


def test_per_account_cooldown_never_changes_the_response(recovery_client, monkeypatch, migrated):
    monkeypatch.setitem(settings.__dict__, 'PASSWORD_RESET_ACCOUNT_LIMIT', 2)
    register(recovery_client)
    responses = [forgot(recovery_client) for _ in range(3)]
    assert {r.status_code for r in responses} == {202}
    assert all(r.json() == responses[0].json() for r in responses)
    assert len(email.DEV_OUTBOX) == 2
    with migrated.connect() as c:
        assert c.execute(text('SELECT count(*) FROM password_reset_tokens')).scalar() == 2
    # The last mailed token is still the valid one.
    assert recovery_client.post(RESET, json={'token': tokens_in_outbox()[-1], 'new_password': NEW_PASSWORD}).status_code == 204


def test_forgot_has_its_own_per_peer_budget(recovery_client, monkeypatch):
    monkeypatch.setitem(settings.__dict__, 'AUTH_FORGOT_LIMIT', 2)
    assert forgot(recovery_client, 'a@example.com').status_code == 202
    assert forgot(recovery_client, 'b@example.com').status_code == 202
    limited = forgot(recovery_client, 'c@example.com')
    assert limited.status_code == 429 and limited.json()['code'] == 'auth_rate_limited'
    # Login keeps its own bucket.
    register(recovery_client)
    assert recovery_client.post(AUTH + '/login', json={'email': 'alice@example.com', 'password': PASSWORD}).status_code == 200


def test_reset_sets_new_password_and_revokes_every_session(recovery_client, migrated):
    first = register(recovery_client)
    second = recovery_client.post(AUTH + '/login', json={'email': 'alice@example.com', 'password': PASSWORD}).json()
    forgot(recovery_client)
    token = tokens_in_outbox()[0]
    response = recovery_client.post(RESET, json={'token': token, 'new_password': NEW_PASSWORD})
    assert response.status_code == 204 and response.content == b''
    assert response.headers['cache-control'] == 'no-store'
    for pair in (first, second):
        assert recovery_client.get(AUTH + '/me', headers=bearer(pair)).status_code == 401
        assert recovery_client.post(AUTH + '/refresh', json={'refresh_token': pair['refresh_token']}).status_code == 401
    old = recovery_client.post(AUTH + '/login', json={'email': 'alice@example.com', 'password': PASSWORD})
    assert old.status_code == 401
    assert recovery_client.post(AUTH + '/login', json={'email': 'alice@example.com', 'password': NEW_PASSWORD}).status_code == 200
    with migrated.connect() as c:
        assert c.execute(text('SELECT password_hash FROM users')).scalar_one().startswith('$argon2id$')
        assert c.execute(text('SELECT used_at FROM password_reset_tokens')).scalar_one() is not None
        assert c.execute(text('SELECT count(*) FROM auth_sessions WHERE revoked_at IS NULL')).scalar() == 1


def test_invalid_expired_and_used_tokens_share_one_response(recovery_client, migrated):
    register(recovery_client)
    forgot(recovery_client)
    used = tokens_in_outbox()[0]
    assert recovery_client.post(RESET, json={'token': used, 'new_password': NEW_PASSWORD}).status_code == 204
    forgot(recovery_client)
    expired = tokens_in_outbox()[1]
    with migrated.begin() as c:
        c.execute(text("UPDATE password_reset_tokens SET expires_at = now() - interval '1 second' WHERE used_at IS NULL"))
    unknown = 'U' * 43
    responses = [recovery_client.post(RESET, json={'token': t, 'new_password': NEW_PASSWORD + '!'})
                 for t in (used, expired, unknown)]
    assert {r.status_code for r in responses} == {400}
    bodies = [without_request_id(r) for r in responses]
    assert bodies[0] == bodies[1] == bodies[2] and bodies[0]['code'] == 'reset_token_invalid'
    for r, token in zip(responses, (used, expired, unknown)):
        assert token not in r.text and r.headers['cache-control'] == 'no-store'
    assert recovery_client.post(AUTH + '/login', json={'email': 'alice@example.com', 'password': NEW_PASSWORD}).status_code == 200


@pytest.mark.parametrize('body', [
    {'token': 'x' * 43, 'new_password': 'short'},
    {'token': 'x' * 43, 'new_password': 'x' * 129},
    {'token': 'x' * 42, 'new_password': NEW_PASSWORD},
    {'token': 'x' * 42 + '!', 'new_password': NEW_PASSWORD},
    {'token': 'x' * 43, 'new_password': NEW_PASSWORD, 'email': 'alice@example.com'},
    {'new_password': NEW_PASSWORD},
])
def test_reset_payload_is_strict_and_redacted(recovery_client, body):
    response = recovery_client.post(RESET, json=body)
    assert response.status_code == 422
    assert NEW_PASSWORD not in response.text and 'x' * 42 not in response.text


@pytest.mark.parametrize('body', [{}, {'email': 'not-an-email'}, {'email': 'a@example.com', 'role': 'admin'},
                                  {'email': 'a' * 250 + '@example.com'}])
def test_forgot_payload_is_strict(recovery_client, body):
    assert forgot_raw(recovery_client, body).status_code == 422
    assert not email.DEV_OUTBOX


def forgot_raw(client, body):
    return client.post(FORGOT, json=body)


def test_invalid_unicode_new_password_is_redacted_and_keeps_token(recovery_client):
    register(recovery_client)
    forgot(recovery_client)
    token = tokens_in_outbox()[0]
    raw = json.dumps({'token': token, 'new_password': 'valid-length-password-\ud800'})
    response = recovery_client.post(RESET, content=raw, headers={'Content-Type': 'application/json'})
    assert response.status_code == 422 and token not in response.text
    assert recovery_client.post(RESET, json={'token': token, 'new_password': NEW_PASSWORD}).status_code == 204


def test_reset_has_its_own_budget(recovery_client, monkeypatch):
    monkeypatch.setitem(settings.__dict__, 'AUTH_RESET_LIMIT', 1)
    assert recovery_client.post(RESET, json={'token': 'U' * 43, 'new_password': NEW_PASSWORD}).status_code == 400
    limited = recovery_client.post(RESET, json={'token': 'V' * 43, 'new_password': NEW_PASSWORD})
    assert limited.status_code == 429 and limited.json()['code'] == 'auth_rate_limited'


def test_inactive_user_gets_no_mail_and_cannot_reset(recovery_client, migrated):
    register(recovery_client)
    forgot(recovery_client)
    token = tokens_in_outbox()[0]
    with migrated.begin() as c:
        c.execute(text('UPDATE users SET active = false'))
    assert forgot(recovery_client).json() == {'status': 'accepted'}
    assert len(email.DEV_OUTBOX) == 1
    assert recovery_client.post(RESET, json={'token': token, 'new_password': NEW_PASSWORD}).status_code == 400


def test_concurrent_reset_with_one_token_succeeds_once(recovery_client):
    register(recovery_client)
    forgot(recovery_client)
    token = tokens_in_outbox()[0]
    with ThreadPoolExecutor(2) as pool:
        statuses = sorted(pool.map(lambda p: recovery_client.post(RESET, json={'token': token, 'new_password': p}).status_code,
                                   [NEW_PASSWORD, NEW_PASSWORD + '-other']))
    assert statuses == [204, 400]


def test_recovery_is_disabled_in_pilot_mode(client):
    assert client.post(FORGOT, json={'email': 'a@example.com'}).status_code == 404
    assert client.post(RESET, json={'token': 'x' * 43, 'new_password': NEW_PASSWORD}).status_code == 404


def test_logs_never_contain_token_email_or_password(recovery_client, capsys, api_logs):
    register(recovery_client)
    forgot(recovery_client)
    forgot(recovery_client, 'nobody@example.com')
    token = tokens_in_outbox()[0]
    recovery_client.post(RESET, json={'token': token, 'new_password': NEW_PASSWORD})
    output = capsys.readouterr()
    logged = output.out + output.err + api_logs()
    assert '/api/v1/auth/password/reset' in logged  # request log line captured
    for value in (token, 'alice@example.com', 'nobody@example.com', NEW_PASSWORD, 'restablecer'):
        assert value not in logged


def test_app_engine_still_hides_sql_parameters():
    from app.database import engine
    assert engine.hide_parameters is True


def test_account_deletion_cascades_reset_tokens(recovery_client, migrated):
    tokens = register(recovery_client)
    forgot(recovery_client)
    assert recovery_client.request('DELETE', AUTH + '/me', json={'password': PASSWORD},
                                   headers=bearer(tokens)).status_code == 204
    with migrated.connect() as c:
        assert c.execute(text('SELECT count(*) FROM password_reset_tokens')).scalar() == 0


def test_expired_tokens_are_purged_on_later_requests(recovery_client, migrated):
    register(recovery_client)
    forgot(recovery_client)
    with migrated.begin() as c:
        c.execute(text("UPDATE password_reset_tokens SET created_at = now() - interval '3 days', "
                       "expires_at = now() - interval '2 days'"))
    forgot(recovery_client, 'nobody@example.com')
    with migrated.connect() as c:
        assert c.execute(text('SELECT count(*) FROM password_reset_tokens')).scalar() == 0


def test_0013_roundtrip_and_constraints(migrated, alembic_cfg):
    from sqlalchemy.exc import IntegrityError
    with migrated.begin() as c:
        uid = c.execute(text("INSERT INTO users(id,email,password_hash) VALUES(gen_random_uuid(),'m@example.com','x') "
                             "RETURNING id")).scalar_one()
    insert = text("INSERT INTO password_reset_tokens(id,user_id,token_hash,expires_at) "
                  "VALUES(gen_random_uuid(), :u, :h, now() + interval '30 minutes')")
    with migrated.begin() as c:
        c.execute(insert, {'u': uid, 'h': 'a' * 64})
    with pytest.raises(IntegrityError), migrated.begin() as c:
        c.execute(insert, {'u': uid, 'h': 'a' * 64})
    command.downgrade(alembic_cfg, '0012')
    assert 'password_reset_tokens' not in inspect(migrated).get_table_names()
    with migrated.connect() as c:
        assert c.execute(text('SELECT count(*) FROM users')).scalar() == 1
    command.upgrade(alembic_cfg, 'head')
    assert 'password_reset_tokens' in inspect(migrated).get_table_names()
    with migrated.begin() as c:
        c.execute(insert, {'u': uid, 'h': 'b' * 64})
        c.execute(text('DELETE FROM users'))
        assert c.execute(text('SELECT count(*) FROM password_reset_tokens')).scalar() == 0
