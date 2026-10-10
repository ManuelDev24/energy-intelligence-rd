from sqlalchemy import inspect, text
from sqlalchemy.exc import DataError
from alembic import command
from alembic.script import ScriptDirectory
import pytest


def _tables(engine):
    return set(inspect(engine).get_table_names())


def test_0006_auth_upgrade_downgrade_preserves_unowned_pilot(migrated, alembic_cfg):
    with migrated.begin() as c:
        hid = c.execute(text("INSERT INTO homes(id,name,distributor) VALUES(gen_random_uuid(), 'pilot', 'EDESUR') RETURNING id")).scalar_one()
        assert c.execute(text("SELECT count(*) FROM home_members")).scalar() == 0
    assert {"users", "home_members", "auth_sessions", "refresh_tokens"} <= _tables(migrated)
    command.downgrade(alembic_cfg, "0005")
    assert not ({"users", "home_members", "auth_sessions", "refresh_tokens"} & _tables(migrated))
    command.upgrade(alembic_cfg, "head")
    with migrated.connect() as c:
        assert c.execute(text("SELECT id FROM homes")).scalar_one() == hid
        assert c.execute(text("SELECT count(*) FROM home_members")).scalar() == 0


def test_connection(engine):
    with engine.connect() as c:
        assert c.execute(text("SELECT 1")).scalar() == 1


def test_upgrade_downgrade_upgrade(engine, alembic_cfg):
    with engine.begin() as c:
        c.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"))

    command.upgrade(alembic_cfg, "head")
    assert {"homes", "bills", "alerts", "equipment", "alert_settings"} <= _tables(engine)

    # Revert insights explicitly; head may include later migrations.
    command.downgrade(alembic_cfg, "0002")
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


def test_percentage_precision_upgrade_preserves_existing_values(engine, alembic_cfg):
    with engine.begin() as c:
        c.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"))
    command.upgrade(alembic_cfg, "0003")
    with engine.begin() as c:
        hid = c.execute(text("INSERT INTO homes (id, name, distributor) "
                             "VALUES (gen_random_uuid(), 'precision test', 'EDESUR') RETURNING id")).scalar()
        c.execute(text("INSERT INTO alerts (id, home_id, type, severity, message, kwh_pct) "
                       "VALUES (gen_random_uuid(), :h, 'bill_variation', 'critical', 'x', 999999.99)"), {"h": hid})
    command.upgrade(alembic_cfg, "head")
    columns = {c["name"]: c for c in inspect(engine).get_columns("alerts")}
    assert columns["kwh_pct"]["type"].precision == 18
    with engine.connect() as c:
        assert str(c.execute(text("SELECT kwh_pct FROM alerts")).scalar()) == "999999.99"
    command.downgrade(alembic_cfg, "0003")
    assert {c["name"]: c for c in inspect(engine).get_columns("alerts")}["kwh_pct"]["type"].precision == 8
    command.upgrade(alembic_cfg, "head")


def test_percentage_downgrade_refuses_loss_of_extreme_values(migrated, alembic_cfg):
    with migrated.begin() as c:
        hid = c.execute(text("INSERT INTO homes (id, name, distributor) "
                             "VALUES (gen_random_uuid(), 'extreme test', 'EDESUR') RETURNING id")).scalar()
        c.execute(text("INSERT INTO alerts (id, home_id, type, severity, message, kwh_pct) "
                       "VALUES (gen_random_uuid(), :h, 'bill_variation', 'critical', 'x', 99999999999800.00)"), {"h": hid})
    with pytest.raises(DataError):
        command.downgrade(alembic_cfg, "0003")
    with migrated.connect() as c:
        assert str(c.execute(text("SELECT kwh_pct FROM alerts")).scalar()) == "99999999999800.00"
        # El downgrade fallido es transaccional: la base debe seguir en la revisión cabeza actual.
        assert c.execute(text("SELECT version_num FROM alembic_version")).scalar() == \
            ScriptDirectory.from_config(alembic_cfg).get_current_head()


