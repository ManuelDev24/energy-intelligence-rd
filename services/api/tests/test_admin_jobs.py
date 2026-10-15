"""ERD-ADM-OPS-WEB: estado de los trabajos en segundo plano — agregados, filtros, sin cargas útiles ni errores y con scope de operaciones."""
from datetime import datetime, timedelta, timezone

from sqlalchemy import text

from tests.test_admin_rbac import _grant
from tests.test_auth import auth_client, bearer, register  # noqa: F401

ADMIN = '/api/v1/admin'
NOW = datetime.now(timezone.utc)


def _job(conn, kind, status, *, run_at=None, attempts=0, error=None, finished=None, payload='{"document_id": "SECRETO-DOC"}'):
    terminal = status in ('succeeded', 'dead', 'cancelled')
    conn.execute(text(
        "INSERT INTO jobs(kind,payload,status,attempts,max_attempts,run_at,last_error,locked_by,locked_until,finished_at) "
        "VALUES(:k,CAST(:p AS jsonb),:s,:a,3,:run,:err,:lb,:lu,:fin)"),
        {'k': kind, 'p': payload, 's': status, 'a': attempts, 'run': run_at or NOW, 'err': error,
         'lb': 'w1' if status == 'running' else None, 'lu': NOW + timedelta(minutes=5) if status == 'running' else None,
         'fin': (finished or NOW) if terminal else None})


def test_jobs_summary_and_list_scope_aggregates_and_no_payload_or_error_text(auth_client, migrated):
    ops = register(auth_client, 'ops-jobs@example.com')
    support = register(auth_client, 'soporte-jobs@example.com')
    owner = register(auth_client, 'persona-jobs@example.com')
    _grant(migrated, 'ops-jobs@example.com', 'operations_admin')
    _grant(migrated, 'soporte-jobs@example.com', 'support_readonly')
    with migrated.begin() as c:
        c.execute(text("DELETE FROM jobs"))
        _job(c, 'ops.test.mail', 'queued', run_at=NOW - timedelta(minutes=45))      # vencido
        _job(c, 'ops.test.mail', 'queued', run_at=NOW - timedelta(minutes=2))       # en cola, aún no «vencido»
        _job(c, 'ops.test.mail', 'queued', run_at=NOW + timedelta(hours=1))         # programado a futuro: no cuenta como espera
        _job(c, 'ops.test.mail', 'succeeded', finished=NOW - timedelta(hours=1))
        _job(c, 'ops.test.mail', 'dead', attempts=3, error='smtp falló para persona@correo.com', finished=NOW - timedelta(hours=2))
        _job(c, 'ops.test.mail', 'dead', attempts=3, error='viejo', finished=NOW - timedelta(days=3))
        _job(c, 'ops.test.scan', 'running')
        _job(c, 'ops.test.scan', 'cancelled', finished=NOW - timedelta(hours=1))

    for path in (f'{ADMIN}/jobs/summary', f'{ADMIN}/jobs'):
        assert auth_client.get(path).status_code == 401
        assert auth_client.get(path, headers=bearer(owner)).status_code == 403
        assert auth_client.get(path, headers=bearer(support)).status_code == 403  # soporte no tiene admin.system.read

    h = bearer(ops)
    s = auth_client.get(f'{ADMIN}/jobs/summary', headers=h)
    assert s.status_code == 200, s.text
    assert s.headers['cache-control'] == 'no-store'
    kinds = {k['kind']: k for k in s.json()['kinds']}
    assert list(kinds) == ['ops.test.mail', 'ops.test.scan']
    mail, scan = kinds['ops.test.mail'], kinds['ops.test.scan']
    assert (mail['queued'], mail['dead'], mail['succeeded_24h'], mail['dead_24h']) == (3, 2, 1, 1)  # el muerto de hace 3 días no cuenta en 24 h
    assert mail['overdue'] == 1 and 44 <= mail['oldest_wait_minutes'] <= 46  # el programado a futuro no entra en la espera
    assert mail['last_success_at'] is not None and scan['running'] == 1 and scan['cancelled_24h'] == 1 and scan['oldest_wait_minutes'] == 0
    assert s.json()['overdue_minutes'] == 10

    page = auth_client.get(f'{ADMIN}/jobs?kind=ops.test.mail&status=dead', headers=h).json()
    assert page['total'] == 2 and all(i['status'] == 'dead' and i['has_error'] for i in page['items'])
    assert page['items'][0]['id'] > page['items'][1]['id']  # más reciente primero
    assert auth_client.get(f'{ADMIN}/jobs?limit=2&offset=0', headers=h).json()['total'] == 8
    overdue = [i for i in auth_client.get(f'{ADMIN}/jobs?status=queued', headers=h).json()['items'] if i['overdue']]
    assert len(overdue) == 1
    assert auth_client.get(f'{ADMIN}/jobs?status=raro', headers=h).status_code == 422
    assert auth_client.get(f'{ADMIN}/jobs?kind=Mal%20Tipo', headers=h).status_code == 422

    everything = s.text + auth_client.get(f'{ADMIN}/jobs?limit=100', headers=h).text
    for forbidden in ('secreto-doc', 'persona@correo.com', 'smtp', 'payload', 'last_error', 'document_id'):
        assert forbidden not in everything.lower(), forbidden
    for method in ('post', 'put', 'patch', 'delete'):
        assert getattr(auth_client, method)(f'{ADMIN}/jobs', headers=h).status_code in (404, 405)
    with migrated.begin() as c:
        c.execute(text("DELETE FROM jobs WHERE kind LIKE 'ops.test.%'"))
