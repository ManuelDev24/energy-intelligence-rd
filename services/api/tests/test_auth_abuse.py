from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from pathlib import Path

import pytest
from alembic import command
from sqlalchemy import create_engine, inspect, select, text
from fastapi import FastAPI
from fastapi.testclient import TestClient

from tests.test_auth import auth_client, AUTH, PASSWORD


def test_container_uses_peer_without_implicit_proxy_trust():
    entrypoint = Path('docker-entrypoint.sh').read_text()
    assert '--no-proxy-headers' in entrypoint



def test_login_budget_survives_auth_failure(auth_client, monkeypatch):
    from app.config import settings
    monkeypatch.setitem(settings.__dict__, 'AUTH_LOGIN_LIMIT', 2)
    body = {'email': 'unknown@example.com', 'password': PASSWORD}
    assert auth_client.post(AUTH+'/login', json=body).status_code == 401
    assert auth_client.post(AUTH+'/login', json=body).status_code == 401
    response = auth_client.post(AUTH+'/login', json=body)
    assert response.status_code == 429
    assert 1 <= int(response.headers['Retry-After']) <= 60
    assert response.json()['code'] == 'auth_rate_limited'
    assert 'unknown@example.com' not in response.text
    assert response.headers['Cache-Control'] == 'no-store'


def test_registration_budget(auth_client, monkeypatch):
    from app.config import settings
    monkeypatch.setitem(settings.__dict__, 'AUTH_REGISTER_LIMIT', 1)
    body = {'email': 'alice@example.com', 'password': PASSWORD, 'accept_terms': True}
    assert auth_client.post(AUTH+'/register', json=body).status_code == 201
    body['email'] = 'bob@example.com'
    assert auth_client.post(AUTH+'/register', json=body).status_code == 429


def test_refresh_budget(auth_client, monkeypatch):
    from app.config import settings
    from tests.test_auth import register
    monkeypatch.setitem(settings.__dict__, 'AUTH_REFRESH_LIMIT', 1)
    token = register(auth_client)['refresh_token']
    first = auth_client.post(AUTH+'/refresh', json={'refresh_token': token})
    assert first.status_code == 200
    assert auth_client.post(AUTH+'/refresh', json={'refresh_token': first.json()['refresh_token']}).status_code == 429


def test_window_reset_and_fractional_retry_after(migrated, monkeypatch):
    from app.config import settings
    from app.services import auth_abuse
    from app.models.auth_abuse import AuthAbuseBucket
    monkeypatch.setattr(settings, 'AUTH_ABUSE_WINDOW_SECONDS', 60)
    key = auth_abuse.bucket_key('login', '192.0.2.1')
    with migrated.begin() as conn:
        start = conn.scalar(select(text('clock_timestamp()')))
        conn.execute(AuthAbuseBucket.__table__.insert().values(key=key, window_started_at=start, attempts=1))
    current = start + timedelta(seconds=0.2)
    monkeypatch.setattr(auth_abuse, 'database_now', lambda db: current)
    with pytest.raises(auth_abuse.RateLimited) as exc:
        auth_abuse.enforce(migrated, 'login', '192.0.2.1', 1)
    assert exc.value.retry_after == 60
    current = start + timedelta(seconds=59.2)
    with pytest.raises(auth_abuse.RateLimited) as exc:
        auth_abuse.enforce(migrated, 'login', '192.0.2.1', 1)
    assert exc.value.retry_after == 1
    current = start + timedelta(seconds=60)
    auth_abuse.enforce(migrated, 'login', '192.0.2.1', 1)
    with migrated.connect() as conn:
        assert conn.execute(select(AuthAbuseBucket.attempts)).scalar_one() == 1
        assert conn.execute(select(AuthAbuseBucket.window_started_at)).scalar_one() == current


