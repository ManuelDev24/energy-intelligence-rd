"""Auditoría C-10: verificación de correo (registro, reenvío, canje, avisos solo a correos confirmados)."""
import re
from datetime import timedelta

import pytest
from sqlalchemy import text

from app.config import settings
from app.services import email
from tests.test_auth import AUTH, auth_client, bearer, register  # noqa: F401

VERIFY, REQUEST = AUTH + '/email/verify', AUTH + '/email/verification'


@pytest.fixture
def mail_client(auth_client, monkeypatch):
    monkeypatch.setitem(settings.__dict__, 'EMAIL_BACKEND', 'console')
    monkeypatch.setitem(settings.__dict__, 'EMAIL_DEV_OUTBOX', '')
    email.DEV_OUTBOX.clear()
    yield auth_client
    email.DEV_OUTBOX.clear()


def verification_tokens(to='alice@example.com'):
    return [re.search(r'#token=([A-Za-z0-9_-]{43})', m.text).group(1) for m in email.DEV_OUTBOX
            if m.to == to and 'Confirma tu correo' in m.subject]


def me(client, tokens):
    return client.get(AUTH + '/me', headers=bearer(tokens)).json()


def test_registration_sends_a_single_use_link_and_the_account_starts_unverified(mail_client, migrated):
    tokens = register(mail_client)
    assert me(mail_client, tokens)['email_verified_at'] is None
    [token] = verification_tokens()
    message = email.DEV_OUTBOX[-1]
    assert f'{settings.EMAIL_VERIFICATION_URL}#token={token}' in message.text and '?token=' not in message.text
    with migrated.connect() as c:
        stored = c.execute(text('SELECT token_hash, email, used_at FROM email_verification_tokens')).one()
    assert stored.token_hash != token and len(stored.token_hash) == 64 and stored.email == 'alice@example.com'
    r = mail_client.post(VERIFY, json={'token': token})
    assert r.status_code == 204 and r.headers['cache-control'] == 'no-store'
    assert me(mail_client, tokens)['email_verified_at'] is not None
    again = mail_client.post(VERIFY, json={'token': token})
    assert again.status_code == 400 and again.json()['code'] == 'verification_token_invalid'


@pytest.mark.parametrize('body', [{'token': 'x' * 43}, {'token': 'short'}, {'token': 'a' * 43, 'extra': 1}, {}])
def test_unknown_or_malformed_tokens_are_rejected(mail_client, body):
    r = mail_client.post(VERIFY, json=body)
    assert r.status_code in (400, 422)


def test_an_expired_link_or_a_link_for_a_different_address_does_not_verify(mail_client, migrated):
    tokens = register(mail_client)
    [token] = verification_tokens()
    with migrated.begin() as c:
        c.execute(text("UPDATE email_verification_tokens SET expires_at = now() - interval '1 minute'"))
    assert mail_client.post(VERIFY, json={'token': token}).status_code == 400
    assert mail_client.post(REQUEST, headers=bearer(tokens)).json() == {'status': 'accepted'}
    [_, fresh] = verification_tokens()
    with migrated.begin() as c:  # el correo de la cuenta cambió después de emitir el enlace
        c.execute(text("UPDATE users SET email = 'otra@example.com'"))
    assert mail_client.post(VERIFY, json={'token': fresh}).status_code == 400
    with migrated.connect() as c:
        assert c.execute(text('SELECT email_verified_at FROM users')).scalar() is None


def test_resend_invalidates_the_previous_link_and_has_an_hourly_cap(mail_client, monkeypatch):
    monkeypatch.setitem(settings.__dict__, 'AUTH_FORGOT_LIMIT', 100)  # el tope por IP (presupuesto compartido con «olvidé») se prueba aparte
    tokens = register(mail_client)
    for _ in range(5):
        assert mail_client.post(REQUEST, headers=bearer(tokens)).status_code == 202
    sent = verification_tokens()
    assert len(sent) == settings.EMAIL_VERIFICATION_ACCOUNT_LIMIT  # el registro + 2 reenvíos; el resto, sin correo
    assert mail_client.post(VERIFY, json={'token': sent[0]}).status_code == 400  # el anterior ya no vale
    assert mail_client.post(VERIFY, json={'token': sent[-1]}).status_code == 204
    assert mail_client.post(REQUEST, headers=bearer(tokens)).json() == {'status': 'already_verified'}


def test_requesting_a_link_needs_a_session(mail_client):
    assert mail_client.post(REQUEST).status_code == 401


def test_alert_emails_are_skipped_for_unverified_addresses_and_sent_once_verified(mail_client, migrated):
    from app.services import notifications

    tokens = register(mail_client)
    user_id = me(mail_client, tokens)['id']
    with migrated.begin() as c:
        home = c.execute(text("INSERT INTO homes(id,name,distributor) VALUES(gen_random_uuid(),'Casa','EDESUR') RETURNING id")).scalar()
        c.execute(text("INSERT INTO home_members(home_id,user_id,role) VALUES(:h,:u,'owner')"), {'h': home, 'u': user_id})
        alert = c.execute(text("INSERT INTO alerts(id,home_id,type,severity,message) VALUES(gen_random_uuid(),:h,'bill_variation','critical','m') "
                               "RETURNING id"), {'h': home}).scalar()
        rows = [c.execute(text("INSERT INTO notifications(id,alert_id,user_id,channel,severity,status) "
                               "VALUES(gen_random_uuid(),:a,:u,'email',:s,'pending') RETURNING id"), {'a': alert, 'u': user_id, 's': s}).scalar()
                for s in ('warning', 'critical')]
    from sqlalchemy.orm import Session
    sent = []

    class Sender:
        def send(self, message):
            sent.append(message.to)
            return True
    with Session(migrated) as db:
        assert notifications.deliver(db, rows[0], attempt=1, max_attempts=3, email_sender=Sender()) == 'skipped'
    with migrated.connect() as c:
        assert c.execute(text("SELECT reason FROM notifications WHERE id=:i"), {'i': rows[0]}).scalar() == 'unverified_email'
    [token] = verification_tokens()
    mail_client.post(VERIFY, json={'token': token})
    with Session(migrated) as db:
        assert notifications.deliver(db, rows[1], attempt=1, max_attempts=3, email_sender=Sender()) == 'sent'
    assert sent == ['alice@example.com']


def test_the_verification_link_lives_in_the_fragment_and_must_be_https_outside_development():
    from pydantic import ValidationError

    from app.config import Settings
    for bad in ('https://x.example/v?x=1', 'https://x.example/v#f'):
        with pytest.raises(ValidationError, match='EMAIL_VERIFICATION_URL'):
            Settings(ENVIRONMENT='development', EMAIL_VERIFICATION_URL=bad)
    derived = Settings(ENVIRONMENT='development', PASSWORD_RESET_URL='https://app.energy.example/restablecer')
    assert derived.EMAIL_VERIFICATION_URL == 'https://app.energy.example/verificar-correo'
    assert timedelta(hours=Settings(ENVIRONMENT='development').EMAIL_VERIFICATION_TTL_HOURS) == timedelta(hours=48)
