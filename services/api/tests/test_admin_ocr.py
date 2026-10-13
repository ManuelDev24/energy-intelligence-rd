"""ERD-OCR-03: admin-only safe projection, lifecycle and fenced retry."""
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

import pytest
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services.admin import now
from app.services.jobs import queue
from app.models.job import Job
from app.services.ocr import jobs as ocr_jobs
from tests.test_admin_rbac import _grant
from tests.test_auth import auth_client, bearer, register  # noqa: F401

ROOT = '/api/v1/admin/ocr'


def actors(client, engine):
    result = {}
    for role in ('super_admin', 'operations_admin', 'ocr_reviewer', 'support_readonly'):
        email = f'{role}@example.com'
        result[role] = bearer(register(client, email))
        _grant(engine, email, role)
    result['household'] = bearer(register(client, 'household@example.com'))
    return result


def seeded(engine, *, state='pending', job_status='queued', error_code=None, confirmed=False):
    with engine.begin() as c:
        home = c.execute(text("INSERT INTO homes(id,name,distributor) VALUES(gen_random_uuid(),'secret','EDESUR') RETURNING id")).scalar_one()
        doc = c.execute(text("INSERT INTO documents(id,home_id,kind,content_type,size_bytes,sha256,storage_key,uploaded_via,retention_until) "
                             "VALUES(gen_random_uuid(),:h,'bill_photo','image/jpeg',100,:sha,:key,'api',now()+interval '7 days') RETURNING id"),
                        {'h': home, 'sha': 'a'*64, 'key': str(uuid.uuid4())}).scalar_one()
        c.execute(text("INSERT INTO document_ocr(document_id,status,error_code,draft) VALUES(:d,:s,:e,:draft)"),
                  {'d': doc, 's': state, 'e': error_code, 'draft': '{"name":"private"}'})
    with Session(engine) as db:
        job, _ = queue.enqueue(db, ocr_jobs.KIND, {'document_id': str(doc)}, idempotency_key=str(doc))
        jid = job.id
    with engine.begin() as c:
        c.execute(text("UPDATE jobs SET status=:s, attempts=:attempts, "
                       "last_error='private customer invoice and email private@example.com', "
                       "finished_at=:finished, locked_by=:worker, locked_until=:lease WHERE id=:i"),
                  {'s': job_status, 'attempts': 0 if job_status == 'queued' else 1, 'i': jid,
                   'finished': now() if job_status in ('dead','succeeded') else None,
                   'worker': 'worker' if job_status == 'running' else None,
                   'lease': now() + timedelta(minutes=5) if job_status == 'running' else None})
    return doc, jid


def test_cancelled_jobs_follow_terminal_retention(migrated):
    doc, jid = seeded(migrated)
    with migrated.begin() as c:
        c.execute(text("UPDATE jobs SET status='cancelled',finished_at=now()-interval '120 days' WHERE id=:i"), {'i':jid})
    with Session(migrated) as db:
        queue.purge(db)
    with migrated.connect() as c:
        assert c.execute(text('SELECT count(*) FROM jobs WHERE id=:i'), {'i':jid}).scalar_one() == 0
def test_0025_cancel_downgrade_and_restore(migrated, alembic_cfg):
    from alembic import command
    doc, jid = seeded(migrated)
    with migrated.begin() as c:
        c.execute(text("UPDATE jobs SET status='cancelled',finished_at=now(),generation=1 WHERE id=:i"), {'i':jid})
        c.execute(text("UPDATE document_ocr SET status='cancelled',generation=1 WHERE document_id=:d"), {'d':doc})
    command.downgrade(alembic_cfg, '0024')
    with migrated.connect() as c:
        assert c.execute(text('SELECT status FROM jobs WHERE id=:i'), {'i':jid}).scalar_one() == 'dead'
        assert c.execute(text('SELECT status FROM document_ocr WHERE document_id=:d'), {'d':doc}).scalar_one() == 'failed'
    command.upgrade(alembic_cfg, 'head')
    with migrated.connect() as c:
        assert c.execute(text('SELECT generation FROM jobs WHERE id=:i'), {'i':jid}).scalar_one() == 0
