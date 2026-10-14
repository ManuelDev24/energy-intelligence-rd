"""ERD-ADM-RBAC: deny-by-default admin layer, isolated from household permissions.

Coverage required by the spec: normal user -> 403, no session -> 401, each role uses only
its own scopes, immediate revocation, expired role, duplicate assignment, idempotent
bootstrap, last-super_admin protection, audit of assign/revoke, no sensitive data in audit,
isolation between admin and household permissions.
"""
import uuid
from datetime import timedelta

from sqlalchemy import text

from app.services.admin import bootstrap_super_admin, now
from tests.test_auth import AUTH, PASSWORD, auth_client, bearer, register

ADMIN = '/api/v1/admin'


def _grant(migrated, email, role, *, reason='test grant', expires_at=None, assigned_by=None, revoked=False,
           revoke_reason=None):
    with migrated.begin() as c:
        uid = c.execute(text('SELECT id FROM users WHERE email=:e'), {'e': email}).scalar_one()
        role_id = c.execute(text('SELECT id FROM admin_roles WHERE name=:r'), {'r': role}).scalar_one()
        params = {'u': uid, 'r': role_id, 'reason': reason, 'exp': expires_at, 'by': assigned_by,
                  'rev': now() if revoked else None, 'revby': assigned_by if revoked else None,
                  'revreason': revoke_reason if revoked else None}
        aid = c.execute(text(
            "INSERT INTO admin_role_assignments(id,user_id,role_id,assigned_by_user_id,reason,expires_at,"
            "revoked_at,revoked_by_user_id,revoke_reason) "
            "VALUES(gen_random_uuid(),:u,:r,:by,:reason,:exp,:rev,:revby,:revreason) RETURNING id"), params).scalar_one()
    return uid, aid


def _setup_admin(auth_client, migrated, role='super_admin', email='root@example.com'):
    t = register(auth_client, email)
    _grant(migrated, email, role)
    return t


def test_assignment_active_filter_excludes_expired_and_expired_filter_includes_only_expired(auth_client, migrated):
    token = _setup_admin(auth_client, migrated)
    register(auth_client, 'expired@example.com')
    register(auth_client, 'active@example.com')
    _grant(migrated, 'expired@example.com', 'auditor', expires_at=now() - timedelta(days=1))
    _grant(migrated, 'active@example.com', 'auditor')
    with migrated.connect() as c:
        expired_id = str(c.execute(text("SELECT id FROM users WHERE email='expired@example.com'")).scalar_one())
        active_id = str(c.execute(text("SELECT id FROM users WHERE email='active@example.com'")).scalar_one())
    active = auth_client.get(f'{ADMIN}/role-assignments?status=active', headers=bearer(token))
    assert active.status_code == 200
    assert active_id in [x['user_id'] for x in active.json()['items']]
    assert expired_id not in [x['user_id'] for x in active.json()['items']]
    expired = auth_client.get(f'{ADMIN}/role-assignments?status=expired', headers=bearer(token))
    assert expired.status_code == 200
    assert expired.json()['total'] == 1 and expired.json()['items'][0]['user_id'] == expired_id


def test_scope_authorized_audit_does_not_claim_operation_success(auth_client, migrated):
    token = _setup_admin(auth_client, migrated)
    r = auth_client.post(f'{ADMIN}/role-assignments', headers=bearer(token),
                         json={'user_id': str(uuid.uuid4()), 'role_name': 'auditor', 'reason': 'not found'})
    assert r.status_code == 404
    with migrated.connect() as c:
        assert c.execute(text("SELECT count(*) FROM admin_audit_events WHERE action='scope.check' AND result='success'")).scalar_one() == 0
        assert c.execute(text("SELECT count(*) FROM admin_audit_events WHERE action='scope.authorized' AND result='success'")).scalar_one() == 1
        assert c.execute(text("SELECT count(*) FROM admin_audit_events WHERE action='role.assign'")).scalar_one() == 0


