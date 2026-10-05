import secrets
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

import jwt

import pytest
from sqlalchemy import text

from app.config import settings

AUTH = '/api/v1/auth'
PASSWORD = 'valid-test-password-123'


@pytest.fixture
def auth_client(client, monkeypatch):
    monkeypatch.setitem(settings.__dict__, 'AUTH_ENABLED', True)
    monkeypatch.setitem(settings.__dict__, 'AUTH_SIGNING_KEY', secrets.token_urlsafe(48))
    return client


def register(client, email='alice@example.com'):
    r = client.post(AUTH + '/register', json={'email': email, 'password': PASSWORD})
    assert r.status_code == 201, r.text
    return r.json()


def bearer(tokens):
    return {'Authorization': 'Bearer ' + tokens['access_token']}


def test_registration_login_me_and_hash(auth_client, migrated):
    t = register(auth_client)
    assert t['token_type'] == 'bearer' and 0 < t['expires_in'] <= 900
    me = auth_client.get(AUTH + '/me', headers=bearer(t))
    assert me.status_code == 200 and me.json()['email'] == 'alice@example.com'
    assert me.json()['role'] == 'user'
    assert 'password' not in me.text and 'hash' not in me.text
    with migrated.connect() as c:
        hashed = c.execute(text('SELECT password_hash FROM users')).scalar_one()
        assert hashed.startswith('$argon2id$') and PASSWORD not in hashed
        assert c.execute(text('SELECT token_hash FROM refresh_tokens')).scalar_one() != t['refresh_token']
    login = auth_client.post(AUTH + '/login', json={'email': 'ALICE@example.com', 'password': PASSWORD})
    assert login.status_code == 200
    assert login.json()['refresh_token'] != t['refresh_token']
    assert login.headers['cache-control'] == 'no-store'


def test_private_homes_and_atomic_owner(auth_client, migrated):
    with migrated.begin() as c:
        pilot = c.execute(text("INSERT INTO homes(id,name,distributor) VALUES(gen_random_uuid(),'pilot','EDESUR') RETURNING id")).scalar_one()
    a = register(auth_client)
    assert auth_client.get('/api/v1/homes', headers=bearer(a)).json() == []
    assert auth_client.get(f'/api/v1/homes/{pilot}', headers=bearer(a)).status_code == 404
    h = auth_client.post('/api/v1/homes', headers=bearer(a), json={'name':'private','distributor':'EDESUR'})
    assert h.status_code == 201
    hid = h.json()['id']
    with migrated.connect() as c:
        assert c.execute(text('SELECT role FROM home_members WHERE home_id=:h'), {'h': hid}).scalar_one() == 'owner'
    assert [x['id'] for x in auth_client.get('/api/v1/homes', headers=bearer(a)).json()] == [hid]
    b = register(auth_client, 'bob@example.com')
    assert auth_client.get('/api/v1/homes', headers=bearer(b)).json() == []
    assert auth_client.get(f'/api/v1/homes/{hid}', headers=bearer(b)).status_code == 404
    assert auth_client.get('/api/v1/homes').status_code == 401


@pytest.mark.parametrize('path', ['/api/v1/homes', AUTH+'/me'])
def test_missing_malformed_expired_forged_tokens(auth_client, path):
    from app.services.auth import now
    t = register(auth_client)
    claims = jwt.decode(t['access_token'], settings.AUTH_SIGNING_KEY, algorithms=['HS256'], audience=settings.AUTH_AUDIENCE)
    expired = jwt.encode(claims | {'exp': now()-timedelta(seconds=10)}, settings.AUTH_SIGNING_KEY, algorithm='HS256')
    forged = jwt.encode(claims, secrets.token_urlsafe(48), algorithm='HS256')
    for token in [None, '', 'not.jwt', expired, forged, 'x'*5000]:
        headers = {} if token is None else {'Authorization': 'Bearer '+token}
        r = auth_client.get(path, headers=headers)
        assert r.status_code == 401
        assert r.headers['www-authenticate'] == 'Bearer'


@pytest.mark.parametrize('field,value', [('role','admin'),('role','support'),('home_id',str(uuid.uuid4())),
                                       ('password','short'),('password','x'*129),('email','invalid')])
def test_registration_validation_and_no_secret_echo(auth_client, field, value):
    body = {'email':'alice@example.com','password':PASSWORD,field:value}
    r = auth_client.post(AUTH+'/register', json=body)
    assert r.status_code == 422
    assert PASSWORD not in r.text and 'x'*129 not in r.text


def test_logout_rotation_reuse_and_other_session(auth_client):
    t = register(auth_client)
    independent = auth_client.post(AUTH+'/login', json={'email':'alice@example.com','password':PASSWORD}).json()
    rotated = auth_client.post(AUTH+'/refresh', json={'refresh_token':t['refresh_token']})
    assert rotated.status_code == 200
    r = rotated.json()
    assert r['refresh_token'] != t['refresh_token']
    assert auth_client.post(AUTH+'/refresh', json={'refresh_token':t['refresh_token']}).status_code == 401
    assert auth_client.post(AUTH+'/refresh', json={'refresh_token':r['refresh_token']}).status_code == 401
    assert auth_client.get(AUTH+'/me', headers=bearer(r)).status_code == 401
    assert auth_client.get(AUTH+'/me', headers=bearer(independent)).status_code == 200
    assert auth_client.post(AUTH+'/logout', json={'refresh_token':independent['refresh_token']}).status_code == 204
    assert auth_client.post(AUTH+'/logout', json={'refresh_token':independent['refresh_token']}).status_code == 204
    assert auth_client.get(AUTH+'/me', headers=bearer(independent)).status_code == 401
    assert auth_client.post(AUTH+'/refresh', json={'refresh_token':independent['refresh_token']}).status_code == 401