def test_atomic_budget_across_independent_engines(migrated):
    from app.services.auth_abuse import enforce, RateLimited
    engines = [create_engine(migrated.url, hide_parameters=True) for _ in range(3)]
    def attempt(i):
        try:
            enforce(engines[i % 3], 'login', '192.0.2.9', 4)
            return 'allowed'
        except RateLimited:
            return 'blocked'
    try:
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(attempt, range(16)))
        assert results.count('allowed') == 4
        assert results.count('blocked') == 12
        with migrated.connect() as conn:
            assert conn.scalar(text('SELECT attempts FROM auth_abuse_buckets')) == 4
    finally:
        for engine in engines:
            engine.dispose()


def test_no_bypass_between_apps_or_forwarded_headers(auth_client, monkeypatch):
    from app.config import settings
    from app.main import app, application_error
    from app.api.v1.auth import router
    from app.database import get_db
    from app.services.errors import ApplicationError
    monkeypatch.setattr(settings, 'AUTH_LOGIN_LIMIT', 1)
    body = {'email': 'unknown@example.com', 'password': PASSWORD}
    assert auth_client.post(AUTH+'/login', json=body).status_code == 401
    other = FastAPI()
    other.include_router(router, prefix='/api/v1')
    other.dependency_overrides[get_db] = app.dependency_overrides[get_db]
    other.add_exception_handler(ApplicationError, application_error)
    with TestClient(other) as client:
        response = client.post(AUTH+'/login', json=body, headers={'X-Forwarded-For': '192.0.2.44', 'Forwarded': 'for=192.0.2.44'})
    assert response.status_code == 429


@pytest.mark.parametrize('operation', ['login', 'register', 'refresh'])
def test_invalid_payload_also_consumes_budget(auth_client, monkeypatch, operation):
    from app.config import settings
    monkeypatch.setattr(settings, f'AUTH_{operation.upper()}_LIMIT', 1)
    assert auth_client.post(AUTH+'/'+operation, json={}).status_code == 422
    assert auth_client.post(AUTH+'/'+operation, json={}).status_code == 429


def test_throttle_does_not_change_authorization_or_other_routes(auth_client, monkeypatch):
    from app.config import settings
    from tests.test_auth import register, bearer
    monkeypatch.setattr(settings, 'AUTH_REGISTER_LIMIT', 1)
    tokens = register(auth_client)
    assert auth_client.post(AUTH+'/register', json={}).status_code == 429
    assert auth_client.get('/health/live').status_code == 200
    assert auth_client.get('/health').status_code == 200
    assert auth_client.get('/api/v1/tariffs').status_code == 200
    assert auth_client.get('/api/v1/homes').status_code == 401
    assert auth_client.get('/api/v1/homes', headers=bearer(tokens)).status_code == 200
    assert auth_client.get(AUTH+'/me', headers=bearer(tokens)).status_code == 200
    assert auth_client.post(AUTH+'/logout', json={'refresh_token': tokens['refresh_token']}).status_code == 204
    assert auth_client.get(AUTH+'/me', headers=bearer(tokens)).status_code == 401


def test_keys_and_logs_do_not_contain_identifiers(auth_client, migrated, monkeypatch, capsys):
    from app.config import settings
    from app.services.auth_abuse import bucket_key
    monkeypatch.setattr(settings, 'AUTH_LOGIN_LIMIT', 1)
    body = {'email': 'sensitive@example.com', 'password': PASSWORD}
    auth_client.post(AUTH+'/login', json=body)
    response = auth_client.post(AUTH+'/login', json=body)
    assert response.status_code == 429
    with migrated.connect() as conn:
        keys = conn.execute(text('SELECT key FROM auth_abuse_buckets')).scalars().all()
    assert len(keys) == 1 and len(keys[0]) == 64
    assert keys[0] == bucket_key('login', 'testclient')
    assert bucket_key('login', '192.0.2.1') != bucket_key('register', '192.0.2.1')
    output = capsys.readouterr()
    for value in [body['email'], PASSWORD, 'testclient', settings.AUTH_SIGNING_KEY]:
        assert value not in output.out + output.err + response.text