def test_roles_and_projection(auth_client, migrated):
    a = actors(auth_client, migrated)
    d, jid = seeded(migrated, state='failed', job_status='dead', error_code='engine_error')
    for key, expected in [('super_admin', 200), ('operations_admin', 200), ('ocr_reviewer', 200),
                          ('support_readonly', 403), ('household', 403)]:
        r = auth_client.get(ROOT+'/jobs', headers=a[key])
        assert r.status_code == expected, r.text
        assert auth_client.get(f'{ROOT}/jobs/{jid}', headers=a[key]).status_code == expected
        retry = auth_client.post(f'{ROOT}/jobs/{jid}/retry', headers=a[key], json={'reason': 'Revisar motor'})
        assert retry.status_code == (200 if key in ('super_admin', 'operations_admin') else 403), retry.text
        if retry.status_code == 200:
            # Put it back in the dead-letter state for the next authorized role.
            with migrated.begin() as c:
                c.execute(text("UPDATE jobs SET status='dead', finished_at=now() WHERE id=:i"), {'i': jid})
                c.execute(text("UPDATE document_ocr SET status='failed', error_code='engine_error' WHERE document_id=:d"), {'d': d})
    assert auth_client.get(ROOT+'/jobs').status_code == 401
    r = auth_client.get(f'{ROOT}/jobs/{jid}', headers=a['ocr_reviewer'])
    assert r.json()['status'] == 'dead_letter'
    for forbidden in ('private', 'storage_key', 'draft', 'last_error', 'email', 'home_id'):
        assert forbidden not in r.text


def test_all_states_pagination_and_filter(auth_client, migrated):
    a = actors(auth_client, migrated)
    cases = [('pending','queued',None,'queued'), ('processing','running',None,'processing'),
             ('done','succeeded',None,'completed'), ('failed','queued','engine_error','failed_retryable'),
             ('failed','dead','engine_error','dead_letter'), ('failed','succeeded','unreadable','failed_permanent')]
    ids = [seeded(migrated, state=s, job_status=j, error_code=e)[1] for s,j,e,_ in cases]
    r = auth_client.get(ROOT+'/jobs?limit=2&offset=2', headers=a['ocr_reviewer'])
    assert r.status_code == 200, r.text
    assert r.json()['total'] == len(cases) and len(r.json()['items']) == 2
    for (_s,_j,_e,expected), jid in zip(cases, ids):
        r = auth_client.get(f'{ROOT}/jobs/{jid}', headers=a['ocr_reviewer'])
        assert r.status_code == 200 and r.json()['status'] == expected, r.text
        filtered = auth_client.get(ROOT+f'/jobs?status={expected}', headers=a['ocr_reviewer'])
        assert jid in [item['id'] for item in filtered.json()['items']]
    assert auth_client.get(ROOT+'/jobs?status=unknown', headers=a['ocr_reviewer']).status_code == 422
    assert auth_client.get(ROOT+'/jobs?limit=0', headers=a['ocr_reviewer']).status_code == 422


