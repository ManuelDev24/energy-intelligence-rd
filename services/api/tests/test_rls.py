"""Auditoría C-01: aislamiento por vivienda en la base (RLS, migración 0025) probado con los roles reales `erd_app` y `erd_worker`.

Los datos se crean como superusuario de pruebas (que ignora la RLS) y se leen/escriben con los roles restringidos, con el contexto
(`app.user_id`, `app.home_id`) que fija el API. Es la «matriz RLS» que pedía la auditoría: tabla × operación × vivienda propia/ajena/sin contexto.
"""
import uuid

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import DBAPIError, ProgrammingError
from sqlalchemy.orm import Session

from app import rls
from tests.conftest import RLS_TEST_PASSWORD, rls_engine

HOME_TABLES = ["alert_settings", "alerts", "anomalies", "bills", "contracts", "documents", "equipment", "home_goals",
               "meter_readings", "power_outages", "recommendations"]
CHILD_TABLES = ["bill_items", "bill_snapshots", "document_ocr"]
ALL_TABLES = ["homes", "home_members", *HOME_TABLES, *CHILD_TABLES]


def seed_home(engine, tag: str):
    """Una persona propietaria y una vivienda con al menos una fila en cada tabla protegida."""
    ids = {name: str(uuid.uuid4()) for name in ("user", "home", "bill", "doc")}
    with engine.begin() as c:
        run = lambda sql, **p: c.execute(text(sql), {**ids, "tag": tag, **p})  # noqa: E731
        run("INSERT INTO users(id,email,password_hash) VALUES(:user,:email,'x')", email=f"{tag}@example.com")
        run("INSERT INTO homes(id,name,distributor,code) VALUES(:home,:tag,'EDESUR',:tag)")
        run("INSERT INTO home_members(home_id,user_id,role) VALUES(:home,:user,'owner')")
        run("INSERT INTO contracts(home_id,account_number) VALUES(:home,:tag)")
        run("INSERT INTO home_goals(home_id,monthly_kwh) VALUES(:home,100)")
        run("INSERT INTO alert_settings(home_id) VALUES(:home)")
        run("INSERT INTO bills(id,home_id,period_start,period_end,kwh,amount_dop,days,source) "
            "VALUES(:bill,:home,'2026-09-01','2026-09-30',300,3000,30,'manual')")
        run("INSERT INTO bill_items(id,bill_id,position,label,kind,amount_dop) VALUES(gen_random_uuid(),:bill,1,'cargo','charge',10)")
        run("INSERT INTO bill_snapshots(bill_id,origin,data) VALUES(:bill,'creation','{}')")
        run("INSERT INTO meter_readings(id,home_id,read_at,reading_kwh) VALUES(gen_random_uuid(),:home,'2026-09-01T10:00Z',100)")
        run("INSERT INTO equipment(id,home_id,name,power_w,hours_per_day) VALUES(gen_random_uuid(),:home,'Nevera',150,24)")
        run("INSERT INTO power_outages(id,home_id,started_at) VALUES(gen_random_uuid(),:home,'2026-09-02T10:00Z')")
        run("INSERT INTO alerts(id,home_id,type,severity,message) VALUES(gen_random_uuid(),:home,'bill_variation','warning','m')")
        run("INSERT INTO anomalies(id,home_id,kind,source,granularity,severity,confidence,period_start,period_end,observed_kwh,baseline_kwh,"
            "days,explanation,dedupe_key) VALUES(gen_random_uuid(),:home,'increase','readings','month','warning','high','2026-09-01',"
            "'2026-09-30',300,100,30,'x',:tag)")
        run("INSERT INTO recommendations(id,home_id,rule_id,rule_version,ruleset_version,category,title,summary,action,confidence,dedupe_key) "
            "VALUES(gen_random_uuid(),:home,'r',1,1,'equipment','t','s','a','medium',:tag)")
        run("INSERT INTO documents(id,home_id,kind,content_type,size_bytes,sha256,storage_key,uploaded_via,retention_until) "
            "VALUES(:doc,:home,'bill_photo','image/jpeg',10,:sha,:key,'web',now()+interval '7 days')",
            sha="a" * 64, key=f"homes/{ids['home']}/documents/{ids['doc']}")
        run("INSERT INTO document_ocr(document_id) VALUES(:doc)")
    return ids


