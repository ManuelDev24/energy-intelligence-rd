import os

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.config import DEFAULT_DATABASE_URL, settings
from tests.db_safety import validate_test_database_url

TEST_URL = os.getenv(
    "TEST_DATABASE_URL", DEFAULT_DATABASE_URL.rsplit("/", 1)[0] + "/energy_rd_test"
)


def _ensure_test_db() -> None:
    url = validate_test_database_url(TEST_URL, settings.DATABASE_URL)
    admin = create_engine(url.set(database="postgres"), isolation_level="AUTOCOMMIT")
    try:
        with admin.connect() as c:
            exists = c.execute(text("SELECT 1 FROM pg_database WHERE datname=:n"), {"n": url.database}).scalar()
            if not exists:
                c.execute(text(f'CREATE DATABASE "{url.database}"'))
    finally:
        admin.dispose()


@pytest.fixture(scope="session")
def engine():
    # Validation must never be caught and converted into a successful skip.
    validate_test_database_url(TEST_URL, settings.DATABASE_URL)
    try:
        _ensure_test_db()
        eng = create_engine(TEST_URL)
        with eng.connect() as c:
            c.execute(text("SELECT 1"))
    except OperationalError as exc:  # pragma: no cover
        if os.getenv("CI", "").lower() in {"true", "1"}:
            pytest.fail(f"PostgreSQL is required in CI ({exc.__class__.__name__})", pytrace=False)
        pytest.skip(f"PostgreSQL no disponible ({exc.__class__.__name__}); ejecuta `docker compose up -d postgres`")
    yield eng
    eng.dispose()


@pytest.fixture()
def alembic_cfg(engine, monkeypatch):
    # env.py usa settings.DATABASE_URL; lo apuntamos a la base de pruebas.
    from app.config import settings

    monkeypatch.setattr(settings, "DATABASE_URL", TEST_URL)
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", TEST_URL.replace("%", "%%"))
    return cfg


@pytest.fixture()
def migrated(engine, alembic_cfg):
    with engine.begin() as c:
        c.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"))
    command.upgrade(alembic_cfg, "head")
    yield engine


@pytest.fixture()
def session(migrated):
    with Session(migrated) as s:
        yield s
        s.rollback()


@pytest.fixture()
def client(migrated, monkeypatch):
    """TestClient de la API contra la base de pruebas ya migrada (vacía)."""
    from fastapi.testclient import TestClient
    from sqlalchemy.orm import sessionmaker

    from app.database import get_db
    from app.main import app
    from app import main as main_module

    # Health uses a module-level engine, not get_db; isolate it explicitly too.
    monkeypatch.setattr(main_module, "engine", migrated)

    factory = sessionmaker(bind=migrated, autoflush=False, expire_on_commit=False)

    def _get_db():
        db = factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture()
def seeded_client(client, migrated):
    from sqlalchemy.orm import Session

    from app.seed import seed_pilot

    with Session(migrated) as s:
        seed_pilot(s)
    return client