def test_retry_reason_idempotence_backoff_and_audit(auth_client, migrated):
    a = actors(auth_client, migrated)
    doc, jid = seeded(migrated, state='failed', job_status='dead', error_code='engine_error')
    for reason in (None, '', '   ', 'contact private@example.com', 'call 8095551234',
                   'Bearer abc.def', 'token=hello', 'cookie session', 'revisar\nclave', 'https://example.com'):
        r = auth_client.post(f'{ROOT}/jobs/{jid}/retry', headers=a['operations_admin'],
                             json={} if reason is None else {'reason': reason})
        assert r.status_code == 422, r.text
        if reason:
            assert reason not in r.text
    with migrated.connect() as c:
        assert c.execute(text("SELECT count(*) FROM admin_audit_events WHERE action='ocr.retry'")).scalar_one() == 0
    before = now()
    r = auth_client.post(f'{ROOT}/jobs/{jid}/retry', headers=a['operations_admin'], json={'reason': 'Revisar motor'})
    assert r.status_code == 200, r.text
    assert r.json()['status'] == 'queued'
    repeat = auth_client.post(f'{ROOT}/jobs/{jid}/retry', headers=a['operations_admin'], json={'reason': 'Revisar motor'})
    assert repeat.status_code == 409
    with migrated.connect() as c:
        row = c.execute(text('SELECT status,attempts,run_at,generation FROM jobs WHERE id=:i'), {'i': jid}).one()
        assert row.status == 'queued' and row.attempts == 0 and row.run_at > before and row.generation == 1
        audits = c.execute(text("SELECT actor_user_id,reason,request_id,metadata FROM admin_audit_events WHERE action='ocr.retry'")).all()
        assert len(audits) == 1 and audits[0].reason == 'Revisar motor' and audits[0].request_id
        assert 'private' not in str(audits)
        assert c.execute(text("SELECT status,generation FROM document_ocr WHERE document_id=:d"), {'d': doc}).one() == ('pending',1)


def test_permanent_confirmed_deleted_and_running_not_retryable(auth_client, migrated):
    a = actors(auth_client, migrated)
    for state, job, error in [('failed','dead','file_missing'), ('failed','succeeded','unreadable'),
                              ('failed','running','engine_error')]:
        _, jid = seeded(migrated, state=state, job_status=job, error_code=error)
        assert auth_client.post(f'{ROOT}/jobs/{jid}/retry', headers=a['operations_admin'],
                                json={'reason': 'Revisar motor'}).status_code == 409
    doc, jid = seeded(migrated, state='failed', job_status='dead', error_code='engine_error')
    with migrated.begin() as c:
        c.execute(text('DELETE FROM documents WHERE id=:d'), {'d': doc})
    assert auth_client.post(f'{ROOT}/jobs/{jid}/retry', headers=a['operations_admin'],
                            json={'reason': 'Revisar motor'}).status_code == 409


def test_household_retry_does_not_delete_active_worker_job(migrated):
    doc, jid = seeded(migrated, state='failed', job_status='running', error_code='engine_error')
    with migrated.connect() as c:
        home = c.execute(text('SELECT home_id FROM documents WHERE id=:d'), {'d':doc}).scalar_one()
    with Session(migrated) as db:
        ocr_jobs.retry(db, home, doc)
    with migrated.connect() as c:
        assert c.execute(text('SELECT status FROM jobs WHERE id=:i'), {'i':jid}).scalar_one() == 'running'
        assert c.execute(text('SELECT generation FROM document_ocr WHERE document_id=:d'), {'d':doc}).scalar_one() == 0
def test_cancel_during_extraction_never_publishes_draft(auth_client, migrated, monkeypatch):
    a = actors(auth_client, migrated)
    doc, jid = seeded(migrated, state='pending', job_status='queued')
    class Store:
        def get(self, key):
            return b'fake-image'
    monkeypatch.setattr(ocr_jobs, 'get_store', lambda: Store())
    class Extracted:
        text = 'untrusted invoice contents'
        pages_read = pages_total = 1
        engine = 'fake'
        method = 'ocr'
    def extraction(*args):
        r = auth_client.post(f'{ROOT}/jobs/{jid}/cancel', headers=a['operations_admin'],
                             json={'reason':'Detener operación'})
        assert r.status_code == 200, r.text
        return Extracted()
    monkeypatch.setattr(ocr_jobs.pipeline, 'extract_document', extraction)
    with Session(migrated) as db:
        assert ocr_jobs.process(db, doc, attempt=1, max_attempts=3, generation=0) == 'skipped'
    with migrated.connect() as c:
        assert c.execute(text('SELECT status,draft FROM document_ocr WHERE document_id=:d'), {'d':doc}).one() == ('cancelled', None)


