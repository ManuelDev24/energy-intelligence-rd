"""ERD-WORKER-01: cola en PostgreSQL — idempotencia, reintentos, tiempo máximo, concesiones, muertos y programador."""
import threading
import time
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.models.job import Job
from app.services import jobs
from app.services.errors import InvalidInput
from app.services.jobs import queue, registry, runner
from app.services.jobs.registry import PermanentFailure, RetryLater
from app.services.jobs.schedule import Schedule, slot_key
from app.worker import run_worker

NOW = datetime(2026, 10, 10, 12, 0, tzinfo=timezone.utc)
calls: list = []


@pytest.fixture
def db(migrated):
    with Session(migrated, expire_on_commit=False) as session:
        yield session


@pytest.fixture(autouse=True)
def clean_registry(monkeypatch):
    """Cada prueba registra sus propios tipos sin tocar los integrados."""
    monkeypatch.setattr(registry, '_REGISTRY', dict(registry._REGISTRY))
    calls.clear()


def lease(_kind):
    return 60


def take(db, worker='w1', now=NOW, **kw):
    return queue.claim(db, worker, lease_of=lease, now=now, **kw)


def row(migrated, job_id):
    with migrated.connect() as c:
        return c.execute(text('SELECT * FROM jobs WHERE id=:i'), {'i': job_id}).mappings().one()


# ---------- encolar ----------
def test_enqueue_defaults_and_validation(db):
    job, created = queue.enqueue(db, 'demo.task', {'home_id': 'abc'}, now=NOW)
    assert created and (job.status, job.attempts, job.max_attempts) == ('queued', 0, settings.JOB_DEFAULT_MAX_ATTEMPTS)
    assert job.payload == {'home_id': 'abc'} and job.run_at == NOW
    for bad in ('', 'Mayus', '1abc', 'x' * 65, 'a b', None):
        with pytest.raises(InvalidInput):
            queue.enqueue(db, bad)
    with pytest.raises(InvalidInput):
        queue.enqueue(db, 'demo', {'blob': 'x' * 9000})
    with pytest.raises(InvalidInput):
        queue.enqueue(db, 'demo', {'x': object()})
    with pytest.raises(InvalidInput):
        queue.enqueue(db, 'demo', ['no', 'es', 'objeto'])
    with pytest.raises(InvalidInput):
        queue.enqueue(db, 'demo', max_attempts=0)
    with pytest.raises(InvalidInput):
        queue.enqueue(db, 'demo', idempotency_key='k' * 129)


def test_idempotency_key_dedupes_per_kind(db, migrated):
    first, created = queue.enqueue(db, 'demo.task', idempotency_key='doc-1', now=NOW)
    again, created_again = queue.enqueue(db, 'demo.task', {'otro': 1}, idempotency_key='doc-1', now=NOW)
    assert created and not created_again and again.id == first.id and again.payload == {}
    other, created_other = queue.enqueue(db, 'demo.other', idempotency_key='doc-1', now=NOW)
    assert created_other and other.id != first.id
    a, b = queue.enqueue(db, 'demo.task', now=NOW)[0], queue.enqueue(db, 'demo.task', now=NOW)[0]
    assert a.id != b.id  # sin clave no hay deduplicación


