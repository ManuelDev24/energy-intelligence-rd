"""ERD-AUTH-03: borrado de cuenta con reautenticación, regla 409 y ruta de borrado acotada."""
import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from tests.test_api_homes_bills import BILL
from tests.test_api_insights import EQ, add_bill
from tests.test_api_readings import READING
from tests.test_auth import AUTH, PASSWORD, auth_client, bearer, register  # noqa: F401
from tests.test_bill_detail import ITEM

ME = AUTH + '/me'
GOAL = {'monthly_kwh': '300', 'monthly_amount_rd': '3000'}
# Tablas con datos de vivienda; deben quedar vacías para una vivienda borrada.
HOME_TABLES = ['bills', 'alerts', 'equipment', 'alert_settings', 'meter_readings', 'home_goals', 'contracts',
               'home_members']


def delete_account(client, tokens, password=PASSWORD, **extra):
    return client.request('DELETE', ME, json={'password': password, **extra}, headers=bearer(tokens))


def full_home(client, tokens, name='Casa Alice', address='Calle Privada 1'):
    h = client.post('/api/v1/homes', headers=bearer(tokens),
                    json={'name': name, 'distributor': 'EDESUR', 'address': address}).json()['id']
    client.headers.update(bearer(tokens))
    try:
        u = f'/api/v1/homes/{h}'
        bill = client.post(u + '/bills', json=BILL).json()['id']
        assert client.put(u + f'/bills/{bill}/items', json={'items': [ITEM]}).status_code == 200
        assert client.post(u + '/equipment', json=EQ).status_code == 201
        add_bill(client, h, '2026-09-01', '2026-09-30', '1000')
        assert client.get(u + '/alerts').json()
        assert client.put(u + '/alert-settings', json={'warning_pct': '10', 'critical_pct': '40'}).status_code == 200
        assert client.post(u + '/readings', json=READING).status_code == 201
        assert client.put(u + '/goal', json=GOAL).status_code == 200
        assert client.put(u + '/contract', json={'account_number': 'ACC-123'}).status_code == 200
    finally:
        client.headers.clear()
    return h


def counts(engine, home_id):
    with engine.connect() as c:
        result = {t: c.execute(text(f'SELECT count(*) FROM {t} WHERE home_id=:h'), {'h': home_id}).scalar()
                  for t in HOME_TABLES}
        result['homes'] = c.execute(text('SELECT count(*) FROM homes WHERE id=:h'), {'h': home_id}).scalar()
        result['bill_snapshots'] = c.execute(text('SELECT count(*) FROM bill_snapshots')).scalar()
        result['bill_items'] = c.execute(text('SELECT count(*) FROM bill_items')).scalar()
    return result


def add_member(engine, home_id, email, role='member'):
    with engine.begin() as c:
        c.execute(text('INSERT INTO home_members(home_id,user_id,role) SELECT :h,id,:r FROM users WHERE email=:e'),
                  {'h': home_id, 'e': email, 'r': role})


def test_sole_member_account_erases_user_sessions_and_all_home_data(auth_client, migrated):
    alice = register(auth_client)
    second_session = auth_client.post(AUTH + '/login', json={'email': 'alice@example.com', 'password': PASSWORD}).json()
    home = full_home(auth_client, alice)
    bob = register(auth_client, 'bob@example.com')
    bob_home = full_home(auth_client, bob, name='Casa Bob')
    before_bob = counts(migrated, bob_home)
    assert counts(migrated, home)['bills'] == 2

    response = delete_account(auth_client, alice)
    assert response.status_code == 204, response.text
    assert response.headers['cache-control'] == 'no-store'

    after = counts(migrated, home)
    assert all(after[t] == 0 for t in HOME_TABLES + ['homes']), after
    with migrated.connect() as c:
        assert c.execute(text("SELECT count(*) FROM users WHERE email='alice@example.com'")).scalar() == 0
        assert c.execute(text('SELECT count(*) FROM auth_sessions s LEFT JOIN users u ON u.id=s.user_id '
                              'WHERE u.id IS NULL')).scalar() == 0
        orphan_snapshots = c.execute(text('SELECT count(*) FROM bill_snapshots s LEFT JOIN bills b ON b.id=s.bill_id '
                                          'WHERE b.id IS NULL')).scalar()
        assert orphan_snapshots == 0
        assert c.execute(text('SELECT count(*) FROM bill_snapshots')).scalar() == 2  # las 2 facturas de Bob
    assert counts(migrated, bob_home) == {**before_bob, 'bill_snapshots': 2, 'bill_items': 1}

    for tokens in (alice, second_session):
        assert auth_client.get(ME, headers=bearer(tokens)).status_code == 401
        assert auth_client.post(AUTH + '/refresh', json={'refresh_token': tokens['refresh_token']}).status_code == 401
    assert auth_client.post(AUTH + '/login', json={'email': 'alice@example.com', 'password': PASSWORD}).status_code == 401
    assert auth_client.get('/api/v1/homes', headers=bearer(bob)).status_code == 200