@pytest.fixture()
def world(migrated):
    a, b = seed_home(migrated, "alpha"), seed_home(migrated, "beta")
    engine = rls_engine(migrated)
    yield migrated, engine, a, b
    engine.dispose()


def as_app(engine, *, user=None, home=None):
    """Conexión de `erd_app` con el mismo contexto que fija el API, local a la transacción."""
    connection = engine.connect()
    transaction = connection.begin()
    connection.execute(text("SELECT set_config('app.user_id', :u, true), set_config('app.home_id', :h, true)"),
                       {"u": user or "", "h": home or ""})
    return connection, transaction


def count(connection, table):
    return connection.execute(text(f"SELECT count(*) FROM {table}")).scalar()


# ---------- cobertura: una tabla nueva con datos por vivienda sin RLS rompe la prueba ----------
def test_every_table_with_a_home_column_has_rls_and_both_policies(migrated):
    with migrated.connect() as c:
        with_home = {r[0] for r in c.execute(text(
            "SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='home_id'"))}
        protected = {r[0] for r in c.execute(text(
            "SELECT relname FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' AND relrowsecurity"))}
        policies = {(r[0], r[1]) for r in c.execute(text("SELECT tablename, unnest(roles)::text FROM pg_policies WHERE schemaname='public'"))}
    # audit_events y home_invitations quedan fuera a propósito (ver la migración 0025 y docs/ops/DB_ROLES.md).
    unprotected = with_home - protected - {"audit_events", "home_invitations"}
    assert not unprotected, f"Tablas con home_id sin RLS: {sorted(unprotected)}"
    assert set(ALL_TABLES) <= protected
    for table in ALL_TABLES:
        assert (table, "erd_app") in policies and (table, "erd_worker") in policies, table


def test_the_application_roles_hold_no_special_privileges(migrated, world):
    _, engine, *_ = world
    with migrated.connect() as c:
        for role in ("erd_app", "erd_worker"):
            rolsuper, bypass, createrole, createdb = c.execute(text(
                "SELECT rolsuper, rolbypassrls, rolcreaterole, rolcreatedb FROM pg_roles WHERE rolname=:r"), {"r": role}).one()
            assert not (rolsuper or bypass or createrole or createdb), role
            assert c.execute(text("SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tableowner=:r"), {"r": role}).scalar() == 0
    with engine.connect() as c:
        for statement in ("CREATE TABLE intruso(id int)", "ALTER TABLE bills ADD COLUMN x int", "TRUNCATE bills",
                          "DROP TABLE bills", "SELECT * FROM alembic_version", "ALTER TABLE bills DISABLE ROW LEVEL SECURITY"):
            with pytest.raises(ProgrammingError):
                c.execute(text(statement))
            c.rollback()


# ---------- lectura ----------
@pytest.mark.parametrize("table", [t for t in ALL_TABLES if t != "homes"])
def test_without_context_no_row_is_visible(world, table):
    migrated, engine, *_ = world
    with migrated.connect() as c:
        assert count(c, table) >= 2, f"{table}: la prueba necesita filas de las dos viviendas"
    connection, transaction = as_app(engine)
    try:
        assert count(connection, table) == 0
    finally:
        transaction.rollback()
        connection.close()


def test_without_context_no_home_is_visible(world):
    _, engine, *_ = world
    connection, transaction = as_app(engine)
    try:
        assert count(connection, "homes") == 0
    finally:
        transaction.rollback()
        connection.close()


@pytest.mark.parametrize("table", [t for t in ALL_TABLES if t not in ("homes", "home_members")])
def test_a_home_context_sees_only_its_own_rows(world, table):
    migrated, engine, a, b = world
    with migrated.connect() as c:
        total = count(c, table)
    for own in (a, b):
        connection, transaction = as_app(engine, user=own["user"], home=own["home"])
        try:
            seen = count(connection, table)
            assert 0 < seen < total, f"{table}: ve {seen} de {total} filas"
            if table in HOME_TABLES:
                assert connection.execute(text(f"SELECT count(*) FROM {table} WHERE home_id <> :h"), {"h": own["home"]}).scalar() == 0
        finally:
            transaction.rollback()
            connection.close()


