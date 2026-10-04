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
    assert {"homes", "bills", "alerts", "equipment", "alert_settings"} <= _tables(engine)

    # downgrade -1 revierte solo la última migración (0003): equipos/umbrales desaparecen.
    command.downgrade(alembic_cfg, "-1")
    assert {"homes", "bills", "alerts"} <= _tables(engine)
    assert not ({"equipment", "alert_settings"} & _tables(engine))
    assert "basis_bill_id" not in {c["name"] for c in inspect(engine).get_columns("alerts")}

    command.upgrade(alembic_cfg, "head")
    assert {"equipment", "alert_settings"} <= _tables(engine)


def test_0003_migrates_alert_statuses_both_ways(engine, alembic_cfg):
    with engine.begin() as c:
        c.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"))
    command.upgrade(alembic_cfg, "0002")
    with engine.begin() as c:
        hid = c.execute(text("INSERT INTO homes (id, name, distributor) VALUES (gen_random_uuid(), 'x', 'EDESUR') "
                             "RETURNING id")).scalar()
        for st in ("open", "acknowledged", "resolved"):
            c.execute(text("INSERT INTO alerts (id, home_id, type, message, status) "
                           "VALUES (gen_random_uuid(), :h, 't', 'm', :s)"), {"h": hid, "s": st})
    command.upgrade(alembic_cfg, "head")
    with engine.connect() as c:
        assert sorted(c.execute(text("SELECT status FROM alerts")).scalars()) == ["dismissed", "read", "unread"]
        assert set(c.execute(text("SELECT severity FROM alerts")).scalars()) == {"warning"}
    command.downgrade(alembic_cfg, "0002")
    with engine.connect() as c:
        assert sorted(c.execute(text("SELECT status FROM alerts")).scalars()) == ["acknowledged", "open", "resolved"]
    command.upgrade(alembic_cfg, "head")


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