def test_concurrent_refresh_revokes_family(auth_client):
    t = register(auth_client)
    def refresh(_):
        return auth_client.post(AUTH+'/refresh', json={'refresh_token':t['refresh_token']})
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(refresh, range(2)))
    assert sorted(r.status_code for r in results) == [200,401]
    winner = next(r.json() for r in results if r.status_code == 200)
    assert auth_client.get(AUTH+'/me', headers=bearer(winner)).status_code == 401
    assert auth_client.post(AUTH+'/refresh', json={'refresh_token':winner['refresh_token']}).status_code == 401


@pytest.mark.parametrize('changes', [{'aud':'wrong'},{'iss':'wrong'},{'type':'refresh'},{'sid':'invalid'},
                                    {'sub':'invalid'},{'sid':str(uuid.uuid4())},{'nbf':9999999999},
                                    {'exp':{'bad':1}},{'iat':[]},{'sub':None}])
def test_signed_bad_claims_are_unauthorized(auth_client, changes):
    t = register(auth_client)
    claims = jwt.decode(t['access_token'], settings.AUTH_SIGNING_KEY, algorithms=['HS256'],audience=settings.AUTH_AUDIENCE)
    token = jwt.encode(claims | changes, settings.AUTH_SIGNING_KEY,algorithm='HS256')
    assert auth_client.get(AUTH+'/me',headers={'Authorization':'Bearer '+token}).status_code == 401


def test_expired_refresh_and_inactive_user(auth_client,migrated):
    t = register(auth_client)
    with migrated.begin() as c:
        c.execute(text("UPDATE auth_sessions SET expires_at=now()-interval '1 second'"))
    assert auth_client.post(AUTH+'/refresh',json={'refresh_token':t['refresh_token']}).status_code == 401
    assert auth_client.get(AUTH+'/me',headers=bearer(t)).status_code == 401
    t = auth_client.post(AUTH+'/login',json={'email':'alice@example.com','password':PASSWORD}).json()
    with migrated.begin() as c:
        c.execute(text('UPDATE users SET active=false'))
    assert auth_client.get(AUTH+'/me',headers=bearer(t)).status_code == 401
    assert auth_client.post(AUTH+'/login',json={'email':'alice@example.com','password':PASSWORD}).status_code == 401
    assert auth_client.post(AUTH+'/refresh',json={'refresh_token':t['refresh_token']}).status_code == 401


def test_concurrent_refresh_and_logout_cannot_resurrect_session(auth_client):
    t = register(auth_client)
    def operation(kind):
        return auth_client.post(AUTH+'/'+kind,json={'refresh_token':t['refresh_token']})
    with ThreadPoolExecutor(max_workers=2) as pool:
        refresh, logout = list(pool.map(operation,['refresh','logout']))
    assert logout.status_code == 204
    assert refresh.status_code in {200,401}
    assert auth_client.get(AUTH+'/me',headers=bearer(t)).status_code == 401
    if refresh.status_code == 200:
        assert auth_client.get(AUTH+'/me',headers=bearer(refresh.json())).status_code == 401
        assert auth_client.post(AUTH+'/refresh',json={'refresh_token':refresh.json()['refresh_token']}).status_code == 401


def test_jwt_missing_required_claims_and_unsigned(auth_client):
    t = register(auth_client)
    claims = jwt.decode(t['access_token'],settings.AUTH_SIGNING_KEY,algorithms=['HS256'],audience=settings.AUTH_AUDIENCE)
    for key in ['exp','sub','sid','iat','nbf','iss','aud','type','jti']:
        incomplete = dict(claims)
        incomplete.pop(key)
        token = jwt.encode(incomplete,settings.AUTH_SIGNING_KEY,algorithm='HS256')
        assert auth_client.get(AUTH+'/me',headers={'Authorization':'Bearer '+token}).status_code == 401
    unsigned = jwt.encode(claims,'',algorithm='none')
    assert auth_client.get(AUTH+'/me',headers={'Authorization':'Bearer '+unsigned}).status_code == 401
    assert auth_client.get(AUTH+'/me',headers={'Authorization':'Basic '+t['access_token']}).status_code == 401


def test_health_engine_uses_only_isolated_database(client,migrated):
    from app.main import engine
    assert engine is migrated


def test_auth_endpoints_disabled_in_legacy(client):
    assert client.post(AUTH+'/register',json={'email':'alice@example.com','password':PASSWORD}).status_code == 404
    assert client.get(AUTH+'/me').status_code == 404


def test_login_generic_duplicate_and_invalid_refresh(auth_client):
    register(auth_client)
    responses = [auth_client.post(AUTH+'/login', json={'email':email,'password':'wrong-password-123'})
                 for email in ['alice@example.com','missing@example.com']]
    assert all(r.status_code == 401 for r in responses)
    assert responses[0].json()['detail'] == responses[1].json()['detail']
    assert auth_client.post(AUTH+'/register', json={'email':'ALICE@example.com','password':PASSWORD}).status_code == 409
    assert auth_client.post(AUTH+'/refresh', json={'refresh_token':'z'*43}).status_code == 401
    assert auth_client.post(AUTH+'/refresh', json={'refresh_token':'invalid'}).status_code == 422