def test_cancel_is_persistent_and_fences_worker(auth_client, migrated):
    a = actors(auth_client, migrated)
    doc, jid = seeded(migrated, state='processing', job_status='running')
    with Session(migrated) as db:
        old = db.get(Job, jid)
        db.expunge(old)
    assert auth_client.post(f'{ROOT}/jobs/{jid}/cancel', headers=a['operations_admin'],
                            json={'reason': 'Detener operación'}).status_code == 200
    r = auth_client.get(f'{ROOT}/jobs/{jid}', headers=a['ocr_reviewer'])
    assert r.json()['status'] == 'cancelled'
    assert jid in [x['id'] for x in auth_client.get(ROOT+'/jobs?status=cancelled',
                                                    headers=a['ocr_reviewer']).json()['items']]
    with Session(migrated) as db:
        assert queue.complete(db, old, 'worker') is False
        assert ocr_jobs.process(db, doc, attempt=1, max_attempts=3, generation=0) == 'skipped'
    assert auth_client.post(f'{ROOT}/jobs/{jid}/cancel', headers=a['operations_admin'],
                            json={'reason':'Detener operación'}).status_code == 409
    assert auth_client.post(f'{ROOT}/jobs/{jid}/retry', headers=a['operations_admin'],
                            json={'reason':'Revisar motor'}).status_code == 409


def test_concurrent_retry_only_one_audit(auth_client, migrated):
    a = actors(auth_client, migrated)
    _, jid = seeded(migrated, state='failed', job_status='dead', error_code='engine_error')
    def call(_):
        return auth_client.post(f'{ROOT}/jobs/{jid}/retry', headers=a['operations_admin'],
                                json={'reason':'Revisar motor'}).status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(call, range(2))) == [200,409]
    with migrated.connect() as c:
        assert c.execute(text("SELECT count(*) FROM admin_audit_events WHERE action='ocr.retry'")).scalar_one() == 1


def test_confirmed_document_cannot_retry(auth_client, migrated):
    a = actors(auth_client, migrated)
    doc, jid = seeded(migrated, state='failed', job_status='dead', error_code='engine_error')
    with migrated.begin() as c:
        bill = c.execute(text("INSERT INTO bills(id,home_id,period_start,period_end,kwh,amount_dop,days,source) "
                              "SELECT gen_random_uuid(),home_id,'2026-01-01','2026-01-31',100,100,31,'manual' "
                              "FROM documents WHERE id=:d RETURNING id"), {'d':doc}).scalar_one()
        c.execute(text("UPDATE documents SET bill_id=:b,retention_until=NULL WHERE id=:d"), {'b':bill,'d':doc})
    assert auth_client.post(f'{ROOT}/jobs/{jid}/retry', headers=a['operations_admin'],
                            json={'reason':'Revisar motor'}).status_code == 409
def test_late_completion_fenced_after_retry(auth_client, migrated, monkeypatch):
    a = actors(auth_client, migrated)
    doc, jid = seeded(migrated, state='failed', job_status='dead', error_code='engine_error')
    with Session(migrated) as db:
        old = db.get(Job, jid)
        db.expunge(old)
    r = auth_client.post(f'{ROOT}/jobs/{jid}/retry', headers=a['operations_admin'], json={'reason':'Revisar motor'})
    assert r.status_code == 200, r.text
    with Session(migrated) as db:
        assert queue.complete(db, old, 'worker') is False
        monkeypatch.setattr(ocr_jobs, 'get_store', lambda: (_ for _ in ()).throw(AssertionError('must skip old generation')))
        assert ocr_jobs.process(db, doc, attempt=1, max_attempts=3, generation=0) == 'skipped'
        state = db.execute(text('SELECT status,generation FROM document_ocr WHERE document_id=:d'), {'d':doc}).one()
        assert state == ('pending',1)