def test_wrong_password_is_generic_counted_and_changes_nothing(auth_client, migrated, monkeypatch):
    from app.config import settings
    alice = register(auth_client)
    home = full_home(auth_client, alice)
    unknown = auth_client.post(AUTH + '/login', json={'email': 'nobody@example.com', 'password': PASSWORD})
    monkeypatch.setitem(settings.__dict__, 'AUTH_LOGIN_LIMIT', 2)
    with migrated.begin() as c:
        c.execute(text('DELETE FROM auth_abuse_buckets'))
    wrong = delete_account(auth_client, alice, 'wrong-password-123')
    assert wrong.status_code == 403
    assert wrong.json()['detail'] == unknown.json()['detail']
    assert 'wrong-password-123' not in wrong.text and 'alice' not in wrong.text
    assert delete_account(auth_client, alice, 'wrong-password-456').status_code == 403
    limited = delete_account(auth_client, alice)
    assert limited.status_code == 429
    assert limited.json()['code'] == 'auth_rate_limited'
    assert auth_client.get(ME, headers=bearer(alice)).status_code == 200
    assert counts(migrated, home)['homes'] == 1


def test_unauthenticated_deletion_never_spends_the_login_budget(auth_client, migrated, monkeypatch):
    """Sin token válido, DELETE /auth/me no debe agotar el presupuesto de /login de esa IP (revisión R1)."""
    from app.config import settings
    alice = register(auth_client)
    monkeypatch.setitem(settings.__dict__, 'AUTH_LOGIN_LIMIT', 2)
    with migrated.begin() as c:
        c.execute(text('DELETE FROM auth_abuse_buckets'))
    for headers in ({}, {'Authorization': 'Bearer not-a-token'}, {'Authorization': 'Bearer '}, {}):
        r = auth_client.request('DELETE', ME, json={'password': PASSWORD}, headers=headers)
        assert r.status_code == 401
    login = auth_client.post(AUTH + '/login', json={'email': 'alice@example.com', 'password': PASSWORD})
    assert login.status_code == 200


@pytest.mark.parametrize('body', [{}, {'password': PASSWORD, 'confirm': True}, {'password': 'x' * 129},
                                  {'password': 123}])
def test_deletion_payload_is_strict(auth_client, body):
    alice = register(auth_client)
    r = auth_client.request('DELETE', ME, json=body, headers=bearer(alice))
    assert r.status_code == 422
    assert PASSWORD not in r.text
    assert auth_client.get(ME, headers=bearer(alice)).status_code == 200


def test_deletion_requires_access_token_and_is_disabled_in_pilot(auth_client, client, monkeypatch):
    register(auth_client)
    r = auth_client.request('DELETE', ME, json={'password': PASSWORD})
    assert r.status_code == 401 and r.headers['www-authenticate'] == 'Bearer'
    from app.config import settings
    monkeypatch.setitem(settings.__dict__, 'AUTH_ENABLED', False)
    assert client.request('DELETE', ME, json={'password': PASSWORD}).status_code == 404


def test_sole_owner_with_other_members_gets_409_and_nothing_changes(auth_client, migrated):
    alice = register(auth_client)
    home = full_home(auth_client, alice)
    lonely = auth_client.post('/api/v1/homes', headers=bearer(alice),
                              json={'name': 'solo', 'distributor': 'EDESUR'}).json()['id']
    register(auth_client, 'bob@example.com')
    add_member(migrated, home, 'bob@example.com')
    before = counts(migrated, home)
    r = delete_account(auth_client, alice)
    assert r.status_code == 409
    assert r.json()['code'] == 'ownership_transfer_required'
    assert 'bob@example.com' not in r.text
    assert counts(migrated, home) == before
    assert counts(migrated, lonely)['homes'] == 1  # la vivienda propia tampoco se borró
    assert auth_client.get(ME, headers=bearer(alice)).status_code == 200
    assert auth_client.post(AUTH + '/refresh', json={'refresh_token': alice['refresh_token']}).status_code == 200


def test_plain_member_only_loses_membership(auth_client, migrated):
    alice = register(auth_client)
    home = full_home(auth_client, alice)
    bob = register(auth_client, 'bob@example.com')
    add_member(migrated, home, 'bob@example.com')
    before = counts(migrated, home)
    assert delete_account(auth_client, bob).status_code == 204
    after = counts(migrated, home)
    assert after == {**before, 'home_members': 1}
    assert auth_client.get(f'/api/v1/homes/{home}/bills', headers=bearer(alice)).status_code == 200
    with migrated.connect() as c:
        assert c.execute(text("SELECT count(*) FROM users WHERE email='bob@example.com'")).scalar() == 0


