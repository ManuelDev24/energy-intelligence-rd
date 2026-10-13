"""ERD-AUTH-03: consentimiento de términos en el registro y versión legal pública."""
from datetime import datetime, timedelta, timezone

import pytest
from alembic import command
from sqlalchemy import inspect, text

from tests.test_auth import AUTH, PASSWORD, auth_client, bearer, register  # noqa: F401


def test_legal_versions_are_public_and_marked_draft(client):
    from app.services.legal import LEGAL_PRIVACY_VERSION, LEGAL_TERMS_VERSION
    response = client.get('/api/v1/legal')
    assert response.status_code == 200
    assert response.json() == {'terms_version': LEGAL_TERMS_VERSION,
                               'privacy_version': LEGAL_PRIVACY_VERSION, 'status': 'draft'}


def test_legal_versions_public_with_auth_enabled(auth_client):
    assert auth_client.get('/api/v1/legal').status_code == 200


@pytest.mark.parametrize('accept', ['missing', False, None, 'true', 1, 'yes'])
def test_register_requires_explicit_boolean_acceptance(auth_client, migrated, accept):
    body = {'email': 'alice@example.com', 'password': PASSWORD}
    if accept != 'missing':
        body['accept_terms'] = accept
    response = auth_client.post(AUTH + '/register', json=body)
    assert response.status_code == 422
    assert PASSWORD not in response.text
    with migrated.connect() as c:
        assert c.execute(text('SELECT count(*) FROM users')).scalar() == 0


def test_client_cannot_choose_terms_version(auth_client):
    body = {'email': 'alice@example.com', 'password': PASSWORD, 'accept_terms': True, 'terms_version': 'old'}
    assert auth_client.post(AUTH + '/register', json=body).status_code == 422


def test_register_stores_current_version_and_me_exposes_it(auth_client, migrated):
    from app.services.legal import LEGAL_TERMS_VERSION
    before = datetime.now(timezone.utc) - timedelta(seconds=5)
    tokens = register(auth_client)
    me = auth_client.get(AUTH + '/me', headers=bearer(tokens)).json()
    assert me['terms_version'] == LEGAL_TERMS_VERSION
    accepted = datetime.fromisoformat(me['terms_accepted_at'])
    assert before <= accepted <= datetime.now(timezone.utc) + timedelta(seconds=5)
    with migrated.connect() as c:
        assert c.execute(text('SELECT terms_version FROM users')).scalar_one() == LEGAL_TERMS_VERSION


def test_login_does_not_accept_consent_fields(auth_client):
    register(auth_client)
    body = {'email': 'alice@example.com', 'password': PASSWORD, 'accept_terms': True}
    assert auth_client.post(AUTH + '/login', json=body).status_code == 422


def test_legacy_users_without_consent_keep_working(auth_client, migrated):
    tokens = register(auth_client)
    with migrated.begin() as c:
        c.execute(text('UPDATE users SET terms_version=NULL, terms_accepted_at=NULL'))
    me = auth_client.get(AUTH + '/me', headers=bearer(tokens))
    assert me.status_code == 200
    assert me.json()['terms_version'] is None and me.json()['terms_accepted_at'] is None


def test_0012_upgrade_downgrade_keeps_legacy_users(migrated, alembic_cfg):
    command.downgrade(alembic_cfg, '0011')
    cols = {c['name'] for c in inspect(migrated).get_columns('users')}
    assert not ({'terms_version', 'terms_accepted_at'} & cols)
    with migrated.begin() as c:
        c.execute(text("INSERT INTO users(id,email,password_hash) VALUES(gen_random_uuid(),'legacy@example.com','x')"))
    command.upgrade(alembic_cfg, 'head')
    with migrated.connect() as c:
        row = c.execute(text('SELECT terms_version, terms_accepted_at FROM users')).one()
    assert tuple(row) == (None, None)


def test_0012_consent_pair_is_all_or_nothing(migrated):
    from sqlalchemy.exc import IntegrityError
    with pytest.raises(IntegrityError):
        with migrated.begin() as c:
            c.execute(text("INSERT INTO users(id,email,password_hash,terms_version) "
                           "VALUES(gen_random_uuid(),'half@example.com','x','2026-10-draft')"))


def test_privacy_draft_is_marked_and_lists_required_sections():
    from pathlib import Path
    doc = (Path(__file__).resolve().parents[3] / 'docs/legal/PRIVACY_AND_RETENTION_DRAFT.md').read_text()
    assert 'BORRADOR — requiere revisión legal (Ley 172-13 RD)' in doc.splitlines()[0]
    for section in ('Categorías de datos', 'Finalidades', 'Retención por categoría', 'Borrado de cuenta',
                    'Antiabuso', 'copias de seguridad'):
        assert section in doc, section