def test_idempotent_enqueue_survives_a_race(migrated):
    ids, errors = [], []

    def go():
        try:
            with Session(migrated, expire_on_commit=False) as s:
                ids.append(queue.enqueue(s, 'demo.race', idempotency_key='same', now=NOW)[0].id)
        except Exception as exc:  # pragma: no cover
            errors.append(exc)
    threads = [threading.Thread(target=go) for _ in range(8)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert not errors and len(set(ids)) == 1


def test_enqueue_can_join_the_callers_transaction(db, migrated):
    queue.enqueue(db, 'demo.task', now=NOW, commit=False)
    db.rollback()
    with migrated.connect() as c:
        assert c.execute(text('SELECT count(*) FROM jobs')).scalar() == 0


# ---------- reclamar ----------
def test_claim_respects_run_at_and_order(db):
    later = queue.enqueue(db, 'demo.task', run_at=NOW + timedelta(minutes=5), now=NOW)[0]
    first = queue.enqueue(db, 'demo.task', run_at=NOW - timedelta(minutes=2), now=NOW)[0]
    second = queue.enqueue(db, 'demo.task', run_at=NOW - timedelta(minutes=1), now=NOW)[0]
    got = take(db, limit=5)
    assert [j.id for j in got] == [first.id, second.id]
    assert all(queue.complete(db, j, 'w1', now=NOW) for j in got)
    assert take(db, limit=5, now=NOW + timedelta(minutes=4), worker='w2') == []  # el tercero aún no toca
    assert [j.id for j in take(db, limit=5, now=NOW + timedelta(minutes=6), worker='w2')] == [later.id]


def test_claim_marks_running_with_lease_and_counts_attempt(db):
    job = queue.enqueue(db, 'demo.task', now=NOW)[0]
    (claimed,) = take(db)
    assert claimed.id == job.id and (claimed.status, claimed.attempts, claimed.locked_by) == ('running', 1, 'w1')
    assert claimed.locked_until == NOW + timedelta(seconds=60) and claimed.started_at == NOW
    assert take(db, worker='w2') == []  # ya está tomado


def test_claim_filters_by_kind(db):
    queue.enqueue(db, 'demo.a', now=NOW)
    b = queue.enqueue(db, 'demo.b', now=NOW)[0]
    assert [j.id for j in take(db, kinds=['demo.b'])] == [b.id]


def test_concurrent_workers_never_take_the_same_job(migrated):
    with Session(migrated, expire_on_commit=False) as s:
        for _ in range(30):
            queue.enqueue(s, 'demo.task', now=NOW)
    taken, lock = [], threading.Lock()

    def work(name):
        with Session(migrated, expire_on_commit=False) as s:
            while True:
                got = queue.claim(s, name, lease_of=lease, now=NOW, limit=2)
                if not got:
                    return
                with lock:
                    taken.extend(j.id for j in got)
    threads = [threading.Thread(target=work, args=(f'w{i}',)) for i in range(5)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert len(taken) == 30 and len(set(taken)) == 30


# ---------- cierre cercado, concesiones ----------
def test_complete_is_fenced_to_the_current_worker_and_attempt(db, migrated):
    job = queue.enqueue(db, 'demo.task', now=NOW)[0]
    (claimed,) = take(db)
    assert queue.complete(db, claimed, 'otro-worker', now=NOW) is False
    assert row(migrated, job.id)['status'] == 'running'
    assert queue.complete(db, claimed, 'w1', now=NOW) is True
    r = row(migrated, job.id)
    assert r['status'] == 'succeeded' and r['finished_at'] and r['locked_by'] is None and r['last_error'] is None
    assert queue.complete(db, claimed, 'w1', now=NOW) is False  # no se completa dos veces


def test_expired_lease_is_retaken_and_the_late_result_is_discarded(db, migrated):
    job = queue.enqueue(db, 'demo.task', max_attempts=3, now=NOW)[0]
    (slow,) = take(db, worker='slow')
    later = NOW + timedelta(seconds=61)
    (fast,) = take(db, worker='fast', now=later)
    assert fast.id == job.id and fast.attempts == 2 and fast.locked_by == 'fast'
    assert 'lease_expired' in row(migrated, job.id)['last_error']
    assert queue.complete(db, slow, 'slow', now=later) is False  # el worker lento llegó tarde
    assert queue.fail(db, slow, 'slow', 'tarde', now=later) is None
    assert queue.complete(db, fast, 'fast', now=later) is True


def test_a_job_that_keeps_dying_ends_in_the_dead_letter_queue(db, migrated):
    job = queue.enqueue(db, 'demo.task', max_attempts=2, now=NOW)[0]
    t = NOW
    for _ in range(2):
        assert take(db, now=t)
        t += timedelta(seconds=61)
    assert take(db, now=t) == []
    r = row(migrated, job.id)
    assert r['status'] == 'dead' and r['attempts'] == 2 and r['finished_at'] and 'lease_expired' in r['last_error']


# ---------- fallos y reintentos ----------
def test_fail_retries_with_growing_backoff_then_dies(db, monkeypatch):
    monkeypatch.setitem(settings.__dict__, 'JOB_BACKOFF_BASE_SECONDS', 30)
    monkeypatch.setitem(settings.__dict__, 'JOB_BACKOFF_CAP_SECONDS', 3600)
    job = queue.enqueue(db, 'demo.task', max_attempts=4, now=NOW)[0]
    t, delays = NOW, []
    for _ in range(3):
        (claimed,) = take(db, now=t)
        assert queue.fail(db, claimed, 'w1', 'boom', now=t, rng=lambda: 0.5) == 'queued'
        db.refresh(job)
        delays.append((job.run_at - t).total_seconds())
        assert take(db, now=t + timedelta(seconds=delays[-1] - 1)) == []  # aún no toca
        t = job.run_at
    assert delays == [30, 60, 120]
    (last,) = take(db, now=t)
    assert queue.fail(db, last, 'w1', 'boom', now=t) == 'dead'
    db.refresh(job)
    assert job.status == 'dead' and job.finished_at == t and job.last_error == 'boom'


def test_backoff_is_capped_and_jittered(monkeypatch):
    monkeypatch.setitem(settings.__dict__, 'JOB_BACKOFF_BASE_SECONDS', 30)
    monkeypatch.setitem(settings.__dict__, 'JOB_BACKOFF_CAP_SECONDS', 600)
    assert queue.backoff_seconds(1, rng=lambda: 0.5) == 30
    assert queue.backoff_seconds(20, rng=lambda: 0.5) == 600
    assert queue.backoff_seconds(3, rng=lambda: 0) == pytest.approx(96) and queue.backoff_seconds(3, rng=lambda: 1) == pytest.approx(144)


def test_permanent_failure_skips_retries_and_long_errors_are_truncated(db):
    job = queue.enqueue(db, 'demo.task', max_attempts=5, now=NOW)[0]
    (claimed,) = take(db)
    assert queue.fail(db, claimed, 'w1', 'x' * 2000, permanent=True, now=NOW) == 'dead'
    db.refresh(job)
    assert job.status == 'dead' and job.attempts == 1 and len(job.last_error) == 500


def test_requeue_dead_resets_attempts_and_ignores_other_states(db):
    job = queue.enqueue(db, 'demo.task', max_attempts=1, now=NOW)[0]
    (claimed,) = take(db)
    assert queue.requeue_dead(db, job.id, now=NOW) is False  # en ejecución, no muerto
    queue.fail(db, claimed, 'w1', 'boom', now=NOW)
    assert queue.requeue_dead(db, job.id, now=NOW + timedelta(hours=1)) is True
    db.refresh(job)
    assert (job.status, job.attempts, job.finished_at) == ('queued', 0, None)
    assert [j.id for j in take(db, now=NOW + timedelta(hours=1))] == [job.id]
    assert queue.requeue_dead(db, 999999) is False


# ---------- restricciones de base ----------
def test_database_rejects_inconsistent_rows(migrated):
    bad = [
        "INSERT INTO jobs(kind,status) VALUES('demo','running')",                       # running sin concesión
        "INSERT INTO jobs(kind,status) VALUES('demo','succeeded')",                     # terminado sin finished_at
        "INSERT INTO jobs(kind,status,finished_at) VALUES('demo','queued',now())",      # en cola con finished_at
        "INSERT INTO jobs(kind,status) VALUES('demo','weird')",
        "INSERT INTO jobs(kind,attempts,max_attempts) VALUES('demo',6,5)",
        "INSERT INTO jobs(kind,max_attempts) VALUES('demo',0)",
        "INSERT INTO jobs(kind) VALUES('Bad Kind')",
        "INSERT INTO jobs(kind,payload) VALUES('demo','[1]'::jsonb)",
        "INSERT INTO jobs(kind,payload) VALUES('demo',('{\"a\":\"' || repeat('x',9000) || '\"}')::jsonb)",
    ]
    for statement in bad:
        with pytest.raises((IntegrityError, DBAPIError)):
            with migrated.begin() as c:
                c.execute(text(statement))


def test_migration_roundtrip(migrated, alembic_cfg):
    from alembic import command
    with migrated.begin() as c:
        c.execute(text("INSERT INTO jobs(kind) VALUES('demo')"))
    command.downgrade(alembic_cfg, '0016')
    with migrated.connect() as c:
        assert c.execute(text("SELECT to_regclass('public.jobs')")).scalar() is None
    command.upgrade(alembic_cfg, 'head')
    with migrated.connect() as c:
        assert c.execute(text('SELECT count(*) FROM jobs')).scalar() == 0


# ---------- ejecución ----------
def run_one(db, kind, handler, *, timeout=5, max_attempts=3, now=NOW, worker='w1', payload=None):
    registry.register(kind, timeout_seconds=timeout, max_attempts=max_attempts)(handler)
    job = queue.enqueue(db, kind, payload, max_attempts=max_attempts, now=now)[0]
    (claimed,) = queue.claim(db, worker, lease_of=runner.lease_of, now=now)
    return job, runner.execute(db, claimed, worker, now=now)


def test_handler_success_marks_succeeded(db):
    job, outcome = run_one(db, 'demo.ok', lambda db, job: calls.append(job.payload), payload={'n': 1})
    assert outcome == 'succeeded' and calls == [{'n': 1}]
    db.refresh(job)
    assert job.status == 'succeeded'


def test_handler_error_retries_and_scrubs_personal_data(db):
    def boom(db, job):
        raise RuntimeError('no se pudo enviar a alice@example.com con Bearer abcdefghijkl1234')
    job, outcome = run_one(db, 'demo.boom', boom)
    assert outcome == 'retry'
    db.refresh(job)
    assert job.status == 'queued' and job.run_at > NOW and job.attempts == 1
    assert 'alice@example.com' not in job.last_error and 'abcdefghijkl1234' not in job.last_error and job.last_error.startswith('RuntimeError')


def test_permanent_failure_and_unknown_kind_go_straight_to_dead(db):
    def bad(db, job):
        raise PermanentFailure('dato inválido')
    job, outcome = run_one(db, 'demo.perm', bad)
    assert outcome == 'dead'
    db.refresh(job)
    assert job.status == 'dead' and job.attempts == 1
    ghost = queue.enqueue(db, 'demo.nobody', now=NOW)[0]
    (claimed,) = queue.claim(db, 'w1', lease_of=runner.lease_of, now=NOW)
    assert runner.execute(db, claimed, 'w1', now=NOW) == 'dead'
    db.refresh(ghost)
    assert 'unknown_kind' in ghost.last_error


def test_retry_later_uses_the_requested_delay(db):
    def wait(db, job):
        raise RetryLater(120)
    job, outcome = run_one(db, 'demo.wait', wait)
    assert outcome == 'retry'
    db.refresh(job)
    assert job.run_at == NOW + timedelta(seconds=120)


def test_failed_handler_leaves_no_partial_writes(db, migrated):
    def half(db, job):
        db.execute(text("INSERT INTO jobs(kind) VALUES('demo.side-effect')"))
        raise RuntimeError('boom')
    run_one(db, 'demo.half', half)
    with migrated.connect() as c:
        assert c.execute(text("SELECT count(*) FROM jobs WHERE kind='demo.side-effect'")).scalar() == 0


def test_handler_cannot_swallow_the_timeout(db):
    def stubborn(db, job):
        try:
            time.sleep(10)
        except Exception:  # noqa: BLE001 — un handler descuidado no debe poder ignorar el tiempo máximo
            pass
    started = time.monotonic()
    job, outcome = run_one(db, 'demo.slow', stubborn, timeout=1)
    assert outcome == 'retry' and time.monotonic() - started < 5
    db.refresh(job)
    assert job.last_error.startswith('TimeoutError: timeout')


def test_timeout_alarm_is_cleared_after_each_job(db):
    run_one(db, 'demo.fast', lambda db, job: None, timeout=1)
    time.sleep(1.3)  # si la alarma siguiera armada interrumpiría esta línea


def test_late_result_after_losing_the_lease_is_reported_lost(db):
    def steal(db, job):
        later = NOW + timedelta(seconds=1000)
        with Session(db.get_bind(), expire_on_commit=False) as other:
            assert queue.claim(other, 'thief', lease_of=runner.lease_of, now=later)
    job, outcome = run_one(db, 'demo.stolen', steal)
    assert outcome == 'lost'
    db.refresh(job)
    assert job.status == 'running' and job.locked_by == 'thief'


def test_dead_job_is_reported_to_telemetry_without_payload(db, monkeypatch):
    seen = []
    monkeypatch.setattr(runner, 'capture_dead_job', lambda kind, job_id, exc: seen.append((kind, job_id, type(exc).__name__)))

    def boom(db, job):
        raise ValueError('x')
    job, outcome = run_one(db, 'demo.dies', boom, max_attempts=1)
    assert outcome == 'dead' and seen == [('demo.dies', job.id, 'ValueError')]


# ---------- programador ----------
def test_scheduler_enqueues_once_per_slot_even_with_many_schedulers(migrated):
    schedule = Schedule('demo.tick', 600, {'x': 1})
    with Session(migrated, expire_on_commit=False) as a, Session(migrated, expire_on_commit=False) as b:
        assert jobs.tick(a, [schedule], now=NOW) == 1
        assert jobs.tick(b, [schedule], now=NOW + timedelta(seconds=30)) == 0  # mismo hueco
        assert jobs.tick(a, [schedule], now=NOW + timedelta(seconds=600)) == 1
    assert slot_key(schedule, NOW) != slot_key(schedule, NOW + timedelta(seconds=600))


def test_scheduler_does_not_pile_up_a_backlog_after_downtime(db):
    schedule = Schedule('demo.tick', 600)
    jobs.tick(db, [schedule], now=NOW)
    jobs.tick(db, [schedule], now=NOW + timedelta(hours=5))
    assert db.query(Job).count() == 2  # no 30


def test_schedule_rejects_too_frequent_tasks():
    with pytest.raises(ValueError):
        Schedule('demo', 5)


def test_default_schedules_follow_the_storage_configuration(monkeypatch):
    from app.services.jobs import handlers
    monkeypatch.setitem(settings.__dict__, 'STORAGE_BACKEND', 'disabled')
    assert [s.kind for s in handlers.schedules()] == ['jobs.purge', 'anomalies.scan_all', 'alerts.evaluate_all', 'maintenance.retention']
    monkeypatch.setitem(settings.__dict__, 'STORAGE_BACKEND', 's3')
    assert [s.kind for s in handlers.schedules()] == ['jobs.purge', 'anomalies.scan_all', 'alerts.evaluate_all', 'maintenance.retention', 'storage.maintenance']


def test_duplicate_kind_registration_is_rejected():
    registry.register('demo.once')(lambda db, job: None)
    with pytest.raises(ValueError):
        registry.register('demo.once')(lambda db, job: None)
    with pytest.raises(ValueError):
        registry.register('Bad Kind')(lambda db, job: None)
    with pytest.raises(ValueError):
        registry.register('demo.long', timeout_seconds=99999)(lambda db, job: None)


# ---------- worker ----------
def test_worker_once_drains_due_jobs_and_exits(migrated):
    from sqlalchemy.orm import sessionmaker
    registry.register('demo.count', timeout_seconds=5)(lambda db, job: calls.append(job.id))
    with Session(migrated, expire_on_commit=False) as s:
        ids = [queue.enqueue(s, 'demo.count', now=datetime.now(timezone.utc) - timedelta(seconds=5))[0].id for _ in range(3)]
        queue.enqueue(s, 'demo.count', run_at=datetime.now(timezone.utc) + timedelta(hours=1))
    totals = run_worker(once=True, session_factory=sessionmaker(bind=migrated, expire_on_commit=False), schedule_items=[])
    assert totals == {'succeeded': 3, 'retry': 0, 'dead': 0, 'lost': 0} and sorted(calls) == sorted(ids)


def test_worker_stops_gracefully_and_runs_the_scheduler(migrated):
    from sqlalchemy.orm import sessionmaker
    registry.register('demo.sched', timeout_seconds=5)(lambda db, job: calls.append('ran'))
    stop = threading.Event()
    factory = sessionmaker(bind=migrated, expire_on_commit=False)
    thread = threading.Thread(target=run_worker, kwargs=dict(stop=stop, poll_seconds=0.2, session_factory=factory,
                                                             schedule_items=[Schedule('demo.sched', 3600)]))
    thread.start()
    deadline = time.monotonic() + 10
    while not calls and time.monotonic() < deadline:
        time.sleep(0.1)
    stop.set()
    thread.join(5)
    assert calls == ['ran'] and not thread.is_alive()


def test_worker_isolates_a_failing_job_from_the_rest(migrated):
    from sqlalchemy.orm import sessionmaker

    def maybe(db, job):
        if job.payload.get('bad'):
            raise RuntimeError('boom')
        calls.append(job.payload['n'])
    registry.register('demo.mixed', timeout_seconds=5, max_attempts=1)(maybe)
    past = datetime.now(timezone.utc) - timedelta(seconds=5)
    with Session(migrated, expire_on_commit=False) as s:
        queue.enqueue(s, 'demo.mixed', {'bad': True}, max_attempts=1, now=past)
        queue.enqueue(s, 'demo.mixed', {'n': 2}, max_attempts=1, now=past + timedelta(seconds=1))
    totals = run_worker(once=True, session_factory=sessionmaker(bind=migrated, expire_on_commit=False), schedule_items=[])
    assert totals['dead'] == 1 and totals['succeeded'] == 1 and calls == [2]


# ---------- observabilidad y limpieza ----------
def test_stats_reports_lag_stuck_and_dead_by_kind(db):
    queue.enqueue(db, 'demo.a', now=NOW - timedelta(minutes=10), run_at=NOW - timedelta(minutes=10))
    stuck = queue.enqueue(db, 'demo.b', now=NOW - timedelta(hours=1), run_at=NOW - timedelta(hours=1), max_attempts=1)[0]
    queue.claim(db, 'w', lease_of=lease, kinds=['demo.b'], now=NOW - timedelta(hours=1))
    report = queue.stats(db, now=NOW)
    assert report['queued'] == 1 and report['running'] == 1 and report['stuck'] == 1 and report['dead'] == 0
    assert report['oldest_queued_age_seconds'] == 600
    queue.claim(db, 'w2', lease_of=lease, kinds=['demo.b'], now=NOW)
    assert queue.stats(db, now=NOW)['dead_by_kind'] == {'demo.b': 1} and stuck.id


def test_purge_keeps_recent_and_active_jobs(db, migrated, monkeypatch):
    monkeypatch.setitem(settings.__dict__, 'JOB_SUCCEEDED_RETENTION_DAYS', 7)
    monkeypatch.setitem(settings.__dict__, 'JOB_DEAD_RETENTION_DAYS', 90)
    old, recent, dead_old, dead_recent, waiting = (queue.enqueue(db, 'demo.p', now=NOW)[0] for _ in range(5))
    with migrated.begin() as c:
        c.execute(text("UPDATE jobs SET status='succeeded', finished_at=:t WHERE id=:i"), {'t': NOW - timedelta(days=8), 'i': old.id})
        c.execute(text("UPDATE jobs SET status='succeeded', finished_at=:t WHERE id=:i"), {'t': NOW - timedelta(days=1), 'i': recent.id})
        c.execute(text("UPDATE jobs SET status='dead', finished_at=:t WHERE id=:i"), {'t': NOW - timedelta(days=91), 'i': dead_old.id})
        c.execute(text("UPDATE jobs SET status='dead', finished_at=:t WHERE id=:i"), {'t': NOW - timedelta(days=30), 'i': dead_recent.id})
    assert queue.purge(db, now=NOW) == {'succeeded': 1, 'dead': 1}
    left = {r.id for r in db.query(Job.id).all()}
    assert left == {recent.id, dead_recent.id, waiting.id}


def test_builtin_handlers_run_end_to_end(db, migrated, tmp_path, monkeypatch):
    from app.services.storage import EncryptedStore, Keyring, LocalFileStore, set_store_for_tests
    from app.services.jobs import handlers  # noqa: F401 — registra los tipos integrados
    import base64
    set_store_for_tests(EncryptedStore(LocalFileStore(tmp_path), Keyring.parse('k1:' + base64.urlsafe_b64encode(bytes(range(32))).decode())))
    try:
        for kind in ('storage.maintenance', 'jobs.purge'):
            queue.enqueue(db, kind, now=NOW)
        taken = queue.claim(db, 'w', lease_of=runner.lease_of, limit=5, now=NOW)
        assert sorted(runner.execute(db, j, 'w', now=NOW) for j in taken) == ['succeeded', 'succeeded']
        set_store_for_tests(None)
        queue.enqueue(db, 'storage.maintenance', {'again': 1}, now=NOW)
        (job,) = queue.claim(db, 'w', lease_of=runner.lease_of, now=NOW)
        assert runner.execute(db, job, 'w', now=NOW) == 'dead'  # sin almacenamiento no hay nada que reintentar
    finally:
        set_store_for_tests(None)


def test_jobs_cli(migrated, monkeypatch, capsys):
    from sqlalchemy.orm import sessionmaker
    from scripts import jobs as cli
    monkeypatch.setattr(cli, 'SessionLocal', sessionmaker(bind=migrated, expire_on_commit=False))
    assert cli.main(['stats']) == 0
    with Session(migrated, expire_on_commit=False) as s:
        job = queue.enqueue(s, 'demo.cli', {'secreto': 'no debe salir'}, max_attempts=1, now=NOW)[0]
        (c,) = queue.claim(s, 'w', lease_of=lease, now=NOW)
        queue.fail(s, c, 'w', 'ValueError: fallo', now=NOW)
    capsys.readouterr()
    assert cli.main(['stats']) == 1  # hay un muerto
    capsys.readouterr()
    assert cli.main(['dead']) == 0
    out = capsys.readouterr().out
    assert 'demo.cli' in out and 'fallo' in out and 'secreto' not in out
    assert cli.main(['requeue', str(job.id)]) == 0
    assert cli.main(['requeue', str(job.id)]) == 2


def test_enqueue_uses_the_max_attempts_registered_for_the_kind(db):
    registry.register('demo.limited', max_attempts=2)(lambda db, job: None)
    assert queue.enqueue(db, 'demo.limited', now=NOW)[0].max_attempts == 2
    assert queue.enqueue(db, 'demo.limited', max_attempts=7, now=NOW)[0].max_attempts == 7  # lo explícito gana
    assert queue.enqueue(db, 'demo.unregistered', now=NOW)[0].max_attempts == settings.JOB_DEFAULT_MAX_ATTEMPTS