def test_co_owner_can_leave_without_transfer(auth_client, migrated):
    alice = register(auth_client)
    home = full_home(auth_client, alice)
    register(auth_client, 'bob@example.com')
    add_member(migrated, home, 'bob@example.com', 'owner')
    assert delete_account(auth_client, alice).status_code == 204
    assert counts(migrated, home)['homes'] == 1
    with migrated.connect() as c:
        assert c.execute(text('SELECT role FROM home_members WHERE home_id=:h'), {'h': home}).scalar_one() == 'owner'


def test_erased_home_audit_rows_are_pseudonymized_not_deleted(auth_client, migrated):
    alice = register(auth_client)
    home = full_home(auth_client, alice)
    with migrated.connect() as c:
        existing = c.execute(text('SELECT count(*) FROM audit_events WHERE home_id=:h'), {'h': home}).scalar()
    assert existing > 0
    assert delete_account(auth_client, alice).status_code == 204
    with migrated.connect() as c:
        rows = c.execute(text('SELECT actor, before, after, operation FROM audit_events WHERE home_id=:h'),
                         {'h': home}).all()
        dump = c.execute(text('SELECT coalesce(string_agg(before::text || after::text || actor, \'\'), \'\') '
                              'FROM audit_events')).scalar()
    assert len(rows) >= existing  # se conservan (más el evento de borrado), no se eliminan
    assert {r.actor for r in rows} == {'deleted-user'}
    assert all(r.before is None and r.after is None for r in rows)
    assert 'erase' in {r.operation for r in rows}
    for secret in ('alice@example.com', 'Casa Alice', 'Calle Privada 1', 'ACC-123'):
        assert secret not in dump


def test_shared_home_audit_keeps_history_but_never_member_identity(auth_client, migrated):
    alice = register(auth_client)
    home = full_home(auth_client, alice)
    bob = register(auth_client, 'bob@example.com')
    add_member(migrated, home, 'bob@example.com')
    assert delete_account(auth_client, bob).status_code == 204
    with migrated.connect() as c:
        dump = c.execute(text("SELECT string_agg(coalesce(before::text,'') || coalesce(after::text,'') || actor, '') "
                              'FROM audit_events')).scalar()
        names = c.execute(text("SELECT count(*) FROM audit_events WHERE home_id=:h AND actor='pilot'"),
                          {'h': home}).scalar()
    assert 'bob@example.com' not in dump
    assert names > 0  # la historia del hogar compartido de Alice no se reescribe


def test_failure_mid_erasure_rolls_back_everything(auth_client, migrated, monkeypatch):
    from app.services import account
    alice = register(auth_client)
    home = full_home(auth_client, alice)
    before = counts(migrated, home)

    def boom(*_args, **_kwargs):
        raise RuntimeError('fallo simulado')
    monkeypatch.setattr(account, 'pseudonymize_audit', boom)
    failed = delete_account(auth_client, alice)
    assert failed.status_code == 500 and 'fallo simulado' not in failed.text
    assert counts(migrated, home) == before
    with migrated.connect() as c:
        assert c.execute(text('SELECT count(*) FROM auth_sessions WHERE revoked_at IS NOT NULL')).scalar() == 0
    assert auth_client.get(ME, headers=bearer(alice)).status_code == 200


def test_email_can_register_again_without_old_data(auth_client):
    alice = register(auth_client)
    full_home(auth_client, alice)
    assert delete_account(auth_client, alice).status_code == 204
    again = register(auth_client)
    assert auth_client.get('/api/v1/homes', headers=bearer(again)).json() == []


def test_snapshot_immutability_survives_erasure_path(auth_client, migrated):
    """Erasure reuses the orphan-only DELETE rule; direct UPDATE/DELETE/TRUNCATE stay blocked."""
    alice = register(auth_client)
    full_home(auth_client, alice)
    for sql in ('UPDATE bill_snapshots SET origin=origin', 'DELETE FROM bill_snapshots', 'TRUNCATE bill_snapshots'):
        with pytest.raises(IntegrityError):
            with migrated.begin() as c:
                c.execute(text(sql))
    # A session-level setting must not open a bypass either.
    with pytest.raises(Exception):
        with migrated.begin() as c:
            c.execute(text("SET LOCAL energyrd.erasure = 'on'"))
            c.execute(text('DELETE FROM bill_snapshots'))
    with migrated.connect() as c:
        assert c.execute(text('SELECT count(*) FROM bill_snapshots')).scalar() == 2


def test_invalid_unicode_password_on_deletion_is_redacted_422(auth_client):
    import json
    alice = register(auth_client)
    response = auth_client.request('DELETE', ME, content=json.dumps({'password': 'valid-length-password-\ud800'}),
                                   headers={**bearer(alice), 'Content-Type': 'application/json'})
    assert response.status_code == 422
    assert all('input' not in e and 'ctx' not in e for e in response.json()['detail'])
