"""ERD-ADM-TARIFFS-WEB: cobertura de tarifas (lógica pura con fechas fijas) y la ruta de solo lectura con su scope."""
from datetime import date, timedelta

from tests.test_admin_rbac import _grant
from tests.test_auth import auth_client, bearer, register  # noqa: F401

from app.models import Tariff
from app.services.admin_tariffs import WARN_DAYS, coverage_for

ADMIN = '/api/v1/admin'
D = date


def v(start, end, code='BTS-1', dist='EDESUR'):
    return Tariff(distributor=dist, tariff_code=code, effective_from=start, effective_to=end, source_resolution='X')


def test_current_with_plenty_of_time_is_current():
    c = coverage_for([v(D(2026, 10, 1), D(2026, 12, 31))], 'EDESUR', D(2026, 10, 15))
    assert c['status'] == 'current' and c['days_left'] == 77 and c['next_from'] is None


def test_current_with_no_end_date_never_expires():
    c = coverage_for([v(D(2026, 1, 1), None)], 'EDESUR', D(2030, 1, 1))
    assert c['status'] == 'current' and c['days_left'] is None


def test_expiring_without_next_version_warns():
    c = coverage_for([v(D(2026, 10, 1), D(2026, 12, 31))], 'EDESUR', D(2026, 12, 31) - timedelta(days=WARN_DAYS))
    assert c['status'] == 'expiring' and c['days_left'] == WARN_DAYS
    last_day = coverage_for([v(D(2026, 10, 1), D(2026, 12, 31))], 'EDESUR', D(2026, 12, 31))
    assert last_day['status'] == 'expiring' and last_day['days_left'] == 0  # hoy es el último día


def test_expiring_but_next_version_is_adjacent_is_covered():
    versions = [v(D(2026, 10, 1), D(2026, 12, 31)), v(D(2027, 1, 1), D(2027, 3, 31))]
    c = coverage_for(versions, 'EDESUR', D(2026, 12, 20))
    assert c['status'] == 'current' and c['next_from'] == D(2027, 1, 1)


def test_next_version_with_a_gap_does_not_cover():
    versions = [v(D(2026, 10, 1), D(2026, 12, 31)), v(D(2027, 2, 1), None)]  # enero sin tarifa
    assert coverage_for(versions, 'EDESUR', D(2026, 12, 20))['status'] == 'expiring'


def test_expired_and_no_future_is_missing_with_last_end():
    c = coverage_for([v(D(2026, 10, 1), D(2026, 12, 31))], 'EDESUR', D(2027, 1, 1))
    assert c['status'] == 'missing' and c['last_ended'] == D(2026, 12, 31) and c['current_id'] is None


def test_only_future_version_is_reported_as_such():
    c = coverage_for([v(D(2027, 1, 1), None)], 'EDESUR', D(2026, 10, 15))
    assert c['status'] == 'future_only' and c['next_from'] == D(2027, 1, 1)


def test_other_distributor_or_code_does_not_count():
    versions = [v(D(2026, 10, 1), None, dist='EDENORTE'), v(D(2026, 10, 1), None, code='BTD-1')]
    assert coverage_for(versions, 'EDESUR', D(2026, 10, 15))['status'] == 'missing'


def test_admin_tariffs_route_scope_read_only_and_real_data(auth_client, migrated):
    ops = register(auth_client, 'ops-tariffs@example.com')
    support = register(auth_client, 'soporte-tariffs@example.com')
    owner = register(auth_client, 'persona-tariffs@example.com')
    _grant(migrated, 'ops-tariffs@example.com', 'operations_admin')
    _grant(migrated, 'soporte-tariffs@example.com', 'support_readonly')
    assert auth_client.get(f'{ADMIN}/tariffs').status_code == 401
    assert auth_client.get(f'{ADMIN}/tariffs', headers=bearer(owner)).status_code == 403
    assert auth_client.get(f'{ADMIN}/tariffs', headers=bearer(support)).status_code == 403  # soporte no tiene admin.system.read
    r = auth_client.get(f'{ADMIN}/tariffs', headers=bearer(ops))
    assert r.status_code == 200, r.text
    body = r.json()
    assert r.headers['cache-control'] == 'no-store'
    assert [c['distributor'] for c in body['coverage']] == ['EDESUR', 'EDENORTE', 'EDEESTE'] and body['warn_days'] == WARN_DAYS
    # La migración 0008 carga BTS-1 oct–dic 2026 para las tres distribuidoras.
    assert len(body['versions']) == 3 and {t['source_resolution'] for t in body['versions']} == {'SIE-121-2026-TF'}
    first = body['versions'][0]
    assert len(first['blocks']) == 4 and len(first['fixed_charges']) == 2 and first['state'] in ('current', 'past', 'future')
    for method in ('post', 'put', 'patch', 'delete'):
        assert getattr(auth_client, method)(f'{ADMIN}/tariffs', headers=bearer(ops)).status_code in (404, 405)