def test_a_person_sees_their_own_homes_and_memberships_but_not_other_peoples(world):
    _, engine, a, b = world
    connection, transaction = as_app(engine, user=a["user"])  # sin vivienda de contexto: solo lo propio por membresía
    try:
        assert [str(r[0]) for r in connection.execute(text("SELECT id FROM homes"))] == [a["home"]]
        assert [str(r[0]) for r in connection.execute(text("SELECT user_id FROM home_members"))] == [a["user"]]
        assert count(connection, "bills") == 0  # tener membresía no abre los datos: hace falta el contexto de la vivienda
    finally:
        transaction.rollback()
        connection.close()


def test_a_forged_context_for_a_home_still_needs_the_membership_for_the_homes_table_only_by_design(world):
    """Documenta el alcance: la RLS contiene errores de autorización del código, no a quien ya puede ejecutar SQL con `set_config`."""
    _, engine, a, b = world
    connection, transaction = as_app(engine, user=a["user"], home=b["home"])
    try:
        assert count(connection, "bills") == 1  # el contexto manda; por eso solo `authorize_home` (tras comprobar la membresía) lo fija
    finally:
        transaction.rollback()
        connection.close()


# ---------- escritura ----------
@pytest.mark.parametrize("sql", [
    "INSERT INTO equipment(id,home_id,name,power_w,hours_per_day) VALUES(gen_random_uuid(),:other,'Intruso',1,1)",
    "INSERT INTO meter_readings(id,home_id,read_at,reading_kwh) VALUES(gen_random_uuid(),:other,'2026-10-01T10:00Z',999)",
    "INSERT INTO power_outages(id,home_id,started_at) VALUES(gen_random_uuid(),:other,'2026-10-01T10:00Z')",
    "INSERT INTO bills(id,home_id,period_start,period_end,kwh,amount_dop,days,source) VALUES(gen_random_uuid(),:other,'2026-10-01','2026-10-31',1,1,31,'manual')",
    "INSERT INTO home_members(home_id,user_id,role) VALUES(:other,:me,'owner')",
    "INSERT INTO home_members(home_id,user_id,role) VALUES(:mine,:stranger,'owner')",  # nadie mete a otra persona: solo se inserta la propia
])
def test_writing_into_another_home_is_rejected(world, sql):
    _, engine, a, b = world
    connection, transaction = as_app(engine, user=a["user"], home=a["home"])
    try:
        with pytest.raises(DBAPIError, match="row-level security"):
            connection.execute(text(sql), {"other": b["home"], "me": a["user"], "mine": a["home"], "stranger": b["user"]})
    finally:
        transaction.rollback()
        connection.close()


@pytest.mark.parametrize("sql", [
    "UPDATE bills SET kwh = 1 WHERE home_id = :other", "DELETE FROM equipment WHERE home_id = :other",
    "UPDATE contracts SET account_number = 'x' WHERE home_id = :other", "DELETE FROM documents WHERE home_id = :other",
    "UPDATE homes SET name = 'x' WHERE id = :other", "DELETE FROM homes WHERE id = :other",
    "DELETE FROM home_members WHERE home_id = :other", "UPDATE bill_items SET label = 'x'",
])
def test_updates_and_deletes_of_another_home_affect_zero_rows(world, sql):
    migrated, engine, a, b = world
    connection, transaction = as_app(engine, user=a["user"], home=a["home"])
    try:
        result = connection.execute(text(sql), {"other": b["home"]})
        if "bill_items" in sql:  # sin filtro: solo alcanza a los de la vivienda propia
            assert result.rowcount == 1
        else:
            assert result.rowcount == 0
    finally:
        transaction.rollback()
        connection.close()
    with migrated.connect() as c:
        assert count(c, "bills") == 2 and count(c, "homes") == 2 and count(c, "equipment") == 2


def test_a_person_can_create_a_home_but_only_with_a_session(world):
    _, engine, a, _ = world
    new_home = str(uuid.uuid4())
    connection, transaction = as_app(engine, user=a["user"], home=new_home)
    try:
        connection.execute(text("INSERT INTO homes(id,name,distributor) VALUES(:h,'Nueva','EDESUR')"), {"h": new_home})
        connection.execute(text("INSERT INTO home_members(home_id,user_id,role) VALUES(:h,:u,'owner')"), {"h": new_home, "u": a["user"]})
        assert count(connection, "homes") == 2
    finally:
        transaction.rollback()
        connection.close()
    anonymous, transaction = as_app(engine)
    try:
        with pytest.raises(DBAPIError, match="row-level security"):
            anonymous.execute(text("INSERT INTO homes(id,name,distributor) VALUES(gen_random_uuid(),'Sin sesión','EDESUR')"))
    finally:
        transaction.rollback()
        anonymous.close()