def test_role_reason_rejects_secrets_before_immutable_audit(auth_client, migrated):
    admin_token = _setup_admin(auth_client, migrated)
    register(auth_client, 'target@example.com')
    with migrated.connect() as c:
        uid = c.execute(text("SELECT id FROM users WHERE email='target@example.com'")).scalar_one()
    for reason in ('Bearer abc.def', 'call private@example.com', 'cookie session=abc', 'call 8095551234'):
        r = auth_client.post(f'{ADMIN}/role-assignments', headers=bearer(admin_token),
                             json={'user_id':str(uid),'role_name':'auditor','reason':reason})
        assert r.status_code == 422, r.text
        assert reason not in r.text
    with migrated.connect() as c:
        assert c.execute(text("SELECT count(*) FROM admin_audit_events WHERE action='role.assign'")).scalar_one() == 0


def test_no_session_is_401(auth_client, migrated):
    assert auth_client.get(f'{ADMIN}/me').status_code == 401
    assert auth_client.get(f'{ADMIN}/roles').status_code == 401


def test_normal_user_without_admin_role_gets_empty_access_not_403_on_me(auth_client, migrated):
    t = register(auth_client)
    r = auth_client.get(f'{ADMIN}/me', headers=bearer(t))
    assert r.status_code == 200
    assert r.json()['roles'] == [] and r.json()['scopes'] == []


def test_normal_user_forbidden_on_scoped_routes(auth_client, migrated):
    t = register(auth_client)
    assert auth_client.get(f'{ADMIN}/roles', headers=bearer(t)).status_code == 403
    assert auth_client.get(f'{ADMIN}/audit-events', headers=bearer(t)).status_code == 403
    r = auth_client.post(f'{ADMIN}/role-assignments', headers=bearer(t),
                         json={'user_id': str(uuid.uuid4()), 'role_name': 'super_admin', 'reason': 'x'})
    assert r.status_code == 403


def test_home_membership_does_not_grant_admin_and_vice_versa(auth_client, migrated):
    """Isolation: a home owner has zero admin scopes; a super_admin gets zero home access
    just from being admin (home authorization is untouched by this module)."""
    t = register(auth_client)
    home = auth_client.post('/api/v1/homes', headers=bearer(t), json={'name': 'x', 'distributor': 'EDESUR'})
    assert home.status_code == 201
    assert auth_client.get(f'{ADMIN}/me', headers=bearer(t)).json()['scopes'] == []
    admin_t = _setup_admin(auth_client, migrated, role='super_admin', email='super@example.com')
    assert auth_client.get('/api/v1/homes', headers=bearer(admin_t)).json() == []


def test_each_role_has_exactly_its_own_scopes(auth_client, migrated):
    cases = {
        'super_admin': {'admin.roles.read', 'admin.roles.manage', 'admin.ocr.read', 'admin.ocr.retry',
                        'admin.ocr.review', 'admin.audit.read', 'admin.users.read', 'admin.system.read'},
        'operations_admin': {'admin.ocr.read', 'admin.ocr.retry', 'admin.ocr.review', 'admin.users.read',
                             'admin.system.read'},
        'ocr_reviewer': {'admin.ocr.read', 'admin.ocr.review'},
        'support_readonly': {'admin.users.read'},
        'auditor': {'admin.audit.read', 'admin.roles.read'},
    }
    for i, (role, scopes) in enumerate(cases.items()):
        email = f'role{i}@example.com'
        t = register(auth_client, email)
        _grant(migrated, email, role)
        me = auth_client.get(f'{ADMIN}/me', headers=bearer(t)).json()
        assert set(me['scopes']) == scopes, role
        assert me['roles'] == [role]
        # support_readonly has no admin.roles.read: cannot list roles.
        expect = 200 if 'admin.roles.read' in scopes else 403
        assert auth_client.get(f'{ADMIN}/roles', headers=bearer(t)).status_code == expect, role
        expect_audit = 200 if 'admin.audit.read' in scopes else 403
        assert auth_client.get(f'{ADMIN}/audit-events', headers=bearer(t)).status_code == expect_audit, role


