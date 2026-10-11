"""Disposable DB lifecycle; invoked only by run.mjs in the API's uv environment."""
import os
import sys
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

NAME = "energy_rd_admin_e2e_test"


def guarded_url():
    url = make_url(os.environ["DATABASE_URL"])
    if (url.drivername != "postgresql+psycopg" or url.database != NAME
            or url.host not in ("localhost", "127.0.0.1") or url.query):
        raise RuntimeError("Refusing non-disposable/non-local database")
    return url


def main(action):
    url = guarded_url()
    admin = create_engine(url.set(database="postgres"), isolation_level="AUTOCOMMIT")
    try:
        with admin.connect() as conn:
            if action == "create":
                if conn.scalar(text("SELECT 1 FROM pg_database WHERE datname=:name"), {"name": NAME}):
                    raise RuntimeError("Disposable DB already exists; refusing to overwrite it")
                conn.execute(text(f'CREATE DATABASE "{NAME}"'))
            elif action == "drop":
                conn.execute(text("SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                                  "WHERE datname=:name AND pid <> pg_backend_pid()"), {"name": NAME})
                conn.execute(text(f'DROP DATABASE IF EXISTS "{NAME}"'))
            elif action == "migrate":
                from alembic import command
                from alembic.config import Config
                api_dir = Path(__file__).resolve().parents[3] / "services" / "api"
                cfg = Config(str(api_dir / "alembic.ini"))
                cfg.set_main_option("sqlalchemy.url", url.render_as_string(hide_password=False).replace("%", "%%"))
                command.upgrade(cfg, "head")
            else:
                raise RuntimeError("Unknown action")
    finally:
        admin.dispose()


if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in ("create", "migrate", "drop"):
        raise SystemExit("Expected create, migrate or drop")
    main(sys.argv[1])
