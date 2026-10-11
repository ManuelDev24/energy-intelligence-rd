"""ERD-SHARE-01: invitar, aceptar, revocar, expulsar, salir y transferir la propiedad de una vivienda."""
import re
from datetime import timedelta

import pytest
from sqlalchemy import text

from app.config import settings
from app.services import email
from tests.test_auth import AUTH, PASSWORD, auth_client, bearer, register  # noqa: F401
from tests.test_authorization import setup_homes  # noqa: F401

ACCEPT = '/api/v1/invitations/accept'
NEW_PASSWORD = 'brand-new-password-456'


@pytest.fixture
def share(auth_client, monkeypatch):
    monkeypatch.setitem(settings.__dict__, 'EMAIL_BACKEND', 'console')
    monkeypatch.setitem(settings.__dict__, 'EMAIL_DEV_OUTBOX', '')
    monkeypatch.setitem(settings.__dict__, 'INVITATION_URL', 'https://app.energy.example/invitacion')
    email.DEV_OUTBOX.clear()
    yield auth_client
    email.DEV_OUTBOX.clear()


def home_of(client, tokens, name='Casa compartida'):
    return client.post('/api/v1/homes', headers=bearer(tokens), json={'name': name, 'distributor': 'EDESUR'}).json()['id']


def invite(client, tokens, home, address='bob@example.com'):
    return client.post(f'/api/v1/homes/{home}/invitations', headers=bearer(tokens), json={'email': address})


def last_token():
    return re.search(r'#token=([A-Za-z0-9_-]{43})', email.DEV_OUTBOX[-1].text).group(1)


def accept(client, tokens, token):
    return client.post(ACCEPT, headers=bearer(tokens), json={'token': token})


def members(client, tokens, home):
    return client.get(f'/api/v1/homes/{home}/members', headers=bearer(tokens))


def setup(client):
    alice, bob = register(client), register(client, 'bob@example.com')
    return alice, bob, home_of(client, alice)


def test_invitation_flow_gives_the_invitee_member_access(share):
    alice, bob, home = setup(share)
    created = invite(share, alice, home)
    assert created.status_code == 201 and created.headers['cache-control'] == 'no-store'
    body = created.json()
    assert set(body) == {'id', 'email', 'created_at', 'expires_at'} and body['email'] == 'bob@example.com'
    sent = email.DEV_OUTBOX[-1]
    assert sent.to == 'bob@example.com' and 'https://app.energy.example/invitacion#token=' in sent.text
    assert '?token=' not in sent.text and 'alice@example.com' not in sent.text
    assert share.get(f'/api/v1/homes/{home}', headers=bearer(bob)).status_code == 404
    joined = accept(share, bob, last_token())
    assert joined.status_code == 200 and joined.json()['id'] == home and joined.headers['cache-control'] == 'no-store'
    assert share.get(f'/api/v1/homes/{home}/dashboard', headers=bearer(bob)).status_code == 200
    assert [h['id'] for h in share.get('/api/v1/homes', headers=bearer(bob)).json()] == [home]
    roles = {m['email']: m['role'] for m in members(share, alice, home).json()}
    assert roles == {'alice@example.com': 'owner', 'bob@example.com': 'member'}


def test_token_is_stored_hashed_and_single_use(share, migrated):
    alice, bob, home = setup(share)
    invite(share, alice, home)
    token = last_token()
    with migrated.connect() as c:
        stored = c.execute(text('SELECT token_hash FROM home_invitations')).scalar_one()
    assert stored != token and len(stored) == 64
    assert accept(share, bob, token).status_code == 200
    again = accept(share, bob, token)
    assert again.status_code == 400 and again.json()['code'] == 'invitation_invalid'
    carol = register(share, 'carol@example.com')
    assert accept(share, carol, token).status_code == 400


def test_only_the_invited_email_can_accept_and_errors_are_indistinguishable(share):
    alice, bob, home = setup(share)
    carol = register(share, 'carol@example.com')
    invite(share, alice, home)
    token = last_token()
    wrong = accept(share, carol, token)
    unknown = accept(share, carol, 'A' * 43)
    assert wrong.status_code == unknown.status_code == 400
    strip = lambda r: {k: v for k, v in r.json().items() if k != 'request_id'}
    assert strip(wrong) == strip(unknown)
    assert share.get(f'/api/v1/homes/{home}', headers=bearer(carol)).status_code == 404
    assert accept(share, bob, token).status_code == 200  # el token no se quema por el intento ajeno