PHASE2_TABLES = {"meter_readings", "home_goals", "tariffs", "tariff_fixed_charges", "tariff_blocks"}
OFFICIAL = ("SIE-121-2026-TF",)


def _tariff(c, code="TEST", start="2026-01-01", end="2026-06-30", dist="EDESUR"):
    return c.execute(text("INSERT INTO tariffs(id,distributor,tariff_code,effective_from,effective_to,source_resolution) "
                          "VALUES(gen_random_uuid(),:d,:c,:s,:e,'fixture sintética') RETURNING id"),
                     {"d": dist, "c": code, "s": start, "e": end}).scalar_one()


def test_0007_phase2_upgrade_downgrade_keeps_pilot_data(migrated, alembic_cfg):
    assert PHASE2_TABLES <= _tables(migrated)
    with migrated.begin() as c:
        hid = c.execute(text("INSERT INTO homes(id,name,distributor) VALUES(gen_random_uuid(),'p2','EDESUR') RETURNING id")).scalar_one()
        c.execute(text("INSERT INTO meter_readings(id,home_id,read_at,reading_kwh,source) "
                       "VALUES(gen_random_uuid(),:h,'2026-09-01T00:00:00-04:00',100,'manual')"), {"h": hid})
    command.downgrade(alembic_cfg, "0006")
    assert not (PHASE2_TABLES & _tables(migrated))
    command.upgrade(alembic_cfg, "head")
    with migrated.connect() as c:
        assert c.execute(text("SELECT id FROM homes")).scalar_one() == hid


def test_0008_loads_official_bts1_transition_tariffs_only(migrated):
    with migrated.connect() as c:
        rows = c.execute(text(
            "SELECT distributor, tariff_code, effective_from::text, effective_to::text, flat_all_units_from_kwh::text, "
            "source_resolution, source_url FROM tariffs ORDER BY distributor")).all()
        assert [r[0] for r in rows] == ["EDEESTE", "EDENORTE", "EDESUR"]
        assert {r[1:] for r in rows} == {("BTS-1", "2026-10-01", "2026-12-31", "701.00", "SIE-121-2026-TF",
                                          "https://sie.gob.do/document/sie-121-2026-tf/")}
        fixed = c.execute(text("SELECT t.distributor, f.from_kwh::text, f.to_kwh::text, f.amount_rd::text "
                               "FROM tariff_fixed_charges f JOIN tariffs t ON t.id=f.tariff_id "
                               "ORDER BY t.distributor, f.from_kwh")).all()
        assert fixed == [("EDEESTE", "0.00", "100.00", "41.34"), ("EDEESTE", "100.00", None, "127.83"),
                         ("EDENORTE", "0.00", "100.00", "40.33"), ("EDENORTE", "100.00", None, "126.81"),
                         ("EDESUR", "0.00", "100.00", "42.10"), ("EDESUR", "100.00", None, "128.59")]
        prices = c.execute(text("SELECT t.distributor, array_agg(b.price_rd_per_kwh::text ORDER BY b.from_kwh) "
                                "FROM tariff_blocks b JOIN tariffs t ON t.id=b.tariff_id GROUP BY t.distributor "
                                "ORDER BY t.distributor")).all()
        assert prices == [("EDEESTE", ["6.1700", "8.7100", "13.0400", "13.2600"]),
                          ("EDENORTE", ["5.9700", "8.5100", "13.8300", "14.0400"]),
                          ("EDESUR", ["6.0500", "8.5900", "12.8900", "13.0900"])]
        bounds = c.execute(text("SELECT DISTINCT b.from_kwh::text, b.to_kwh::text FROM tariff_blocks b "
                                "ORDER BY 1")).all()
        assert bounds == [("0.00", "200.00"), ("200.00", "300.00"), ("300.00", "700.00"), ("700.00", None)]
        # La columna de referencia (no facturable) no se carga.
        assert c.execute(text("SELECT count(*) FROM tariff_blocks WHERE price_rd_per_kwh IN (15.12,16.09,15.53)")).scalar() == 0


