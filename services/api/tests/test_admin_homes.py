"""ERD-ADM-HOMES-WEB: consulta administrativa de viviendas — solo lectura, sin datos de identificación, auditada y con scope propio."""
from sqlalchemy import text

from tests.test_admin_rbac import _grant
from tests.test_api_homes_bills import mk_home  # noqa: F401
from tests.test_auth import auth_client, bearer, register  # noqa: F401

ADMIN = '/api/v1/admin'


def _home(client, token, name):
    r = client.post('/api/v1/homes', headers=bearer(token), json={'name': name, 'distributor': 'EDESUR', 'address': 'Calle Secreta 12', 'city': 'Ciudad Oculta'})
    assert r.status_code == 201, r.text
    return r.json()['id']


def test_admin_homes_scope_aggregates_audit_and_no_identifying_data(auth_client, migrated):
    support = register(auth_client, 'soporte-homes@example.com')
    reviewer = register(auth_client, 'rev-homes@example.com')
    owner = register(auth_client, 'duena.homes@example.com')
    _grant(migrated, 'soporte-homes@example.com', 'support_readonly')
    _grant(migrated, 'rev-homes@example.com', 'ocr_reviewer')
    home_id = _home(auth_client, owner, 'Casa Secreta Homes')
    with migrated.begin() as c:
        c.execute(text("UPDATE homes SET code='ADM-H-01', province='Santo Domingo' WHERE id=:i"), {'i': home_id})

    # Sin sesión → 401; sin scope (persona normal u otro rol) → 403.
    assert auth_client.get(f'{ADMIN}/homes').status_code == 401
    assert auth_client.get(f'{ADMIN}/homes', headers=bearer(owner)).status_code == 403
    assert auth_client.get(f'{ADMIN}/homes', headers=bearer(reviewer)).status_code == 403
    assert auth_client.get(f'{ADMIN}/homes/{home_id}', headers=bearer(reviewer)).status_code == 403

    h = bearer(support)
    assert auth_client.get(f'{ADMIN}/homes?q=ab', headers=h).status_code == 422  # demasiado corto / inválido
    assert auth_client.get(f'{ADMIN}/homes?q=a%25b%25', headers=h).status_code == 422  # el comodín no se acepta
    assert auth_client.get(f'{ADMIN}/homes?distributor=Nada', headers=h).status_code == 422

    r = auth_client.get(f'{ADMIN}/homes?q=ADM-H', headers=h)
    assert r.status_code == 200, r.text
    page = r.json()
    assert page['total'] == 1 and page['items'][0]['id'] == home_id and page['items'][0]['code'] == 'ADM-H-01'
    item = page['items'][0]
    assert item['members'] == 1 and item['bills'] == 0 and item['last_bill_end'] is None and item['province'] == 'Santo Domingo'
    assert r.headers['cache-control'] == 'no-store'
    # Búsqueda por identificador exacto y filtro por distribuidora.
    assert auth_client.get(f'{ADMIN}/homes?q={home_id}', headers=h).json()['total'] == 1
    assert auth_client.get(f'{ADMIN}/homes?distributor=EDENORTE', headers=h).json()['total'] == 0
    assert auth_client.get(f'{ADMIN}/homes?distributor=EDESUR', headers=h).json()['total'] == 1
    assert auth_client.get(f'{ADMIN}/homes?limit=1&offset=5', headers=h).json()['items'] == []

    detail = auth_client.get(f'{ADMIN}/homes/{home_id}', headers=h)
    assert detail.status_code == 200, detail.text
    d = detail.json()
    assert d['owners'] == 1 and d['pending_invitations'] == 0 and d['claims_total'] == 0 and d['documents'] == 0
    assert auth_client.get(f'{ADMIN}/homes/00000000-0000-4000-8000-000000000000', headers=h).status_code == 404

    # Nada que identifique a la vivienda ni a las personas.
    for body in (r.text, detail.text):
        for forbidden in ('casa secreta', 'calle secreta', 'ciudad oculta', 'duena.homes', '@example.com', 'address', 'password', 'token'):
            assert forbidden not in body.lower(), forbidden
    # Solo lectura.
    for method in ('post', 'put', 'patch', 'delete'):
        assert getattr(auth_client, method)(f'{ADMIN}/homes/{home_id}', headers=h).status_code in (404, 405)

    with migrated.connect() as c:
        events = c.execute(text("SELECT action, resource, scope_used, metadata::text FROM admin_audit_events WHERE action IN ('homes.search','homes.view')")).all()
    assert {e[0] for e in events} == {'homes.search', 'homes.view'}
    assert all(e[2] == 'admin.homes.read' for e in events)
    assert any(e[0] == 'homes.view' and e[1] == f'homes:{home_id}' for e in events)
    assert all('adm-h' not in (e[3] or '').lower() for e in events)  # el término buscado no se guarda


def test_admin_homes_counts_come_from_real_rows(auth_client, migrated):
    from tests.test_api_insights import add_bill
    support = register(auth_client, 'soporte-homes2@example.com')
    _grant(migrated, 'soporte-homes2@example.com', 'support_readonly')
    owner = register(auth_client, 'duena.homes2@example.com')
    auth_client.headers.update(bearer(owner))
    home_id = _home(auth_client, owner, 'Casa Cuentas')
    add_bill(auth_client, home_id, '2026-07-01', '2026-07-30', '300', amount='3900.00')
    add_bill(auth_client, home_id, '2026-08-01', '2026-08-30', '390', amount='5460.00')
    auth_client.headers.pop('Authorization', None)
    d = auth_client.get(f'{ADMIN}/homes/{home_id}', headers=bearer(support)).json()
    assert d['bills'] == 2 and d['last_bill_end'] == '2026-08-30' and d['first_bill_start'] == '2026-07-01'
    row = auth_client.get(f'{ADMIN}/homes?q={home_id}', headers=bearer(support)).json()['items'][0]
    assert row['bills'] == 2 and row['members'] == 1
