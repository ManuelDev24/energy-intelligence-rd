"""ERD-ADM-BILLS-WEB: calidad de datos de facturas (agregados) y facturas de UNA vivienda — solo lectura, auditada, con scope propio."""
from sqlalchemy import text

from tests.test_admin_rbac import _grant
from tests.test_api_insights import add_bill
from tests.test_auth import auth_client, bearer, register  # noqa: F401

ADMIN = '/api/v1/admin'


def _home_with_bills(client, token, name='Casa Importes'):
    client.headers.update(bearer(token))
    try:
        home = client.post('/api/v1/homes', json={'name': name, 'distributor': 'EDESUR', 'address': 'Calle Importes 9'}).json()['id']
        add_bill(client, home, '2026-07-01', '2026-07-30', '300', amount='3900.00')
        add_bill(client, home, '2026-08-01', '2026-08-30', '390', amount='5460.00')
    finally:
        client.headers.pop('Authorization', None)
    return home


def test_summary_and_home_bills_scope_audit_and_privacy(auth_client, migrated):
    support = register(auth_client, 'soporte-bills@example.com')
    reviewer = register(auth_client, 'rev-bills@example.com')
    owner = register(auth_client, 'duena.bills@example.com')
    _grant(migrated, 'soporte-bills@example.com', 'support_readonly')
    _grant(migrated, 'rev-bills@example.com', 'ocr_reviewer')
    home = _home_with_bills(auth_client, owner)

    for path in (f'{ADMIN}/bills/summary', f'{ADMIN}/homes/{home}/bills'):
        assert auth_client.get(path).status_code == 401
        assert auth_client.get(path, headers=bearer(owner)).status_code == 403
        assert auth_client.get(path, headers=bearer(reviewer)).status_code == 403

    h = bearer(support)
    s = auth_client.get(f'{ADMIN}/bills/summary?days=30', headers=h)
    assert s.status_code == 200, s.text
    sm = s.json()
    assert sm['total'] == 2 and sm['recent'] == 2 and sm['homes_with_bills'] == 1 and sm['manual'] == 2 and sm['seed'] == 0
    assert sm['with_document'] == 0 and sm['paid'] == 0 and sm['zero_kwh'] == 0 and sm['days'] == 30
    assert auth_client.get(f'{ADMIN}/bills/summary?days=0', headers=h).status_code == 422
    assert auth_client.get(f'{ADMIN}/bills/summary?days=400', headers=h).status_code == 422
    assert s.headers['cache-control'] == 'no-store'

    r = auth_client.get(f'{ADMIN}/homes/{home}/bills', headers=h)
    assert r.status_code == 200, r.text
    page = r.json()
    assert page['total'] == 2 and [b['period_end'] for b in page['items']] == ['2026-08-30', '2026-07-30']  # más reciente primero
    first = page['items'][0]
    assert first['kwh'] == '390.00' and first['amount_dop'] == '5460.00' and first['source'] == 'manual'
    assert first['has_document'] is False and first['ocr_status'] is None and first['paid'] is False
    assert auth_client.get(f'{ADMIN}/homes/{home}/bills?limit=1&offset=1', headers=h).json()['items'][0]['period_end'] == '2026-07-30'
    assert auth_client.get(f'{ADMIN}/homes/00000000-0000-4000-8000-000000000000/bills', headers=h).status_code == 404

    for body in (s.text, r.text):  # nada que identifique a la vivienda ni a las personas
        for forbidden in ('casa importes', 'calle importes', 'duena.bills', '@example.com', 'edesur', 'password', 'token'):
            assert forbidden not in body.lower(), forbidden
    for method in ('post', 'put', 'patch', 'delete'):
        assert getattr(auth_client, method)(f'{ADMIN}/homes/{home}/bills', headers=h).status_code in (404, 405)

    with migrated.connect() as c:
        events = c.execute(text("SELECT action, resource, scope_used FROM admin_audit_events WHERE action IN ('bills.summary','bills.list')")).all()
    assert {e[0] for e in events} == {'bills.summary', 'bills.list'}
    assert all(e[2] == 'admin.bills.read' for e in events)
    assert any(e[0] == 'bills.list' and e[1] == f'homes:{home}' for e in events)


def test_summary_counts_completeness_flags(auth_client, migrated):
    support = register(auth_client, 'soporte-bills2@example.com')
    _grant(migrated, 'soporte-bills2@example.com', 'support_readonly')
    owner = register(auth_client, 'duena.bills2@example.com')
    home = _home_with_bills(auth_client, owner, 'Casa Flags')
    with migrated.begin() as c:
        c.execute(text("UPDATE bills SET paid_at=now(), due_date=period_end + 10, reading_previous=100, reading_current=400 WHERE home_id=:h AND period_end='2026-07-30'"), {'h': home})
    sm = auth_client.get(f'{ADMIN}/bills/summary', headers=bearer(support)).json()
    assert sm['paid'] == 1 and sm['with_due_date'] == 1 and sm['with_readings'] == 1
    items = auth_client.get(f'{ADMIN}/homes/{home}/bills', headers=bearer(support)).json()['items']
    july = next(b for b in items if b['period_end'] == '2026-07-30')
    assert july['paid'] is True and july['has_readings'] is True and july['due_date'] == '2026-08-09'