def test_assign_revoke_and_immediate_effect(auth_client, migrated):
    admin_t = _setup_admin(auth_client, migrated)
    target_t = register(auth_client, 'bob@example.com')
    with migrated.connect() as c:
        bob_id = c.execute(text("SELECT id FROM users WHERE email='bob@example.com'")).scalar_one()
    assert auth_client.get(f'{ADMIN}/roles', headers=bearer(target_t)).status_code == 403

    r = auth_client.post(f'{ADMIN}/role-assignments', headers=bearer(admin_t),
                         json={'user_id': str(bob_id), 'role_name': 'auditor', 'reason': 'needs audit access'})
    assert r.status_code == 200, r.text
    assignment_id = r.json()['id']
    assert auth_client.get(f'{ADMIN}/me', headers=bearer(target_t)).json()['roles'] == ['auditor']
    assert auth_client.get(f'{ADMIN}/audit-events', headers=bearer(target_t)).status_code == 200

    revoke = auth_client.post(f'{ADMIN}/role-assignments/{assignment_id}/revoke', headers=bearer(admin_t),
                              json={'reason': 'no longer needed'})
    assert revoke.status_code == 200
    assert revoke.json()['status'] == 'revoked'
    # Revocation is immediate: no grace period, no cached scopes.
    assert auth_client.get(f'{ADMIN}/me', headers=bearer(target_t)).json()['roles'] == []
    assert auth_client.get(f'{ADMIN}/audit-events', headers=bearer(target_t)).status_code == 403


def test_assign_requires_reason(auth_client, migrated):
    admin_t = _setup_admin(auth_client, migrated)
    register(auth_client, 'bob@example.com')
    with migrated.connect() as c:
        bob_id = c.execute(text("SELECT id FROM users WHERE email='bob@example.com'")).scalar_one()
    r = auth_client.post(f'{ADMIN}/role-assignments', headers=bearer(admin_t),
                         json={'user_id': str(bob_id), 'role_name': 'auditor', 'reason': ''})
    assert r.status_code == 422


def test_assign_rejects_blank_reason_without_server_error(auth_client, migrated):
    admin_t = _setup_admin(auth_client, migrated)
    register(auth_client, 'bob@example.com')
    with migrated.connect() as c:
        bob_id = c.execute(text("SELECT id FROM users WHERE email='bob@example.com'")).scalar_one()
    r = auth_client.post(f'{ADMIN}/role-assignments', headers=bearer(admin_t),
                         json={'user_id': str(bob_id), 'role_name': 'auditor', 'reason': '   '})
    assert r.status_code == 422


def test_duplicate_active_assignment_rejected(auth_client, migrated):
    admin_t = _setup_admin(auth_client, migrated)
    register(auth_client, 'bob@example.com')
    with migrated.connect() as c:
        bob_id = c.execute(text("SELECT id FROM users WHERE email='bob@example.com'")).scalar_one()
    body = {'user_id': str(bob_id), 'role_name': 'auditor', 'reason': 'first grant'}
    first = auth_client.post(f'{ADMIN}/role-assignments', headers=bearer(admin_t), json=body)
    assert first.status_code == 200
    second = auth_client.post(f'{ADMIN}/role-assignments', headers=bearer(admin_t),
                              json={**body, 'reason': 'second grant'})
    assert second.status_code == 409


def test_expired_role_assignment_has_no_effect(auth_client, migrated):
    t = register(auth_client, 'bob@example.com')
    _grant(migrated, 'bob@example.com', 'auditor', expires_at=now() - timedelta(days=1))
    me = auth_client.get(f'{ADMIN}/me', headers=bearer(t)).json()
    assert me['roles'] == [] and me['scopes'] == []
    assert auth_client.get(f'{ADMIN}/audit-events', headers=bearer(t)).status_code == 403