def test_accept_validates_the_token_shape_and_requires_a_session(share):
    alice, bob, home = setup(share)
    assert share.post(ACCEPT, json={'token': 'A' * 43}).status_code == 401
    for bad in ('short', 'A' * 42 + '!', 'A' * 44, ''):
        assert accept(share, bob, bad).status_code == 422
    assert share.post(ACCEPT, headers=bearer(bob), json={'token': 'A' * 43, 'extra': 1}).status_code == 422


def test_expired_and_revoked_invitations_cannot_be_accepted(share, migrated):
    alice, bob, home = setup(share)
    invite(share, alice, home)
    expired = last_token()
    with migrated.begin() as c:
        c.execute(text("UPDATE home_invitations SET expires_at = now() - interval '1 minute'"))
    assert accept(share, bob, expired).status_code == 400
    # Una invitación vencida no bloquea una nueva al mismo correo.
    assert invite(share, alice, home).status_code == 201
    fresh = last_token()
    listed = share.get(f'/api/v1/homes/{home}/invitations', headers=bearer(alice)).json()
    assert len(listed) == 1
    assert share.delete(f"/api/v1/homes/{home}/invitations/{listed[0]['id']}", headers=bearer(alice)).status_code == 204
    assert accept(share, bob, fresh).status_code == 400
    assert share.get(f'/api/v1/homes/{home}/invitations', headers=bearer(alice)).json() == []


def test_invitation_rules(share, migrated):
    alice, bob, home = setup(share)
    assert invite(share, alice, home, 'alice@example.com').status_code == 422          # a sí mismo
    assert invite(share, alice, home, 'not-an-email').status_code == 422
    assert invite(share, alice, home, 'Bob@Example.com').status_code == 201             # normaliza mayúsculas
    assert invite(share, alice, home, 'bob@example.com').status_code == 409             # ya hay una pendiente
    assert accept(share, bob, last_token()).status_code == 200
    assert invite(share, alice, home, 'bob@example.com').status_code == 409             # ya es miembro
    assert share.post(f'/api/v1/homes/{home}/invitations', headers=bearer(alice), json={'email': 'x@y.co', 'role': 'owner'}).status_code == 422


def test_pending_and_daily_limits_bound_email_abuse(share, monkeypatch):
    alice, bob, home = setup(share)
    monkeypatch.setitem(settings.__dict__, 'INVITATION_MAX_PENDING_PER_HOME', 2)
    assert [invite(share, alice, home, f'p{i}@example.com').status_code for i in range(3)] == [201, 201, 409]
    monkeypatch.setitem(settings.__dict__, 'INVITATION_MAX_PENDING_PER_HOME', 50)
    monkeypatch.setitem(settings.__dict__, 'INVITATION_DAILY_LIMIT_PER_USER', 3)
    other = home_of(share, alice, 'Otra')
    # Ya creó 2 en la vivienda anterior (la rechazada por el tope no cuenta): queda 1 de las 3 diarias.
    assert [invite(share, alice, other, f'q{i}@example.com').status_code for i in range(3)] == [201, 429, 429]


def test_only_owners_manage_sharing_and_outsiders_see_nothing(share):
    alice, bob, home = setup(share)
    carol = register(share, 'carol@example.com')
    invite(share, alice, home)
    accept(share, bob, last_token())
    base = f'/api/v1/homes/{home}'
    owner_only = [('GET', '/members', None), ('GET', '/invitations', None), ('POST', '/invitations', {'email': 'z@example.com'}),
                  ('DELETE', '/invitations/' + '1' * 8 + '-1111-4111-8111-' + '1' * 12, None),
                  ('POST', '/transfer-ownership', {'user_id': '1' * 8 + '-1111-4111-8111-' + '1' * 12, 'password': PASSWORD})]
    for method, path, body in owner_only:
        assert share.request(method, base + path, json=body, headers=bearer(bob)).status_code == 403, (method, path)   # miembro
        assert share.request(method, base + path, json=body, headers=bearer(carol)).status_code == 404, (method, path)  # ajeno
        assert share.request(method, base + path, json=body).status_code == 401, (method, path)