# ---------- worker ----------
@pytest.mark.parametrize("table", ALL_TABLES)
def test_the_worker_role_sees_every_home(migrated, world, table):
    worker = rls_engine(migrated, "erd_worker")
    try:
        with worker.connect() as c, migrated.connect() as su:
            assert count(c, table) == count(su, table) >= 2
    finally:
        worker.dispose()


# ---------- ciclo de vida del contexto ----------
def test_context_is_transaction_local_and_never_leaks_through_the_pool(world):
    _, engine, a, _ = world
    for _ in range(3):  # la misma conexión del pool se reutiliza
        connection, transaction = as_app(engine, user=a["user"], home=a["home"])
        assert count(connection, "bills") == 1
        transaction.commit()
        assert count(connection, "bills") == 0  # transacción nueva: sin contexto
        connection.commit()
        connection.close()


def test_rls_module_reapplies_the_context_at_every_transaction_and_applies_changes_immediately(world):
    _, engine, a, b = world
    with Session(engine) as db:
        rls.set_context(db, user_id=a["user"], home_id=a["home"])  # sin transacción abierta: queda para el próximo begin
        assert db.execute(text("SELECT count(*) FROM bills")).scalar() == 1
        db.commit()
        assert db.execute(text("SELECT count(*) FROM bills")).scalar() == 1  # after_begin lo reaplica tras el commit
        rls.set_context(db, home_id=b["home"])  # cambio con transacción abierta: efecto inmediato
        assert str(db.execute(text("SELECT id FROM bills")).scalar()) == b["bill"]
        rls.set_context(db, home_id=None)
        assert db.execute(text("SELECT count(*) FROM bills")).scalar() == 0
        db.rollback()


def test_rls_module_rejects_anything_that_is_not_a_uuid():
    with pytest.raises(ValueError):
        rls._text("x'; DROP TABLE bills; --")
    assert rls._text(None) == "" and rls._text(uuid.UUID(int=1)) == str(uuid.UUID(int=1))


def test_migration_downgrade_and_upgrade_roundtrip(migrated, alembic_cfg):
    from alembic import command
    command.downgrade(alembic_cfg, "0024")
    with migrated.connect() as c:
        assert c.execute(text("SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relrowsecurity")).scalar() == 0
        assert c.execute(text("SELECT count(*) FROM pg_proc WHERE proname IN ('app_user','app_home')")).scalar() == 0
    command.upgrade(alembic_cfg, "head")
    with migrated.connect() as c:
        assert c.execute(text("SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relrowsecurity")).scalar() == 16


def test_an_owner_can_still_manage_the_members_of_the_current_home_only(world):
    """Transferir la propiedad (UPDATE) y expulsar (DELETE) funcionan en la vivienda del contexto y en ninguna otra."""
    migrated, engine, a, b = world
    second = str(uuid.uuid4())
    with migrated.begin() as c:
        c.execute(text("INSERT INTO users(id,email,password_hash) VALUES(:u,'segundo@example.com','x')"), {"u": second})
        c.execute(text("INSERT INTO home_members(home_id,user_id,role) VALUES(:h,:u,'member')"), {"h": a["home"], "u": second})
    connection, transaction = as_app(engine, user=a["user"], home=a["home"])
    try:
        assert connection.execute(text("UPDATE home_members SET role='owner' WHERE home_id=:h AND user_id=:u"),
                                  {"h": a["home"], "u": second}).rowcount == 1
        assert connection.execute(text("UPDATE home_members SET role='member' WHERE home_id=:h"), {"h": b["home"]}).rowcount == 0
        assert connection.execute(text("DELETE FROM home_members WHERE home_id=:h AND user_id=:u"), {"h": a["home"], "u": second}).rowcount == 1
        assert connection.execute(text("DELETE FROM home_members WHERE home_id=:h"), {"h": b["home"]}).rowcount == 0
    finally:
        transaction.rollback()
        connection.close()