def test_last_super_admin_cannot_be_revoked(auth_client, migrated):
    admin_t = _setup_admin(auth_client, migrated, role='super_admin', email='only@example.com')
    with migrated.connect() as c:
        aid = c.execute(text("SELECT a.id FROM admin_role_assignments a JOIN admin_roles r ON r.id=a.role_id "
                             "WHERE r.name='super_admin' AND a.revoked_at IS NULL")).scalar_one()
    r = auth_client.post(f'{ADMIN}/role-assignments/{aid}/revoke', headers=bearer(admin_t), json={'reason': 'x'})
    assert r.status_code == 403
    with migrated.connect() as c:
        assert c.execute(text("SELECT revoked_at FROM admin_role_assignments WHERE id=:i"), {'i': aid}).scalar() is None


def test_last_super_admin_cannot_delete_own_account(auth_client, migrated):
    admin_t = _setup_admin(auth_client, migrated, email='only@example.com')
    r = auth_client.request('DELETE', '/api/v1/auth/me', headers=bearer(admin_t), json={'password': PASSWORD})
    assert r.status_code == 403
    assert auth_client.get(f'{ADMIN}/roles', headers=bearer(admin_t)).status_code == 200


def test_deleting_non_last_admin_preserves_immutable_audit(auth_client, migrated):
    first = _setup_admin(auth_client, migrated, email='first@example.com')
    second = _setup_admin(auth_client, migrated, email='second@example.com')
    assert auth_client.get(f'{ADMIN}/roles', headers=bearer(second)).status_code == 200
    with migrated.connect() as c:
        second_id = c.execute(text("SELECT id FROM users WHERE email='second@example.com'")).scalar_one()
    response = auth_client.request('DELETE', '/api/v1/auth/me', headers=bearer(second),
                                   json={'password': PASSWORD})
    assert response.status_code == 204
    with migrated.connect() as c:
        assert c.execute(text("SELECT count(*) FROM admin_audit_events WHERE actor_user_id=:i"),
                         {'i': second_id}).scalar_one() >= 1
    assert auth_client.get(f'{ADMIN}/roles', headers=bearer(first)).status_code == 200


def test_second_super_admin_can_be_revoked_first_stays(auth_client, migrated):
    admin_t = _setup_admin(auth_client, migrated, role='super_admin', email='first@example.com')
    register(auth_client, 'second@example.com')
    _, second_aid = _grant(migrated, 'second@example.com', 'super_admin')
    r = auth_client.post(f'{ADMIN}/role-assignments/{second_aid}/revoke', headers=bearer(admin_t), json={'reason': 'x'})
    assert r.status_code == 200


def test_concurrent_super_admin_revocations_leave_one_active(auth_client, migrated, monkeypatch):
    """Two administrators cannot each revoke the other using a stale count."""
    from concurrent.futures import ThreadPoolExecutor
    from contextlib import contextmanager
    from threading import Barrier
    from sqlalchemy.orm import Session
    from app.services import admin as service

    register(auth_client, 'first@example.com')
    register(auth_client, 'second@example.com')
    _, first_id = _grant(migrated, 'first@example.com', 'super_admin')
    _, second_id = _grant(migrated, 'second@example.com', 'super_admin')
    with migrated.connect() as c:
        users = dict(c.execute(text("SELECT email,id FROM users WHERE email IN ('first@example.com','second@example.com')")).all())

    original = service.write_transaction
    entered = Barrier(2)

    @contextmanager
    def simultaneous(db):
        with original(db):
            entered.wait(timeout=10)
            yield

    monkeypatch.setattr(service, 'write_transaction', simultaneous)

    def revoke(assignment_id, actor_id):
        with Session(migrated) as db:
            try:
                service.revoke_assignment(db, assignment_id=assignment_id, revoked_by_user_id=actor_id,
                                          reason='rotate access', request_id=None)
                return 'revoked'
            except Exception as exc:
                return type(exc).__name__

    with ThreadPoolExecutor(max_workers=2) as pool:
        a = pool.submit(revoke, first_id, users['second@example.com'])
        b = pool.submit(revoke, second_id, users['first@example.com'])
        results = [a.result(timeout=15), b.result(timeout=15)]
    assert sorted(results) == ['Forbidden', 'revoked']
    with migrated.connect() as c:
        assert c.execute(text("SELECT count(*) FROM admin_role_assignments a JOIN admin_roles r ON a.role_id=r.id "
                              "WHERE r.name='super_admin' AND a.revoked_at IS NULL")).scalar_one() == 1


