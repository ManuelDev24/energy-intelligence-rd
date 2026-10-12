"""Auditoría C-15: retención con plazos (DB-05) y auditoría con autor y sin datos personales (DB-04)."""
from datetime import datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services import retention
from tests.test_auth import PASSWORD, auth_client, bearer, register  # noqa: F401

NOW = datetime(2026, 10, 11, 12, tzinfo=timezone.utc)
OLD, RECENT = NOW - timedelta(days=800), NOW - timedelta(days=2)


def _seed(engine):
    with engine.begin() as c:
        run = lambda sql, **p: c.execute(text(sql), p)  # noqa: E731
        user = run("INSERT INTO users(id,email,password_hash) VALUES(gen_random_uuid(),'r@example.com','x') RETURNING id").scalar()
        home = run("INSERT INTO homes(id,name,distributor) VALUES(gen_random_uuid(),'Casa','EDESUR') RETURNING id").scalar()
        for when in (OLD, RECENT):  # sesión revocada vieja / reciente; sesión vigente
            run("INSERT INTO auth_sessions(id,user_id,created_at,expires_at,revoked_at) VALUES(gen_random_uuid(),:u,:w,:w,:w)", u=user, w=when)
        run("INSERT INTO auth_sessions(id,user_id,expires_at) VALUES(gen_random_uuid(),:u,:e)", u=user, e=NOW + timedelta(days=10))
        for key, when in (("old", OLD), ("new", RECENT)):
            run("INSERT INTO auth_abuse_buckets(key,window_started_at,attempts) VALUES(:k,:w,1)", k=key * 10, w=when)
        for when in (OLD, RECENT):
            run("INSERT INTO home_invitations(id,home_id,email,token_hash,invited_by,created_at,expires_at,revoked_at) "
                "VALUES(gen_random_uuid(),:h,'tercero@example.com',md5(random()::text)||md5(random()::text),:u,:w,:w,:w)", h=home, u=user, w=when)
        run("INSERT INTO home_invitations(id,home_id,email,token_hash,invited_by,expires_at) "
            "VALUES(gen_random_uuid(),:h,'pendiente@example.com',md5('p')||md5('q'),:u,:e)", h=home, u=user, e=NOW + timedelta(days=3))
        for when, status in ((OLD, "dismissed"), (OLD, "unread"), (RECENT, "dismissed")):
            run("INSERT INTO alerts(id,home_id,type,severity,message,status,created_at) VALUES(gen_random_uuid(),:h,'bill_variation','warning','m',:s,:w)",
                h=home, s=status, w=when)
        for when in (OLD, RECENT):
            run("INSERT INTO audit_events(id,home_id,entity_id,entity,operation,actor,created_at) VALUES(gen_random_uuid(),:h,:h,'homes','update','pilot',:w)",
                h=home, w=when)
    return user, home


def counts(engine):
    with engine.connect() as c:
        return {t: c.execute(text(f"SELECT count(*) FROM {t}")).scalar()
                for t in ("auth_sessions", "auth_abuse_buckets", "home_invitations", "alerts", "audit_events")}


def test_retention_removes_only_what_is_past_its_deadline(migrated):
    _seed(migrated)
    before = counts(migrated)
    with Session(migrated) as db:
        removed = retention.purge(db, now=NOW)
    assert removed["sessions"] == 1 and removed["abuse_buckets"] == 1 and removed["invitations"] == 1
    assert removed["dismissed_alerts"] == 1 and removed["audit_events"] == 1
    after = counts(migrated)
    assert after == {t: before[t] - n for t, n in zip(after, (1, 1, 1, 1, 1))}
    with migrated.connect() as c:  # lo vigente y lo reciente siguen
        assert c.execute(text("SELECT count(*) FROM home_invitations WHERE revoked_at IS NULL")).scalar() == 1
        assert c.execute(text("SELECT count(*) FROM alerts WHERE status='unread'")).scalar() == 1
    with Session(migrated) as db:  # idempotente
        assert sum(retention.purge(db, now=NOW).values()) == 0


def test_retention_is_scheduled_daily():
    from app.services.jobs import handlers
    assert "maintenance.retention" in [s.kind for s in handlers.schedules()]


def test_audit_records_who_changed_what_without_copying_personal_data(auth_client, migrated):
    alice = register(auth_client)
    home = auth_client.post("/api/v1/homes", headers=bearer(alice), json={"name": "Casa", "distributor": "EDESUR",
                                                                          "address": "Calle Falsa 123", "city": "Santiago"}).json()["id"]
    assert auth_client.put(f"/api/v1/homes/{home}/contract", headers=bearer(alice), json={"account_number": "123456789"}).status_code in (200, 201)
    assert auth_client.patch(f"/api/v1/homes/{home}", headers=bearer(alice), json={"address": "Avenida Nueva 9"}).status_code == 200
    with migrated.connect() as c:
        rows = c.execute(text("SELECT entity, operation, actor_user_id, before::text AS b, after::text AS a FROM audit_events WHERE home_id=:h"),
                         {"h": home}).all()
        me = c.execute(text("SELECT id FROM users")).scalar()
    assert rows and all(r.actor_user_id == me for r in rows)
    dump = " ".join(f"{r.b} {r.a}" for r in rows)
    for secret in ("Calle Falsa 123", "Avenida Nueva 9", "123456789", "Santiago"):
        assert secret not in dump
    update = next(r for r in rows if r.entity == "homes" and r.operation == "update")
    import json
    before, after = json.loads(update.b), json.loads(update.a)
    assert before["address"].startswith("[redacted:") and before["address"] != after["address"]  # se sabe que cambió, no a qué
    assert before["city"] == after["city"]


def test_deleting_the_account_detaches_the_author_from_the_audit(auth_client, migrated):
    alice = register(auth_client)
    auth_client.post("/api/v1/homes", headers=bearer(alice), json={"name": "Casa", "distributor": "EDESUR"})
    assert auth_client.request("DELETE", "/api/v1/auth/me", headers=bearer(alice), json={"password": PASSWORD}).status_code == 204
    with migrated.connect() as c:
        assert c.execute(text("SELECT count(*) FROM audit_events WHERE actor_user_id IS NOT NULL AND actor_user_id NOT IN (SELECT id FROM users)")).scalar() == 0


def test_0026_migration_redacts_existing_rows(migrated, alembic_cfg):
    from alembic import command
    command.downgrade(alembic_cfg, "0027")
    with migrated.begin() as c:
        c.exec_driver_sql("""INSERT INTO audit_events(id,home_id,entity_id,entity,operation,actor,before,after,created_at)
                             VALUES(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'contracts','update','pilot',
                             '{"account_number":"999888777","note":"x"}','{"account_number":"111","address":null}',now())""")
    command.upgrade(alembic_cfg, "head")
    with migrated.connect() as c:
        before, after = c.execute(text("SELECT before, after FROM audit_events")).one()
    assert before == {"account_number": "[redacted]", "note": "x"} and after == {"account_number": "[redacted]", "address": None}
