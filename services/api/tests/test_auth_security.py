"""Regression checks from the independent auth security review."""
import logging
import sys

import pytest
from sqlalchemy import create_engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.database import engine
from app.observability import JsonFormatter
from app.schemas.auth import Credentials
from app.services.auth import register as register_account
from tests.test_auth import auth_client, bearer, register
import uuid
import json


@pytest.mark.parametrize('operation', ['register', 'login'])
@pytest.mark.parametrize('invalid_codepoint', ['\ud800', '\udfff'])
def test_invalid_password_unicode_is_rejected_without_echo(auth_client, operation, invalid_codepoint):
    password = 'valid-length-password-' + invalid_codepoint
    encoded = json.dumps({'email': 'unicode@example.com', 'password': password})
    response = auth_client.post('/api/v1/auth/' + operation, content=encoded,
                                headers={'Content-Type': 'application/json'})
    assert response.status_code == 422
    assert all('input' not in e and 'ctx' not in e for e in response.json()['detail'])


@pytest.mark.parametrize('method,path_tail,body', [
    ('GET', '', None),
    ('PATCH', '', {'name': 'changed'}),
    ('DELETE', '', None),
    ('POST', '/bills', {}),
    ('GET', '/dashboard', None),
])
def test_unknown_and_foreign_home_have_identical_error_bodies(auth_client, method, path_tail, body):
    owner = register(auth_client)
    home = auth_client.post('/api/v1/homes', headers=bearer(owner),
                            json={'name': 'private', 'distributor': 'EDESUR'}).json()['id']
    stranger = register(auth_client, 'stranger@example.com')
    responses = [auth_client.request(method, f'/api/v1/homes/{hid}{path_tail}',
                                    headers=bearer(stranger), json=body)
                 for hid in [home, str(uuid.uuid4())]]
    assert all(r.status_code == 404 for r in responses)
    bodies = [{k: v for k, v in r.json().items() if k != 'request_id'} for r in responses]
    assert bodies[0] == bodies[1]


def test_auth_service_respects_architecture_boundary():
    # Same rule CI enforces via scripts/check_architecture.py.
    import ast
    from pathlib import Path
    source = Path(__file__).resolve().parents[1] / 'app/services/auth.py'
    imports = [n.module or '' for n in ast.walk(ast.parse(source.read_text())) if isinstance(n, ast.ImportFrom)]
    assert not any(m.startswith('fastapi') for m in imports)


def test_unauthorized_envelope_is_unchanged(auth_client):
    r = auth_client.get('/api/v1/auth/me', headers={'Authorization': 'Bearer not.a.jwt'})
    assert r.status_code == 401
    assert r.headers['www-authenticate'] == 'Bearer'
    body = r.json()
    assert body['detail'] == 'Credenciales inválidas' and body['code'] == 'http_401'


def test_sql_failure_logs_do_not_expose_auth_parameters():
    # Match the deployed engine's redaction setting; no persistent DB is touched.
    probe = create_engine('sqlite:///:memory:', hide_parameters=engine.hide_parameters)
    credentials = Credentials(email='redaction-probe@example.com', password='redaction-probe-password')
    try:
        with Session(probe) as db:
            with pytest.raises(SQLAlchemyError):
                try:
                    register_account(db, credentials)
                except SQLAlchemyError:
                    record = logging.LogRecord('energyrd.api', logging.ERROR, __file__, 0,
                                               'unhandled error', (), sys.exc_info())
                    formatted = JsonFormatter().format(record)
                    assert credentials.email not in formatted, 'SQL parameters leaked into logs'
                    assert '$argon2id$' not in formatted, 'Password hash leaked into logs'
                    raise
    finally:
        probe.dispose()
