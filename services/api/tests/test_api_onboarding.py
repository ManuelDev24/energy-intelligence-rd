"""Onboarding backend: optional housing profile and scoped service contract."""
import uuid

from alembic import command
from sqlalchemy import inspect, text

from tests.test_auth import auth_client, bearer, register  # noqa: F401 (pytest fixture)


def test_profile_and_contract_round_trip(auth_client, migrated):
    owner = register(auth_client)
    auth_client.headers.update(bearer(owner))
    created = auth_client.post('/api/v1/homes', json={'name': 'Casa', 'distributor': 'EDESUR'})
    assert created.status_code == 201, created.text
    home = created.json()['id']
    assert created.json()['province'] is None
    assert created.json()['occupants'] is None
    url = f'/api/v1/homes/{home}'
    changed = auth_client.patch(url, json={'province': 'Santo Domingo', 'municipality': 'Santo Domingo Este',
                                          'sector': 'Los Mina', 'occupants': 3, 'has_ac': True,
                                          'has_water_heater': False, 'has_pool': False,
                                          'has_solar': True, 'has_inverter': False,
                                          'user_type': 'residencial'})
    assert changed.status_code == 200, changed.text
    assert changed.json()['province'] == 'Santo Domingo'
    assert changed.json()['occupants'] == 3
    assert changed.json()['has_ac'] is True
    assert changed.json()['user_type'] == 'residencial'
    assert auth_client.get(url).json()['sector'] == 'Los Mina'
    assert auth_client.get(url + '/contract').status_code == 404
    saved = auth_client.put(url + '/contract', json={'account_number': ' 000123 '})
    assert saved.status_code == 200, saved.text
    assert saved.json()['account_number'] == '000123'
    assert saved.json()['home_id'] == home
    assert auth_client.get(url + '/contract').json()['account_number'] == '000123'
    assert auth_client.put(url + '/contract', json={'account_number': '000124'}).json()['account_number'] == '000124'
    with migrated.connect() as c:
        assert c.execute(text('SELECT count(*) FROM contracts WHERE home_id=:h'), {'h': home}).scalar_one() == 1


def test_profile_and_contract_validation(auth_client):
    owner = register(auth_client)
    home = auth_client.post('/api/v1/homes', json={'name': 'Casa', 'distributor': 'EDESUR'}, headers=bearer(owner)).json()['id']
    url = f'/api/v1/homes/{home}'
    for value in [-1, 0, 100000]:
        assert auth_client.patch(url, json={'occupants': value}, headers=bearer(owner)).status_code == 422
    assert auth_client.patch(url, json={'has_ac': 'yes'}, headers=bearer(owner)).status_code == 422
    assert auth_client.patch(url, json={'province': ''}, headers=bearer(owner)).status_code == 422
    assert auth_client.put(url + '/contract', json={'account_number': '   '}, headers=bearer(owner)).status_code == 422
    assert auth_client.get(url, headers=bearer(owner)).json()['occupants'] is None
    assert auth_client.get(url + '/contract', headers=bearer(owner)).status_code == 404


def test_contract_auth_isolation(auth_client):
    a = register(auth_client)
    h = auth_client.post('/api/v1/homes', json={'name': 'Casa', 'distributor': 'EDESUR'}, headers=bearer(a)).json()['id']
    url = f'/api/v1/homes/{h}/contract'
    assert auth_client.put(url, json={'account_number': 'ABC'}, headers=bearer(a)).status_code == 200
    b = register(auth_client, 'outsider@example.com')
    missing = f'/api/v1/homes/{uuid.uuid4()}/contract'
    for method, body in [('get', None), ('put', {'account_number': 'HACK'})]:
        assert auth_client.request(method.upper(), url, json=body).status_code == 401
        foreign = auth_client.request(method.upper(), url, json=body, headers=bearer(b))
        absent = auth_client.request(method.upper(), missing, json=body, headers=bearer(b))
        assert foreign.status_code == absent.status_code == 404
        assert {k: v for k, v in foreign.json().items() if k != 'request_id'} == {k: v for k, v in absent.json().items() if k != 'request_id'}
    assert auth_client.get(url, headers=bearer(a)).json()['account_number'] == 'ABC'


def test_contract_member_access_and_home_deletion_cascades(auth_client, migrated):
    a = register(auth_client)
    home = auth_client.post('/api/v1/homes', json={'name': 'Casa', 'distributor': 'EDESUR'}, headers=bearer(a)).json()['id']
    b = register(auth_client, 'member@example.com')
    with migrated.begin() as c:
        c.execute(text("INSERT INTO home_members(home_id,user_id,role) SELECT :h,id,'member' FROM users WHERE email=:email"),
                  {'h': home, 'email': 'member@example.com'})
    url = f'/api/v1/homes/{home}/contract'
    assert auth_client.put(url, json={'account_number': 'ABC'}, headers=bearer(b)).status_code == 200
    assert auth_client.get(url, headers=bearer(b)).json()['account_number'] == 'ABC'
    assert auth_client.delete(f'/api/v1/homes/{home}', headers=bearer(b)).status_code == 403
    assert auth_client.delete(f'/api/v1/homes/{home}', headers=bearer(a)).status_code == 204
    with migrated.connect() as c:
        assert c.execute(text('SELECT count(*) FROM contracts WHERE home_id=:h'), {'h': home}).scalar_one() == 0


def test_0009_optional_fields_and_reversible_contract(migrated, alembic_cfg):
    with migrated.begin() as c:
        home = c.execute(text("INSERT INTO homes(id,name,distributor) VALUES(gen_random_uuid(),'pilot','EDESUR') RETURNING id")).scalar_one()
    assert 'province' in {col['name'] for col in inspect(migrated).get_columns('homes')}
    assert 'contracts' in inspect(migrated).get_table_names()
    with migrated.connect() as c:
        assert c.execute(text('SELECT province, occupants FROM homes WHERE id=:h'), {'h': home}).one() == (None, None)
    command.downgrade(alembic_cfg, '0008')
    assert 'contracts' not in inspect(migrated).get_table_names()
    assert 'province' not in {col['name'] for col in inspect(migrated).get_columns('homes')}
    command.upgrade(alembic_cfg, 'head')
    with migrated.connect() as c:
        assert c.execute(text('SELECT name FROM homes WHERE id=:h'), {'h': home}).scalar_one() == 'pilot'