def test_owner_removes_a_member_and_access_ends_immediately(share):
    alice, bob, home = setup(share)
    invite(share, alice, home)
    accept(share, bob, last_token())
    bob_id = share.get('/api/v1/auth/me', headers=bearer(bob)).json()['id']
    alice_id = share.get('/api/v1/auth/me', headers=bearer(alice)).json()['id']
    assert share.delete(f'/api/v1/homes/{home}/members/{alice_id}', headers=bearer(alice)).status_code == 422     # no a sí mismo
    assert share.delete(f'/api/v1/homes/{home}/members/{bob_id}', headers=bearer(alice)).status_code == 204
    assert share.get(f'/api/v1/homes/{home}', headers=bearer(bob)).status_code == 404
    assert share.delete(f'/api/v1/homes/{home}/members/{bob_id}', headers=bearer(alice)).status_code == 404
    # Puede volver a invitarse (la invitación anterior quedó consumida).
    assert invite(share, alice, home).status_code == 201


def test_member_can_leave_and_owner_needs_a_successor(share):
    alice, bob, home = setup(share)
    invite(share, alice, home)
    accept(share, bob, last_token())
    assert share.delete(f'/api/v1/homes/{home}/members/me', headers=bearer(alice)).status_code == 409           # único propietario
    assert share.get(f'/api/v1/homes/{home}', headers=bearer(alice)).status_code == 200
    assert share.delete(f'/api/v1/homes/{home}/members/me', headers=bearer(bob)).status_code == 204
    assert share.get(f'/api/v1/homes/{home}', headers=bearer(bob)).status_code == 404
    assert share.delete(f'/api/v1/homes/{home}/members/me', headers=bearer(alice)).status_code == 409           # único miembro: borrar la vivienda
    assert share.get(f'/api/v1/homes/{home}', headers=bearer(alice)).status_code == 200


def test_transfer_requires_password_and_swaps_roles_atomically(share, migrated):
    alice, bob, home = setup(share)
    invite(share, alice, home)
    accept(share, bob, last_token())
    bob_id = share.get('/api/v1/auth/me', headers=bearer(bob)).json()['id']
    url = f'/api/v1/homes/{home}/transfer-ownership'
    wrong = share.post(url, headers=bearer(alice), json={'user_id': bob_id, 'password': 'not-the-real-password-1'})
    assert wrong.status_code == 403 and wrong.json()['code'] == 'reauthentication_failed'
    stranger = register(share, 'carol@example.com')
    carol_id = share.get('/api/v1/auth/me', headers=bearer(stranger)).json()['id']
    assert share.post(url, headers=bearer(alice), json={'user_id': carol_id, 'password': PASSWORD}).status_code == 404
    alice_id = share.get('/api/v1/auth/me', headers=bearer(alice)).json()['id']
    assert share.post(url, headers=bearer(alice), json={'user_id': alice_id, 'password': PASSWORD}).status_code == 422
    done = share.post(url, headers=bearer(alice), json={'user_id': bob_id, 'password': PASSWORD})
    assert done.status_code == 204
    with migrated.connect() as c:
        roles = dict(c.execute(text('SELECT u.email, m.role FROM home_members m JOIN users u ON u.id=m.user_id')).all())
    assert roles == {'alice@example.com': 'member', 'bob@example.com': 'owner'}
    assert share.delete(f'/api/v1/homes/{home}', headers=bearer(alice)).status_code == 403
    assert members(share, alice, home).status_code == 403
    assert members(share, bob, home).status_code == 200


def test_sole_owner_deletion_conflict_is_resolved_by_transfer_or_removal(share):
    alice, bob, home = setup(share)
    invite(share, alice, home)
    accept(share, bob, last_token())
    bob_id = share.get('/api/v1/auth/me', headers=bearer(bob)).json()['id']
    delete = lambda: share.request('DELETE', AUTH + '/me', headers=bearer(alice), json={'password': PASSWORD})
    assert delete().status_code == 409
    assert share.post(f'/api/v1/homes/{home}/transfer-ownership', headers=bearer(alice),
                      json={'user_id': bob_id, 'password': PASSWORD}).status_code == 204
    assert delete().status_code == 204
    assert [h['id'] for h in share.get('/api/v1/homes', headers=bearer(bob)).json()] == [home]
    assert members(share, bob, home).json() == [{'user_id': bob_id, 'email': 'bob@example.com', 'role': 'owner',
                                                 'joined_at': members(share, bob, home).json()[0]['joined_at']}]