def test_bootstrap_super_admin_is_idempotent(client, migrated, auth_client):
    register(auth_client, 'ops@example.com')
    from sqlalchemy.orm import Session

    with Session(migrated) as db:
        first = bootstrap_super_admin(db, 'ops@example.com')
        assert first['created'] is True
        second = bootstrap_super_admin(db, 'ops@example.com')
        assert second['created'] is False
        assert second['assignment_id'] == first['assignment_id']
    with migrated.connect() as c:
        count = c.execute(text(
            "SELECT count(*) FROM admin_role_assignments a JOIN admin_roles r ON r.id=a.role_id "
            "WHERE r.name='super_admin' AND a.revoked_at IS NULL")).scalar()
        assert count == 1


def test_bootstrap_refuses_to_add_another_super_admin_after_first(auth_client, migrated):
    from sqlalchemy.orm import Session
    from app.services.errors import Forbidden

    register(auth_client, 'first@example.com')
    register(auth_client, 'second@example.com')
    with Session(migrated) as db:
        first = bootstrap_super_admin(db, 'first@example.com')
        assert bootstrap_super_admin(db, 'first@example.com')['assignment_id'] == first['assignment_id']
        try:
            bootstrap_super_admin(db, 'second@example.com')
            raise AssertionError('bootstrap must not become a second promotion path')
        except Forbidden:
            pass
    with migrated.connect() as c:
        assert c.execute(text("SELECT count(*) FROM admin_role_assignments a JOIN admin_roles r ON r.id=a.role_id "
                              "WHERE r.name='super_admin' AND a.revoked_at IS NULL")).scalar_one() == 1


def test_audit_assign_and_revoke_recorded_without_sensitive_data(auth_client, migrated):
    admin_t = _setup_admin(auth_client, migrated)
    register(auth_client, 'bob@example.com')
    with migrated.connect() as c:
        bob_id = c.execute(text("SELECT id FROM users WHERE email='bob@example.com'")).scalar_one()
    r = auth_client.post(f'{ADMIN}/role-assignments', headers=bearer(admin_t),
                         json={'user_id': str(bob_id), 'role_name': 'auditor', 'reason': 'needs it'})
    assignment_id = r.json()['id']
    auth_client.post(f'{ADMIN}/role-assignments/{assignment_id}/revoke', headers=bearer(admin_t),
                     json={'reason': 'done'})
    events = auth_client.get(f'{ADMIN}/audit-events?action=role.assign', headers=bearer(admin_t)).json()['items']
    assert len(events) == 1 and events[0]['result'] == 'success' and events[0]['reason'] == 'needs it'
    events = auth_client.get(f'{ADMIN}/audit-events?action=role.revoke', headers=bearer(admin_t)).json()['items']
    assert len(events) == 1 and events[0]['result'] == 'success'
    with migrated.connect() as c:
        rows = c.execute(text("SELECT action, reason, metadata::text FROM admin_audit_events")).all()
    blob = str(rows)
    for secret in (PASSWORD, 'password_hash', 'Bearer ', 'refresh_token'):
        assert secret not in blob