def test_storage_failure_is_redacted_and_fail_closed(auth_client, migrated, capsys):
    with migrated.begin() as conn:
        conn.execute(text('DROP TABLE auth_abuse_buckets'))
    response = auth_client.post(AUTH+'/login', json={'email': 'sensitive@example.com', 'password': PASSWORD})
    assert response.status_code == 503
    assert response.json()['code'] == 'auth_unavailable'
    assert response.headers['Cache-Control'] == 'no-store'
    output = capsys.readouterr()
    assert 'sensitive@example.com' not in response.text + output.err
    assert 'INSERT INTO' not in response.text + output.err
    assert auth_client.get('/health/live').status_code == 200


def test_0010_roundtrip_preserves_other_data(migrated, alembic_cfg):
    with migrated.begin() as conn:
        home = conn.scalar(text("INSERT INTO homes(id,name,distributor) VALUES(gen_random_uuid(),'own fixture','EDESUR') RETURNING id"))
    assert 'auth_abuse_buckets' in inspect(migrated).get_table_names()
    command.downgrade(alembic_cfg, '0009')
    assert 'auth_abuse_buckets' not in inspect(migrated).get_table_names()
    command.upgrade(alembic_cfg, '0010')
    with migrated.connect() as conn:
        assert conn.scalar(text('SELECT id FROM homes')) == home
        assert conn.scalar(text('SELECT count(*) FROM auth_abuse_buckets')) == 0


@pytest.mark.parametrize('field', ['AUTH_LOGIN_LIMIT', 'AUTH_REGISTER_LIMIT', 'AUTH_REFRESH_LIMIT', 'AUTH_ABUSE_WINDOW_SECONDS'])
@pytest.mark.parametrize('value', [0, -1, 100000])
def test_abuse_config_rejects_invalid_limits(field, value):
    from app.config import Settings
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        Settings(_env_file=None, AUTH_ENABLED=False, ENVIRONMENT='development', **{field: value})


# ---------- ERD-SEC-PROXY-01: IP de cliente verificada detrás de Render/Cloudflare ----------
CLIENT_IP_SECRET = 'x' * 48


def _cf(settings, monkeypatch, secret=CLIENT_IP_SECRET):
    monkeypatch.setattr(settings, 'CLIENT_IP_SOURCE', 'cf-connecting-ip')
    monkeypatch.setattr(settings, 'BFF_API_SHARED_SECRET', secret)


def test_two_signed_client_ips_do_not_share_a_budget(auth_client, monkeypatch):
    from app.config import settings
    from app.services.client_ip import sign_client_ip
    _cf(settings, monkeypatch)
    monkeypatch.setattr(settings, 'AUTH_LOGIN_LIMIT', 1)
    body = {'email': 'unknown@example.com', 'password': PASSWORD}
    headers_a = {'X-Forwarded-Client-Ip': sign_client_ip('203.0.113.10', CLIENT_IP_SECRET)}
    headers_b = {'X-Forwarded-Client-Ip': sign_client_ip('203.0.113.20', CLIENT_IP_SECRET)}
    assert auth_client.post(AUTH + '/login', json=body, headers=headers_a).status_code == 401
    assert auth_client.post(AUTH + '/login', json=body, headers=headers_b).status_code == 401
    # Previously all web traffic aggregated on one proxy IP: a second attempt from EITHER
    # distinct signed IP would already have been 429. Each now has its own bucket.
    assert auth_client.post(AUTH + '/login', json=body, headers=headers_a).status_code == 429
    assert auth_client.post(AUTH + '/login', json=body, headers=headers_b).status_code == 429


