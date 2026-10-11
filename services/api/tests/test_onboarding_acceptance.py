"""ERD-ONB-ACCEPTANCE: recorrido autenticado completo vivienda -> contrato -> meta inicial -> dashboard."""
import pytest

from tests.test_auth import AUTH, PASSWORD, auth_client, bearer, register  # noqa: F401

PROFILE = {'province': 'Santo Domingo', 'municipality': 'Santo Domingo Este', 'sector': 'Los Mina', 'occupants': 4,
           'has_ac': True, 'has_water_heater': None, 'has_pool': False, 'has_solar': None, 'has_inverter': None,
           'user_type': 'residencial'}
GOAL = {'monthly_kwh': '300', 'monthly_amount_rd': '3000'}


def onboard(client, tokens, *, name='Casa Principal', contract='NIC-0001', goal=GOAL):
    client.headers.update(bearer(tokens))
    home = client.post('/api/v1/homes', json={'name': name, 'distributor': 'EDEESTE', **PROFILE})
    assert home.status_code == 201, home.text
    url = f"/api/v1/homes/{home.json()['id']}"
    if contract:
        assert client.put(url + '/contract', json={'account_number': contract}).status_code == 200
    if goal:
        assert client.put(url + '/goal', json=goal).status_code == 200
    return url, home.json()


@pytest.fixture
def client(auth_client):
    yield auth_client
    auth_client.headers.clear()


def test_new_account_completes_onboarding_and_sees_it_everywhere(client):
    tokens = register(client)
    assert client.get('/api/v1/homes', headers=bearer(tokens)).json() == []
    url, created = onboard(client, tokens)
    # Los indicadores desconocidos se conservan como null, no como false.
    assert {k: created[k] for k in PROFILE} == PROFILE
    assert client.get(url).json() == created
    assert [h['id'] for h in client.get('/api/v1/homes').json()] == [created['id']]
    assert client.get(url + '/contract').json()['account_number'] == 'NIC-0001'
    goal = client.get(url + '/goal').json()
    assert (goal['monthly_kwh'], goal['monthly_amount_rd']) == ('300.00', '3000.00')
    # Sin facturas ni lecturas: el dashboard y el progreso no inventan datos.
    assert client.get(url + '/dashboard').status_code == 200
    progress = client.get(url + '/goal/progress').json()
    assert progress['status'] == 'insufficient_data'


def test_contract_and_goal_are_optional_steps(client):
    tokens = register(client)
    url, _ = onboard(client, tokens, contract=None, goal=None)
    assert client.get(url + '/contract').status_code == 404
    assert client.get(url + '/goal').json() is None


def test_failed_goal_step_can_be_resumed_without_creating_a_second_home(client):
    tokens = register(client)
    client.headers.update(bearer(tokens))
    home_id = client.post('/api/v1/homes', json={'name': 'Casa', 'distributor': 'EDESUR'}).json()['id']
    url = f'/api/v1/homes/{home_id}'
    assert client.put(url + '/contract', json={'account_number': 'NIC-1'}).status_code == 200
    # Meta inválida: el borrador de la vivienda y el contrato ya guardados no se pierden.
    for bad in ({}, {'monthly_kwh': '0'}, {'monthly_kwh': '-5'}, {'monthly_amount_rd': 'abc'}):
        assert client.put(url + '/goal', json=bad).status_code == 422, bad
    assert client.get(url + '/goal').json() is None
    # Reanudación: se corrige el perfil con PATCH sobre la misma vivienda y se guarda la meta.
    assert client.patch(url, json=PROFILE).status_code == 200
    assert client.put(url + '/goal', json=GOAL).status_code == 200
    assert [h['id'] for h in client.get('/api/v1/homes').json()] == [home_id]


def test_resumed_steps_are_idempotent(client):
    tokens = register(client)
    url, home = onboard(client, tokens)
    for _ in range(2):
        assert client.put(url + '/contract', json={'account_number': 'NIC-0001'}).status_code == 200
        assert client.put(url + '/goal', json=GOAL).status_code == 200
    assert client.patch(url, json=PROFILE).json() == home


def test_second_account_is_isolated_from_the_first_onboarding(client):
    alice = register(client)
    url, _ = onboard(client, alice)
    client.headers.clear()
    bob = register(client, 'bob@example.com')
    assert client.get('/api/v1/homes', headers=bearer(bob)).json() == []
    for method, path, body in (('GET', url, None), ('PATCH', url, {'name': 'x'}), ('GET', url + '/contract', None),
                               ('PUT', url + '/contract', {'account_number': 'HACK'}), ('GET', url + '/goal', None),
                               ('PUT', url + '/goal', GOAL)):
        assert client.request(method, path, json=body, headers=bearer(bob)).status_code == 404, (method, path)
    client.headers.update(bearer(alice))
    assert client.get(url + '/contract').json()['account_number'] == 'NIC-0001'


@pytest.mark.parametrize('field,value', [('name', ''), ('name', 'x' * 121), ('distributor', 'OTRA'), ('occupants', 0),
                                         ('occupants', 1000), ('province', ''), ('has_ac', 'yes')])
def test_invalid_profile_never_creates_a_home(client, field, value):
    tokens = register(client)
    body = {'name': 'Casa', 'distributor': 'EDESUR', field: value}
    assert client.post('/api/v1/homes', json=body, headers=bearer(tokens)).status_code == 422
    assert client.get('/api/v1/homes', headers=bearer(tokens)).json() == []