def test_0008_downgrade_deletes_only_official_rows(migrated, alembic_cfg):
    with migrated.begin() as c:
        mine = _tariff(c)
    command.downgrade(alembic_cfg, "0007")
    with migrated.connect() as c:
        assert c.execute(text("SELECT id FROM tariffs")).scalar_one() == mine
        assert c.execute(text("SELECT count(*) FROM tariff_blocks")).scalar() == 0
    command.upgrade(alembic_cfg, "head")
    with migrated.connect() as c:
        assert c.execute(text("SELECT count(*) FROM tariffs")).scalar() == 4


@pytest.mark.parametrize("sql", [
    # lectura negativa
    "INSERT INTO meter_readings(id,home_id,read_at,reading_kwh,source) VALUES(gen_random_uuid(),:h,now(),-1,'manual')",
    # origen desconocido
    "INSERT INTO meter_readings(id,home_id,read_at,reading_kwh,source) VALUES(gen_random_uuid(),:h,now(),1,'seed')",
    # meta sin ningún objetivo
    "INSERT INTO home_goals(home_id) VALUES(:h)",
    # meta no positiva
    "INSERT INTO home_goals(home_id,monthly_kwh) VALUES(:h,0)",
    # distribuidora sin tarifa regulada
    "INSERT INTO tariffs(id,distributor,tariff_code,effective_from,source_resolution) "
    "VALUES(gen_random_uuid(),'Otra','BTS1','2026-01-01','x')",
    # vigencia invertida
    "INSERT INTO tariffs(id,distributor,tariff_code,effective_from,effective_to,source_resolution) "
    "VALUES(gen_random_uuid(),'EDESUR','BTS1','2026-02-01','2026-01-01','x')",
    # umbral de cobro plano no positivo
    "INSERT INTO tariffs(id,distributor,tariff_code,effective_from,source_resolution,flat_all_units_from_kwh) "
    "VALUES(gen_random_uuid(),'EDESUR','X','2030-01-01','x',0)",
    # cargo fijo negativo
    "INSERT INTO tariff_fixed_charges(id,tariff_id,from_kwh,amount_rd) "
    "SELECT gen_random_uuid(),id,500,-1 FROM tariffs LIMIT 1",
])
def test_0007_constraints_reject_invalid_rows(migrated, sql):
    from sqlalchemy.exc import IntegrityError
    with migrated.begin() as c:
        hid = c.execute(text("INSERT INTO homes(id,name,distributor) VALUES(gen_random_uuid(),'c','EDESUR') RETURNING id")).scalar_one()
    with pytest.raises(IntegrityError):
        with migrated.begin() as c:
            c.execute(text(sql), {"h": hid})


def test_0007_unique_reading_time_and_overlapping_tariff_versions(migrated):
    from sqlalchemy.exc import IntegrityError
    with migrated.begin() as c:
        hid = c.execute(text("INSERT INTO homes(id,name,distributor) VALUES(gen_random_uuid(),'u','EDESUR') RETURNING id")).scalar_one()
        c.execute(text("INSERT INTO meter_readings(id,home_id,read_at,reading_kwh,source) "
                       "VALUES(gen_random_uuid(),:h,'2026-09-01T00:00:00Z',1,'manual')"), {"h": hid})
        _tariff(c)
    with pytest.raises(IntegrityError):
        with migrated.begin() as c:
            c.execute(text("INSERT INTO meter_readings(id,home_id,read_at,reading_kwh,source) "
                           "VALUES(gen_random_uuid(),:h,'2026-08-31T20:00:00-04:00',2,'manual')"), {"h": hid})
    with pytest.raises(IntegrityError):  # versión solapada del mismo código y distribuidora
        with migrated.begin() as c:
            _tariff(c, start="2026-06-01", end=None)
    with pytest.raises(IntegrityError):  # solapa con la BTS-1 oficial cargada en 0008
        with migrated.begin() as c:
            _tariff(c, code="BTS-1", start="2026-12-01", end="2027-03-31")
