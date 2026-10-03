import os

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.config import DEFAULT_DATABASE_URL

TEST_URL = os.getenv(
    "TEST_DATABASE_URL", DEFAULT_DATABASE_URL.rsplit("/", 1)[0] + "/energy_rd_test"
)


def _ensure_test_db() -> None:
    url = make_url(TEST_URL)
    admin = create_engine(url.set(database="postgres"), isolation_level="AUTOCOMMIT")
    with admin.connect() as c:
        exists = c.execute(text("SELECT 1 FROM pg_database WHERE datname=:n"), {"n": url.database}).scalar()
        if not exists:
            c.execute(text(f'CREATE DATABASE "{url.database}"'))
    admin.dispose()


@pytest.fixture(scope="session")
def engine():
    try:
        _ensure_test_db()
        eng = create_engine(TEST_URL)
        with eng.connect() as c:
            c.execute(text("SELECT 1"))
    except Exception as exc:  # pragma: no cover
        pytest.skip(f"PostgreSQL no disponible ({exc.__class__.__name__}); ejecuta `docker compose up -d postgres`")
    yield eng
    eng.dispose()


@pytest.fixture()
def alembic_cfg(engine, monkeypatch):
    # env.py usa settings.DATABASE_URL; lo apuntamos a la base de pruebas.
    from app.config import settings

    monkeypatch.setattr(settings, "DATABASE_URL", TEST_URL)
    cfg = Config("alembic.ini")
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
