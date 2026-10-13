import pytest

from tests.db_safety import validate_test_database_url

APP = "postgresql+psycopg://user:password@localhost/energy_rd"


@pytest.mark.parametrize("name", ["energy_rd", "postgres", "template1", "energy_test_backup", 'unsafe"_test', "", "a" * 63 + "_test"])
def test_rejects_non_disposable_database_names(name):
    with pytest.raises(ValueError):
        validate_test_database_url(f"postgresql+psycopg://localhost/{name}", APP)


def test_rejects_application_database_even_if_named_test():
    with pytest.raises(ValueError, match="differ"):
        validate_test_database_url("postgresql://other-host/energy_rd_test", "postgresql://localhost/energy_rd_test")


def test_rejects_other_database_backends():
    with pytest.raises(ValueError, match="PostgreSQL"):
        validate_test_database_url("sqlite:///energy_rd_test", APP)


def test_accepts_dedicated_database():
    assert validate_test_database_url("postgresql+psycopg://localhost/energy_rd_test", APP).database == "energy_rd_test"