def test_pending_invitations_die_with_the_home_and_membership_changes_are_audited(share, migrated):
    alice, bob, home = setup(share)
    invite(share, alice, home)
    accept(share, bob, last_token())
    invite(share, alice, home, 'carol@example.com')
    with migrated.connect() as c:
        ops = sorted(r[0] for r in c.execute(text("SELECT operation FROM audit_events WHERE entity IN ('home_member','home_invitation')")))
    assert ops.count('create') >= 3
    assert share.delete(f'/api/v1/homes/{home}', headers=bearer(alice)).status_code == 204
    with migrated.connect() as c:
        assert c.execute(text('SELECT count(*) FROM home_invitations')).scalar() == 0


def test_user_deletion_keeps_invitations_but_drops_the_link(share, migrated):
    alice, bob, home = setup(share)
    carol = register(share, 'carol@example.com')
    carol_home = home_of(share, carol, 'Casa de Carol')
    invite(share, carol, carol_home, 'bob@example.com')
    invite(share, alice, home)
    assert share.request('DELETE', AUTH + '/me', headers=bearer(carol), json={'password': PASSWORD}).status_code == 204
    with migrated.connect() as c:
        assert c.execute(text('SELECT count(*) FROM home_invitations')).scalar() == 1  # la de Carol se fue con su vivienda


def test_invitation_url_defaults_to_the_web_origin_of_the_reset_url():
    from app.config import Settings
    assert Settings(ENVIRONMENT='development').INVITATION_URL == 'http://localhost:3000/invitacion'
    derived = Settings(ENVIRONMENT='development', PASSWORD_RESET_URL='https://app.energy.example/restablecer-contrasena')
    assert derived.INVITATION_URL == 'https://app.energy.example/invitacion'


def test_invitation_url_follows_the_same_rules_as_the_reset_url():
    from app.config import Settings
    for bad in ('https://x.example/i?x=1', 'https://x.example/i#frag'):
        with pytest.raises(ValueError, match='INVITATION_URL'):
            Settings(ENVIRONMENT='development', INVITATION_URL=bad)
    with pytest.raises(ValueError, match='INVITATION_URL'):
        Settings(ENVIRONMENT='staging', DATABASE_URL='postgresql+psycopg://u:p@db.example/x', AUTH_ENABLED=True,
                 AUTH_SIGNING_KEY='k' * 20 + 'abcdefghijklmnopqrstuvwxyz', CORS_ORIGINS='https://a.example',
                 EMAIL_BACKEND='resend', RESEND_API_KEY='re_x', EMAIL_FROM='a@b.co',
                 PASSWORD_RESET_URL='https://a.example/r', INVITATION_URL='http://a.example/i')


def test_0015_roundtrip_and_one_active_invitation_per_email(migrated, alembic_cfg):
    from alembic import command
    from sqlalchemy import inspect
    from sqlalchemy.exc import IntegrityError
    with migrated.begin() as c:
        home = c.execute(text("INSERT INTO homes(id,name,distributor) VALUES(gen_random_uuid(),'Casa','EDESUR') RETURNING id")).scalar_one()
    insert = text("INSERT INTO home_invitations(id,home_id,email,token_hash,expires_at) "
                  "VALUES(gen_random_uuid(),:h,'a@example.com',:t,now() + interval '7 days')")
    with migrated.begin() as c:
        c.execute(insert, {'h': home, 't': 'a' * 64})
    with pytest.raises(IntegrityError), migrated.begin() as c:
        c.execute(insert, {'h': home, 't': 'b' * 64})            # mismo correo activo
    with migrated.begin() as c:
        c.execute(text("UPDATE home_invitations SET revoked_at = now()"))
        c.execute(insert, {'h': home, 't': 'b' * 64})            # tras revocar, otra es válida
    with pytest.raises(IntegrityError), migrated.begin() as c:
        c.execute(text("UPDATE home_invitations SET accepted_at = now(), revoked_at = now() WHERE token_hash = :t"), {'t': 'b' * 64})
    command.downgrade(alembic_cfg, '0014')
    assert 'home_invitations' not in inspect(migrated).get_table_names()
    with migrated.connect() as c:
        assert c.execute(text('SELECT count(*) FROM homes')).scalar() == 1
    command.upgrade(alembic_cfg, 'head')
    assert 'home_invitations' in inspect(migrated).get_table_names()