def test_expired_signed_header_falls_back_to_cf_connecting_ip(auth_client, monkeypatch):
    from app.config import settings
    from app.services.client_ip import sign_client_ip
    import time
    _cf(settings, monkeypatch)
    monkeypatch.setattr(settings, 'AUTH_LOGIN_LIMIT', 1)
    stale = sign_client_ip('198.51.100.5', CLIENT_IP_SECRET, now=time.time() - 120)
    body = {'email': 'unknown@example.com', 'password': PASSWORD}
    headers = {'X-Forwarded-Client-Ip': stale, 'CF-Connecting-IP': '198.51.100.9'}
    assert auth_client.post(AUTH + '/login', json=body, headers=headers).status_code == 401
    # Second call with the SAME expired signed header must have consumed the CF-Connecting-IP
    # bucket (198.51.100.9), not the stale signed one (198.51.100.5): a fresh request carrying
    # ONLY that CF-Connecting-IP is already rate limited.
    assert auth_client.post(AUTH + '/login', json=body, headers={'CF-Connecting-IP': '198.51.100.9'}).status_code == 429
    # A different CF-Connecting-IP still has its own fresh budget.
    assert auth_client.post(AUTH + '/login', json=body, headers={'CF-Connecting-IP': '198.51.100.77'}).status_code == 401


def test_future_signed_header_is_rejected_and_falls_back(auth_client, monkeypatch):
    from app.config import settings
    from app.services.client_ip import sign_client_ip
    import time
    _cf(settings, monkeypatch)
    monkeypatch.setattr(settings, 'AUTH_LOGIN_LIMIT', 1)
    future = sign_client_ip('198.51.100.6', CLIENT_IP_SECRET, now=time.time() + 120)
    body = {'email': 'unknown@example.com', 'password': PASSWORD}
    headers = {'X-Forwarded-Client-Ip': future, 'CF-Connecting-IP': '198.51.100.44'}
    assert auth_client.post(AUTH + '/login', json=body, headers=headers).status_code == 401
    assert auth_client.post(AUTH + '/login', json=body, headers={'CF-Connecting-IP': '198.51.100.44'}).status_code == 429


def test_missing_cf_connecting_ip_falls_back_to_socket_with_logged_warning(auth_client, monkeypatch, caplog):
    import logging
    from app.config import settings
    _cf(settings, monkeypatch)
    logger = logging.getLogger('energyrd.api')
    caplog.set_level(logging.WARNING, logger='energyrd.api')
    logger.addHandler(caplog.handler)
    try:
        body = {'email': 'unknown@example.com', 'password': PASSWORD}
        response = auth_client.post(AUTH + '/login', json=body)
    finally:
        logger.removeHandler(caplog.handler)
    assert response.status_code == 401
    assert any(rec.getMessage() == 'client_ip_fallback_to_socket' for rec in caplog.records)


def test_missing_cf_connecting_ip_uses_same_bucket_as_socket_default(auth_client, monkeypatch, migrated):
    from app.config import settings
    from app.services.auth_abuse import bucket_key
    _cf(settings, monkeypatch)
    monkeypatch.setattr(settings, 'AUTH_LOGIN_LIMIT', 1)
    body = {'email': 'unknown@example.com', 'password': PASSWORD}
    assert auth_client.post(AUTH + '/login', json=body).status_code == 401
    assert auth_client.post(AUTH + '/login', json=body).status_code == 429
    with migrated.connect() as conn:
        keys = conn.execute(text('SELECT key FROM auth_abuse_buckets')).scalars().all()
    assert keys == [bucket_key('login', 'testclient')]


def test_socket_mode_still_ignores_signed_and_cf_headers(auth_client, monkeypatch):
    # Default CLIENT_IP_SOURCE stays 'socket': neither header must change the bucket peer,
    # confirming this slice does not weaken the pre-existing default behavior.
    from app.config import settings
    from app.services.client_ip import sign_client_ip
    from app.services.auth_abuse import bucket_key
    monkeypatch.setattr(settings, 'AUTH_LOGIN_LIMIT', 1)
    body = {'email': 'unknown@example.com', 'password': PASSWORD}
    headers = {'X-Forwarded-Client-Ip': sign_client_ip('203.0.113.99', CLIENT_IP_SECRET),
               'CF-Connecting-IP': '203.0.113.99'}
    assert auth_client.post(AUTH + '/login', json=body, headers=headers).status_code == 401
    response = auth_client.post(AUTH + '/login', json=body, headers=headers)
    assert response.status_code == 429
