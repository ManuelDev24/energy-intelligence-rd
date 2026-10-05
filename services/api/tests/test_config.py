import secrets

import pytest
from pydantic import ValidationError

from app.config import DEFAULT_DATABASE_URL, Settings


def config(**overrides):
    # Supply every operational field so local .env/process values cannot change tests.
    values = dict(DATABASE_URL=DEFAULT_DATABASE_URL, ENVIRONMENT="development",
                  SEED_PILOT=False, MIGRATE_ON_START=False, CORS_ORIGINS="http://localhost:3000")
    return Settings(_env_file=None, **(values | overrides))


def test_development_allows_explicit_demo_seed():
    assert config(SEED_PILOT=True).SEED_PILOT


@pytest.mark.parametrize("environment", ["staging", "production"])
def test_auth_disabled_is_rejected_in_deployment(environment):
    with pytest.raises(ValidationError, match="AUTH_ENABLED"):
        config(**(PRODUCTION | {"ENVIRONMENT": environment, "AUTH_ENABLED": False}))


@pytest.mark.parametrize("key", ["", "short", "x"*64, "change_me_local_only_"*4])
def test_enabled_auth_rejects_missing_weak_key(key):
    with pytest.raises(ValidationError, match="AUTH_SIGNING_KEY"):
        config(AUTH_ENABLED=True, AUTH_SIGNING_KEY=key)


@pytest.mark.parametrize("field,value", [("AUTH_ACCESS_TTL_SECONDS",901),("AUTH_ACCESS_TTL_SECONDS",0),
                                        ("AUTH_REFRESH_TTL_DAYS",0),("AUTH_REFRESH_TTL_DAYS",91)])
def test_bounded_auth_ttls(field,value):
    with pytest.raises(ValidationError):
        config(**{field:value})


def test_wildcard_cors_is_rejected():
    with pytest.raises(ValidationError, match="explicit origins"):
        config(CORS_ORIGINS="*")


@pytest.mark.parametrize("environment", ["production", "staging"])
def test_deployment_rejects_local_database_defaults(environment):
    with pytest.raises(ValidationError, match="database credentials"):
        config(ENVIRONMENT=environment)


PRODUCTION = dict(ENVIRONMENT="production", DATABASE_URL="postgresql+psycopg://energy:private@db.internal/energy_rd",
                  CORS_ORIGINS="https://energy.example", AUTH_ENABLED=True, AUTH_SIGNING_KEY=secrets.token_urlsafe(48))


def test_explicit_production_configuration_is_accepted():
    assert config(**PRODUCTION).SEED_PILOT is False


def test_production_rejects_demo_seed_without_exposing_password():
    with pytest.raises(ValidationError, match="Demo seed") as exc:
        config(**PRODUCTION, SEED_PILOT=True)
    assert "private" not in str(exc.value)


def test_production_rejects_migrations_on_each_replica():
    with pytest.raises(ValidationError, match="single release step"):
        config(**PRODUCTION, MIGRATE_ON_START=True)


@pytest.mark.parametrize("origins", ["", "http://energy.example", "https://"])
def test_production_rejects_missing_or_non_https_origins(origins):
    with pytest.raises(ValidationError, match="HTTPS"):
        config(**(PRODUCTION | {"CORS_ORIGINS": origins}))