def test_the_worker_processes_jobs_of_every_home_with_its_own_restricted_role(migrated, world):
    """El worker (rol `erd_worker`) ejecuta trabajos de TODAS las viviendas sin fijar contexto: sus políticas lo permiten."""
    from datetime import datetime, timedelta, timezone

    from sqlalchemy.orm import sessionmaker

    from app.services.jobs import queue
    from app.worker import run_worker

    _, _, a, b = world
    past = datetime.now(timezone.utc) - timedelta(seconds=5)
    with Session(migrated, expire_on_commit=False) as s:
        for ids in (a, b):
            queue.enqueue(s, "alerts.evaluate_home", {"home_id": ids["home"]}, now=past)
    worker = rls_engine(migrated, "erd_worker")
    try:
        totals = run_worker(once=True, session_factory=sessionmaker(bind=worker, expire_on_commit=False), schedule_items=[])
    finally:
        worker.dispose()
    assert totals["succeeded"] == 2 and totals["dead"] == 0 and totals["retry"] == 0


def test_the_api_role_cannot_run_the_workers_jobs_across_homes_by_accident(world):
    """Sin contexto, el rol del API no obtiene filas de ninguna vivienda aunque ejecute la misma consulta que el worker."""
    _, engine, *_ = world
    connection, transaction = as_app(engine)
    try:
        assert connection.execute(text("SELECT count(DISTINCT home_id) FROM bills")).scalar() == 0
    finally:
        transaction.rollback()
        connection.close()


# ---------- verificación del rol de la conexión (arranque en staging/production) ----------
def test_the_startup_check_rejects_privileged_roles_and_accepts_the_restricted_ones(migrated, world):
    from app.database import database_role_problem
    with migrated.connect() as c:  # superusuario y dueño de las tablas
        problem = database_role_problem(c)
    assert problem and "superusuario" in problem and "dueño de tablas" in problem
    for role in ("erd_app", "erd_worker"):
        engine = rls_engine(migrated, role)
        try:
            with engine.connect() as c:
                assert database_role_problem(c) is None, role
        finally:
            engine.dispose()


def test_require_restricted_role_blocks_startup_only_when_configured(migrated, monkeypatch):
    from app import database
    monkeypatch.setattr(database, "engine", migrated)  # el motor de pruebas conecta como superusuario
    monkeypatch.setattr(database.settings, "DB_REQUIRE_RESTRICTED_ROLE", False)
    database.require_restricted_role()  # sin la bandera no hace nada
    monkeypatch.setattr(database.settings, "DB_REQUIRE_RESTRICTED_ROLE", True)
    with pytest.raises(RuntimeError, match="ignora la RLS"):
        database.require_restricted_role()


def test_the_regrant_script_matches_the_migration_and_is_idempotent(migrated):
    """`scripts/db_grants.sql` (se usa tras restaurar un respaldo con --no-acl) debe dejar los permisos como la migración."""
    from pathlib import Path

    script = (Path(__file__).resolve().parents[1] / "scripts" / "db_grants.sql").read_text()
    statements = [s.strip() for s in script.split(";") if s.strip() and not s.strip().startswith("--")]
    cleaned = [" ".join(line for line in s.splitlines() if not line.strip().startswith("--")) for s in statements]
    with migrated.begin() as c:
        c.execute(text("REVOKE ALL ON ALL TABLES IN SCHEMA public FROM erd_app, erd_worker"))  # simula --no-acl
    with migrated.connect() as c:
        assert c.execute(text("SELECT has_table_privilege('erd_app', 'public.bills', 'SELECT')")).scalar() is False
    for _ in range(2):  # dos veces: idempotente
        with migrated.begin() as c:
            for statement in cleaned:
                c.execute(text(statement))
    with migrated.connect() as c:
        for table in ("bills", "homes", "users", "jobs"):
            for role in ("erd_app", "erd_worker"):
                assert c.execute(text("SELECT has_table_privilege(:r, :t, 'SELECT, INSERT, UPDATE, DELETE')"), {"r": role, "t": f"public.{table}"}).scalar()
                assert not c.execute(text("SELECT has_table_privilege(:r, :t, 'TRUNCATE')"), {"r": role, "t": f"public.{table}"}).scalar()
        assert not c.execute(text("SELECT has_table_privilege('erd_app', 'public.alembic_version', 'SELECT')")).scalar()