def test_audit_table_is_immutable(migrated):
    from sqlalchemy.exc import IntegrityError
    with migrated.begin() as c:
        c.execute(text(
            "INSERT INTO admin_audit_events(id,action,resource,result) "
            "VALUES(gen_random_uuid(),'x','y','success')"))
        row_id = c.execute(text("SELECT id FROM admin_audit_events")).scalar_one()
    with migrated.connect() as c, c.begin():
        try:
            c.execute(text("UPDATE admin_audit_events SET action='changed' WHERE id=:i"), {'i': row_id})
            raise AssertionError('update should have raised')
        except IntegrityError:
            pass
    with migrated.connect() as c, c.begin():
        try:
            c.execute(text("DELETE FROM admin_audit_events WHERE id=:i"), {'i': row_id})
            raise AssertionError('delete should have raised')
        except IntegrityError:
            pass
    with migrated.connect() as c, c.begin():
        try:
            c.execute(text("TRUNCATE admin_audit_events"))
            raise AssertionError('truncate should have raised')
        except IntegrityError:
            pass
    with migrated.connect() as c:
        assert c.execute(text("SELECT count(*) FROM admin_audit_events WHERE id=:i"), {'i': row_id}).scalar() == 1


def test_assignment_role_name_must_exist(auth_client, migrated):
    admin_t = _setup_admin(auth_client, migrated)
    register(auth_client, 'bob@example.com')
    with migrated.connect() as c:
        bob_id = c.execute(text("SELECT id FROM users WHERE email='bob@example.com'")).scalar_one()
    r = auth_client.post(f'{ADMIN}/role-assignments', headers=bearer(admin_t),
                         json={'user_id': str(bob_id), 'role_name': 'is_admin', 'reason': 'bypass attempt'})
    assert r.status_code == 422


def test_admin_endpoints_ignore_pilot_no_auth_mode(client, migrated):
    """Admin routes always require a real bearer token, even when AUTH_ENABLED=False
    (the household pilot's no-auth mode must never leak into the admin surface)."""
    assert client.get(f'{ADMIN}/me').status_code == 401


def test_overview_requires_system_scope_and_returns_only_aggregates(auth_client, migrated):
    from tests.test_auth import bearer, register
    ops = bearer(register(auth_client, 'ops-overview@example.com'))
    reviewer = bearer(register(auth_client, 'rev-overview@example.com'))
    household = bearer(register(auth_client, 'casa-overview@example.com'))
    _grant(migrated, 'ops-overview@example.com', 'operations_admin')
    _grant(migrated, 'rev-overview@example.com', 'ocr_reviewer')
    home = auth_client.post('/api/v1/homes', headers=household, json={'name': 'Casa Secreta Overview', 'distributor': 'EDESUR'}).json()['id']
    assert auth_client.post(f'/api/v1/homes/{home}/bills', headers=household, json={
        'period_start': '2026-09-01', 'period_end': '2026-09-30', 'kwh': '300', 'amount_dop': '3900', 'days': 30}).status_code == 201
    assert auth_client.get('/api/v1/admin/overview').status_code == 401
    assert auth_client.get('/api/v1/admin/overview', headers=household).status_code == 403
    assert auth_client.get('/api/v1/admin/overview', headers=reviewer).status_code == 403  # tiene OCR pero no admin.system.read
    r = auth_client.get('/api/v1/admin/overview', headers=ops)
    assert r.status_code == 200, r.text
    body = r.json()
    assert r.headers['cache-control'] == 'no-store'
    assert body['homes']['total'] == 1 and body['bills']['total'] == 1 and body['bills']['recent'] == 1
    assert body['users']['total'] == 3 and body['users']['active_sessions'] >= 3
    assert len(body['trends']['new_bills']) == 14 and sum(p['value'] for p in body['trends']['new_bills']) == 1
    assert body['jobs']['worker_state'] in ('ok', 'stalled') and body['health']['database'] == 'ok'
    for forbidden in ('Casa Secreta', 'casa-overview@example.com', 'EDESUR', 'ops-overview@example.com', home):
        assert forbidden not in r.text
    # Consultar el resumen deja constancia en la auditoría (como cualquier ruta administrativa).
    with migrated.connect() as c:
        assert c.execute(text("SELECT count(*) FROM admin_audit_events WHERE scope_used='admin.system.read' AND result='success'")).scalar_one() >= 1
