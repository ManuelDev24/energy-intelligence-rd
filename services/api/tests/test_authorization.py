"""Exercise every currently registered private route, including wrong-parent child IDs."""
import uuid
from concurrent.futures import ThreadPoolExecutor

import pytest
from sqlalchemy import text

from tests.test_auth import AUTH, PASSWORD, auth_client, bearer, register
from tests.test_api_homes_bills import BILL
from tests.test_api_insights import EQ, add_bill
from tests.test_api_readings import READING

GOAL = {"monthly_kwh": "300", "monthly_amount_rd": "3000"}
CONSUMPTION_QUERY = "?granularity=day&from=2026-09-01&to=2026-09-30"


def setup_homes(client):
    a = register(client)
    client.headers.update(bearer(a))
    homes = [client.post('/api/v1/homes', json={'name': n, 'distributor':'EDESUR'}).json()['id']
             for n in ['one', 'two']]
    h = homes[0]
    bill = client.post(f'/api/v1/homes/{h}/bills', json=BILL).json()['id']
    eq = client.post(f'/api/v1/homes/{h}/equipment', json=EQ).json()['id']
    add_bill(client, h, '2026-09-01', '2026-09-30', '1000')
    alert = client.get(f'/api/v1/homes/{h}/alerts').json()[0]['id']
    reading = client.post(f'/api/v1/homes/{h}/readings', json={**READING, 'read_at': '2026-09-01T00:00:00-04:00'}).json()['id']
    assert client.put(f'/api/v1/homes/{h}/goal', json=GOAL).status_code == 200
    b = register(client, 'bob@example.com')
    client.headers.clear()
    return a, b, homes, bill, eq, alert, reading


def cases(h, bill, eq, alert, reading):
    u = f'/api/v1/homes/{h}'
    return [('GET',u,None),('PATCH',u,{'name':'changed'}),('DELETE',u,None),
            ('GET',u+'/contract',None),('PUT',u+'/contract',{'account_number':'123'}),
            ('GET',u+'/bills',None),('POST',u+'/bills',BILL),
            ('GET',u+'/bills/'+bill,None),('PUT',u+'/bills/'+bill,BILL),('DELETE',u+'/bills/'+bill,None),
            ('GET',u+'/bills/'+bill+'/items',None),('PUT',u+'/bills/'+bill+'/items',{'items': []}),
            ('POST',u+'/bills/'+bill+'/validate',{}),
            ('GET',u+'/equipment',None),('POST',u+'/equipment',EQ),('GET',u+'/equipment/estimate',None),
            ('GET',u+'/equipment/'+eq,None),('PUT',u+'/equipment/'+eq,EQ),('DELETE',u+'/equipment/'+eq,None),
            ('GET',u+'/alerts',None),('PATCH',u+'/alerts/'+alert,{'status':'read'}),
            ('GET',u+'/alert-settings',None),('PUT',u+'/alert-settings',{'warning_pct':'10','critical_pct':'40'}),
            ('GET',u+'/dashboard',None),
            ('GET',u+'/readings',None),('POST',u+'/readings',READING),('DELETE',u+'/readings/'+reading,None),
            ('GET',u+'/consumption'+CONSUMPTION_QUERY,None),
            ('GET',u+'/goal',None),('PUT',u+'/goal',GOAL),('GET',u+'/goal/progress?on=2026-09-15',None)]


@pytest.mark.parametrize('role', ['user','admin','support'])
def test_all_private_routes_require_membership_and_token(auth_client, migrated, role):
    a,b,homes,bill,eq,alert,reading = setup_homes(auth_client)
    with migrated.begin() as c:
        c.execute(text('UPDATE users SET role=:r WHERE email=:e'), {'r':role,'e':'bob@example.com'})
    for method,url,body in cases(homes[0],bill,eq,alert,reading):
        assert auth_client.request(method,url,json=body).status_code == 401, (method,url)
        assert auth_client.request(method,url,json=body,headers=bearer(b)).status_code == 404, (method,url)
    # Authorized parent must not allow child IDs from another home.
    for method,url,body in cases(homes[1],bill,eq,alert,reading):
        if any('/'+child in url for child in [bill,eq,alert,reading]):
            assert auth_client.request(method,url,json=body,headers=bearer(a)).status_code == 404, (method,url)
    # Verify denied mutations did not change private records.
    assert auth_client.get(f'/api/v1/homes/{homes[0]}',headers=bearer(a)).json()['name'] == 'one'
    assert auth_client.get(f'/api/v1/homes/{homes[0]}/bills/{bill}',headers=bearer(a)).status_code == 200
    assert auth_client.get(f'/api/v1/homes/{homes[0]}/equipment/{eq}',headers=bearer(a)).status_code == 200
    assert [r['id'] for r in auth_client.get(f'/api/v1/homes/{homes[0]}/readings',headers=bearer(a)).json()] == [reading]
    assert auth_client.get(f'/api/v1/homes/{homes[0]}/goal',headers=bearer(a)).json()['monthly_kwh'] == '300.00'


def test_private_route_inventory_remains_covered(auth_client):
    paths = auth_client.get('/openapi.json').json()['paths']
    tested = cases('{home_id}', '{bill_id}', '{equipment_id}', '{alert_id}', '{reading_id}')
    actual = {(method.upper(), path) for path, operations in paths.items()
              if path.startswith('/api/v1/homes/') for method in operations if method != 'parameters'}
    assert actual == {(method, path.split('?')[0]) for method, path, _ in tested}
    # Únicas rutas públicas fuera de /homes: auth, tarifas publicadas y versiones legales.
    public = {path for path in paths if path.startswith('/api/v1/') and not path.startswith('/api/v1/homes')}
    assert {p for p in public if not p.startswith('/api/v1/auth/')} == {'/api/v1/tariffs', '/api/v1/legal'}
    # /legal solo expone GET, nunca escrituras.
    assert set(paths['/api/v1/legal']) == {'get'}


