"""Real PostgreSQL interleavings; hooks pause real work, never replace SQL/Argon2."""
from threading import Event, Thread

import pytest
from argon2 import PasswordHasher
from sqlalchemy import text

from app.services import auth
from tests.test_auth import AUTH, PASSWORD, auth_client, bearer, register  # noqa: F401
from tests.test_password_recovery import (NEW_PASSWORD, RESET, forgot, recovery_client,
                                         tokens_in_outbox)  # noqa: F401

TIMEOUT = 15


@pytest.mark.parametrize('pause_before_verify', [False, True])
def test_erasure_cannot_use_password_from_before_reset(recovery_client, migrated, monkeypatch, pause_before_verify):
    from app.services import account

    tokens = register(recovery_client)
    home = recovery_client.post('/api/v1/homes', headers=bearer(tokens),
                                json={'name': 'Keep me', 'distributor': 'EDESUR'})
    assert home.status_code == 201
    forgot(recovery_client)
    paused, release = Event(), Event()
    original = account.verify_password

    def pause(user, password):
        if not pause_before_verify:
            valid = original(user, password)
        paused.set()
        assert release.wait(TIMEOUT)
        return original(user, password) if pause_before_verify else valid

    monkeypatch.setattr(account, 'verify_password', pause)
    worker = start_worker(lambda: recovery_client.request('DELETE', AUTH + '/me',
                         headers=bearer(tokens), json={'password': PASSWORD}))
    try:
        assert paused.wait(TIMEOUT)
        assert recovery_client.post(RESET, json={'token': tokens_in_outbox()[0],
                                                'new_password': NEW_PASSWORD}).status_code == 204
        assert forgot(recovery_client).status_code == 202
    finally:
        release.set()
    assert finish(worker).status_code == 403
    with migrated.connect() as db:
        assert db.execute(text('SELECT count(*) FROM users')).scalar_one() == 1
        assert db.execute(text('SELECT count(*) FROM homes')).scalar_one() == 1
        assert db.execute(text('SELECT count(*) FROM password_reset_tokens WHERE used_at IS NULL')).scalar_one() == 1
    assert recovery_client.post(RESET, json={'token': tokens_in_outbox()[-1],
                                            'new_password': NEW_PASSWORD + '!'}).status_code == 204


def test_forgot_purge_and_erasure_do_not_deadlock(recovery_client, migrated, monkeypatch):
    from sqlalchemy import event

    tokens = register(recovery_client)
    forgot(recovery_client)
    with migrated.begin() as db:
        db.execute(text("UPDATE password_reset_tokens SET created_at = now() - interval '3 days', "
                        "expires_at = now() - interval '2 days'"))
    locked, purged, acquiring_user, release = Event(), Event(), Event(), Event()
    states = []
    monkeypatch.setattr(migrated, 'hide_parameters', True)

    def before(conn, cursor, statement, parameters, context, executemany):
        if 'FROM users' in statement and 'FOR UPDATE' in statement and 'users.email =' in statement:
            acquiring_user.set()

    def after(conn, cursor, statement, parameters, context, executemany):
        if 'FROM users' in statement and 'FOR UPDATE' in statement and 'users.id =' in statement:
            locked.set()  # DELETE owns the actual PostgreSQL user row lock.
            assert release.wait(TIMEOUT)
        if statement.startswith('DELETE FROM password_reset_tokens'):
            purged.set()  # Forgot owns the old token row until its transaction commits.

    def error(context):
        states.append(getattr(context.original_exception, 'sqlstate', None))

    event.listen(migrated, 'before_cursor_execute', before)
    event.listen(migrated, 'after_cursor_execute', after)
    event.listen(migrated, 'handle_error', error)
    workers = []
    try:
        workers.append(start_worker(lambda: recovery_client.request('DELETE', AUTH + '/me',
                       headers=bearer(tokens), json={'password': PASSWORD})))
        assert locked.wait(TIMEOUT)
        workers.append(start_worker(lambda: forgot(recovery_client)))
        assert purged.wait(TIMEOUT)
        assert acquiring_user.wait(TIMEOUT)
        release.set()
        responses = [finish(worker) for worker in workers]
        assert states == [], f'PostgreSQL SQLSTATEs: {states}'
        assert [r.status_code for r in responses] == [204, 202]
        assert responses[1].json() == {'status': 'accepted'}
        with migrated.connect() as db:
            assert db.execute(text('SELECT count(*) FROM users')).scalar_one() == 0
            assert db.execute(text('SELECT count(*) FROM password_reset_tokens')).scalar_one() == 0
    finally:
        release.set()
        for thread, _ in workers:
            thread.join(TIMEOUT)
        event.remove(migrated, 'before_cursor_execute', before)
        event.remove(migrated, 'after_cursor_execute', after)
        event.remove(migrated, 'handle_error', error)


def start_worker(operation, name='race'):
    result = {}

    def run():
        try:
            result['value'] = operation()
        except Exception as exc:
            # Do not retain exception strings/SQL parameters in assertion output.
            result['error'] = (type(exc).__name__, getattr(getattr(exc, 'orig', None), 'sqlstate', None))

    thread = Thread(target=run, name=name, daemon=True)
    thread.start()
    return thread, result


def finish(worker):
    thread, result = worker
    thread.join(TIMEOUT)
    assert not thread.is_alive(), 'bounded worker join expired'
    assert 'error' not in result, result.get('error')
    return result['value']


@pytest.mark.parametrize('rehash', [False, True])
def test_login_verified_before_reset_cannot_issue_session(recovery_client, migrated, monkeypatch, rehash):
    register(recovery_client)
    if rehash:
        with migrated.begin() as db:
            db.execute(text('UPDATE users SET password_hash=:h'),
                       {'h': PasswordHasher(time_cost=2).hash(PASSWORD)})
    with migrated.connect() as db:
        assert auth.password_hasher.check_needs_rehash(db.execute(text('SELECT password_hash FROM users')).scalar_one()) is rehash
    forgot(recovery_client)
    verified, release = Event(), Event()
    original = auth.verify_password

    def pause(user, password):
        valid = original(user, password)
        verified.set()
        assert release.wait(TIMEOUT), 'reset did not release login'
        return valid

    monkeypatch.setattr(auth, 'verify_password', pause)
    worker = start_worker(lambda: recovery_client.post(AUTH + '/login', json={
        'email': 'alice@example.com', 'password': PASSWORD}))
    try:
        assert verified.wait(TIMEOUT)
        assert recovery_client.post(RESET, json={'token': tokens_in_outbox()[0],
                                                'new_password': NEW_PASSWORD}).status_code == 204
    finally:
        release.set()
    response = finish(worker)
    assert response.status_code == 401
    with migrated.connect() as db:
        assert db.execute(text('SELECT count(*) FROM auth_sessions WHERE revoked_at IS NULL')).scalar_one() == 0
        current_hash = db.execute(text('SELECT password_hash FROM users')).scalar_one()
        assert auth.password_hasher.verify(current_hash, NEW_PASSWORD)
    monkeypatch.setattr(auth, 'verify_password', original)
    assert recovery_client.post(AUTH + '/login', json={'email': 'alice@example.com',
                                                      'password': NEW_PASSWORD}).status_code == 200
