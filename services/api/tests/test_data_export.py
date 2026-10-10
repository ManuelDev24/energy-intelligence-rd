"""ERD-LEGAL-FINAL: exportación de los datos del titular (acceso/portabilidad, derechos ARCO)."""
import json
import uuid

import pytest
from sqlalchemy import text

from tests.test_account_deletion import add_member, full_home
from tests.test_auth import AUTH, PASSWORD, auth_client, bearer, register  # noqa: F401

EXPORT = AUTH + '/me/export'


def export(client, tokens):
    return client.get(EXPORT, headers=bearer(tokens))


def test_export_contains_the_holders_own_data(auth_client, migrated):
    alice = register(auth_client)
    home = full_home(auth_client, alice)
    with migrated.begin() as c:
        c.execute(text("INSERT INTO documents(id,home_id,kind,content_type,size_bytes,sha256,storage_key,uploaded_via,retention_until) "
                       "VALUES(gen_random_uuid(),:h,'bill_photo','image/jpeg',10,:s,'homes/k/documents/x','web',now()+interval '7 days')"),
                  {'h': home, 's': 'a' * 64})
    r = export(auth_client, alice)
    assert r.status_code == 200
    assert r.headers['cache-control'] == 'no-store'
    assert r.headers['content-disposition'].startswith('attachment; filename="energyrd-datos-')
    data = r.json()
    assert data['account']['email'] == 'alice@example.com' and data['account']['terms_version']
    assert data['format_version'] == 1 and data['generated_at']
    [h] = data['homes']
    assert h['home']['id'] == home and h['role'] == 'owner' and h['home']['address'] == 'Calle Privada 1'
    assert h['contract']['account_number'] == 'ACC-123'
    assert h['goal']['monthly_kwh'] == '300.00'
    assert len(h['bills']) == 2 and h['bills'][0]['items'] is not None
    assert len(h['equipment']) == 1 and len(h['readings']) == 1 and h['alert_settings']['warning_pct'] == '10.00'
    assert len(h['alerts']) >= 1
    assert [d['kind'] for d in h['documents']] == ['bill_photo']
    assert len(data['sessions']) == 1 and set(data['sessions'][0]) == {'created_at', 'expires_at', 'revoked_at'}


def test_export_never_contains_secrets_or_other_peoples_data(auth_client, migrated):
    alice = register(auth_client)
    home = full_home(auth_client, alice)
    bob = register(auth_client, 'bob@example.com')
    add_member(migrated, home, 'bob@example.com')
    other_home = full_home(auth_client, bob, name='Casa de Bob', address='Calle Bob 9')
    auth_client.post(f'/api/v1/homes/{home}/invitations', headers=bearer(alice), json={'email': 'tercero@example.com'})
    dump = export(auth_client, alice).text
    for forbidden in ('password', 'argon2', 'token_hash', 'storage_key', 'bob@example.com', 'Calle Bob 9', 'Casa de Bob',
                      'tercero@example.com', 'refresh'):
        assert forbidden not in dump.lower(), forbidden
    assert other_home not in dump
    with migrated.connect() as c:
        digest = c.execute(text('SELECT password_hash FROM users WHERE email=:e'), {'e': 'alice@example.com'}).scalar_one()
    assert digest not in dump


def test_a_member_exports_a_shared_home_with_their_role_but_not_other_members(auth_client, migrated):
    alice = register(auth_client)
    home = full_home(auth_client, alice)
    bob = register(auth_client, 'bob@example.com')
    add_member(migrated, home, 'bob@example.com')
    data = export(auth_client, bob).json()
    assert [(h['home']['id'], h['role']) for h in data['homes']] == [(home, 'member')]
    assert 'alice@example.com' not in json.dumps(data)


def test_an_account_without_homes_exports_just_the_account(auth_client):
    tokens = register(auth_client)
    data = export(auth_client, tokens).json()
    assert data['homes'] == [] and data['account']['email'] == 'alice@example.com'


def test_export_requires_a_valid_session_and_is_rate_limited(auth_client, monkeypatch):
    from app.config import settings
    assert auth_client.get(EXPORT).status_code == 401
    assert auth_client.get(EXPORT, headers={'Authorization': 'Bearer garbage'}).status_code == 401
    monkeypatch.setitem(settings.__dict__, 'AUTH_LOGIN_LIMIT', 2)
    tokens = register(auth_client)
    assert [export(auth_client, tokens).status_code for _ in range(4)] == [200, 200, 429, 429]


def test_export_is_hidden_without_accounts(client):
    assert client.get(EXPORT).status_code == 404