def test_member_read_write_owner_only_home_delete_and_revocation(auth_client, migrated):
    a,b,homes,bill,eq,alert,reading = setup_homes(auth_client)
    with migrated.begin() as c:
        c.execute(text("INSERT INTO home_members(home_id,user_id,role) SELECT :h,id,'member' FROM users WHERE email=:e"),
                  {'h':homes[0],'e':'bob@example.com'})
    assert auth_client.get(f'/api/v1/homes/{homes[0]}/dashboard',headers=bearer(b)).status_code == 200
    assert auth_client.patch(f'/api/v1/homes/{homes[0]}',json={'name':'shared'},headers=bearer(b)).status_code == 200
    assert auth_client.delete(f'/api/v1/homes/{homes[0]}',headers=bearer(b)).status_code == 403
    assert auth_client.delete(f'/api/v1/homes/{homes[0].upper()}',headers=bearer(b)).status_code == 403
    with migrated.begin() as c:
        c.execute(text("DELETE FROM home_members WHERE user_id=(SELECT id FROM users WHERE email=:e)"),{'e':'bob@example.com'})
    assert auth_client.get('/api/v1/homes',headers=bearer(b)).json() == []
    assert auth_client.get(f'/api/v1/homes/{homes[0]}',headers=bearer(b)).status_code == 404
    assert auth_client.delete(f'/api/v1/homes/{homes[0]}',headers=bearer(a)).status_code == 204
    with migrated.connect() as c:
        assert c.execute(text('SELECT count(*) FROM home_members WHERE home_id=:h'),{'h':homes[0]}).scalar() == 0


def test_concurrent_registration_unique_email(auth_client, migrated):
    def signup(_):
        return auth_client.post(AUTH+'/register',json={'email':'same@example.com','password':PASSWORD,'accept_terms':True})
    with ThreadPoolExecutor(max_workers=2) as pool:
        result = list(pool.map(signup, range(2)))
    assert sorted(r.status_code for r in result) == [201,409]
    with migrated.connect() as c:
        assert c.execute(text('SELECT count(*) FROM users')).scalar() == 1
        assert c.execute(text('SELECT count(*) FROM auth_sessions')).scalar() == 1


@pytest.mark.parametrize('module,name', [
    ('test_api_homes_bills','test_homes_crud'),('test_api_homes_bills','test_bills_crud'),
    ('test_api_insights','test_equipment_crud'),('test_api_insights','test_alert_status_transitions_and_filters'),
    ('test_api_insights','test_alert_settings_change_thresholds_and_recompute'),
    ('test_api_dashboard','test_dashboard_exact_values_and_labels'),
    ('test_api_readings','test_readings_crud'),('test_api_readings','test_readings_must_be_monotonic_non_decreasing'),
    ('test_api_consumption','test_daily_readings_at_local_midnight_give_real_buckets'),
    ('test_api_goals','test_goal_put_get_and_update'),
    ('test_api_goals','test_amount_progress_uses_official_tariff_as_estimated_with_source')])
def test_existing_crud_contract_with_auth_enabled(auth_client,module,name):
    import importlib
    t = register(auth_client)
    auth_client.headers.update(bearer(t))
    getattr(importlib.import_module('tests.'+module),name)(auth_client)


def test_home_and_owner_rollback_together(auth_client, migrated):
    from sqlalchemy.orm import Session
    from app.schemas.home import HomeCreate
    from app.services.homes import create_home
    from sqlalchemy.exc import IntegrityError
    with Session(migrated) as db:
        with pytest.raises(IntegrityError):
            create_home(db, HomeCreate(name='rollback',distributor='EDESUR'),owner_id=uuid.uuid4())
    with migrated.connect() as c:
        assert c.execute(text('SELECT count(*) FROM homes')).scalar() == 0
        assert c.execute(text('SELECT count(*) FROM home_members')).scalar() == 0
        assert c.execute(text('SELECT count(*) FROM audit_events')).scalar() == 0


def test_member_can_use_phase2_routes_and_outsider_cannot_read_consumption(auth_client, migrated):
    a,b,homes,bill,eq,alert,reading = setup_homes(auth_client)
    u = f'/api/v1/homes/{homes[0]}'
    assert auth_client.get(u+'/consumption'+CONSUMPTION_QUERY,headers=bearer(b)).status_code == 404
    with migrated.begin() as c:
        c.execute(text("INSERT INTO home_members(home_id,user_id,role) SELECT :h,id,'member' FROM users WHERE email=:e"),
                  {'h':homes[0],'e':'bob@example.com'})
    assert auth_client.get(u+'/consumption'+CONSUMPTION_QUERY,headers=bearer(b)).status_code == 200
    assert auth_client.get(u+'/goal/progress?on=2026-09-15',headers=bearer(b)).json()['goal']['monthly_kwh'] == '300.00'
    r = auth_client.post(u+'/readings',json={'read_at':'2026-09-02T00:00:00-04:00','reading_kwh':'1600'},headers=bearer(b))
    assert r.status_code == 201
    # Un miembro de la vivienda 0 no puede borrar la lectura usando la vivienda 1 (de alice).
    assert auth_client.delete(f'/api/v1/homes/{homes[1]}/readings/{r.json()["id"]}',headers=bearer(b)).status_code == 404
    assert auth_client.delete(f'/api/v1/homes/{homes[1]}/readings/{r.json()["id"]}',headers=bearer(a)).status_code == 404
