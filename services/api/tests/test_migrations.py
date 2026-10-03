from sqlalchemy import inspect, text
from alembic import command


def _tables(engine):
    return set(inspect(engine).get_table_names())


def test_connection(engine):
    with engine.connect() as c:
        assert c.execute(text("SELECT 1")).scalar() == 1


def test_upgrade_downgrade_upgrade(engine, alembic_cfg):
    with engine.begin() as c:
        c.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"))

    command.upgrade(alembic_cfg, "head")
    assert {"homes", "bills", "alerts"} <= _tables(engine)
    assert "code" in {c["name"] for c in inspect(engine).get_columns("homes")}

    # downgrade -1 revierte solo la última migración (0002): tablas siguen, columnas nuevas no.
    command.downgrade(alembic_cfg, "-1")
    assert {"homes", "bills", "alerts"} <= _tables(engine)
    assert "code" not in {c["name"] for c in inspect(engine).get_columns("homes")}

    command.upgrade(alembic_cfg, "head")
    assert "code" in {c["name"] for c in inspect(engine).get_columns("homes")}


def test_full_downgrade_to_base_and_back(engine, alembic_cfg):
    with engine.begin() as c:
        c.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"))
    command.upgrade(alembic_cfg, "head")
    command.downgrade(alembic_cfg, "base")
    assert not ({"homes", "bills", "alerts"} & _tables(engine))
    command.upgrade(alembic_cfg, "head")
    assert {"homes", "bills", "alerts"} <= _tables(engine)


def test_models_match_migration(migrated):
    from alembic.autogenerate import compare_metadata
    from alembic.migration import MigrationContext

    from app.database import Base
    import app.models  # noqa: F401

    with migrated.connect() as c:
        diff = compare_metadata(MigrationContext.configure(c), Base.metadata)
    assert diff == []
