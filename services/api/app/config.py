from functools import lru_cache
from typing import Self
from urllib.parse import urlsplit

from pydantic import model_validator, Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url

# Solo para desarrollo local; coincide con los defaults de docker-compose.yml.
DEFAULT_DATABASE_URL = "postgresql+psycopg://energy:change_me_local_only@localhost:5433/energy_rd"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../../.env"), case_sensitive=True, extra="ignore", hide_input_in_errors=True
    )

    PROJECT_NAME: str = "Energy RD API"
    VERSION: str = "0.1.0"
    DATABASE_URL: str = DEFAULT_DATABASE_URL
    ENVIRONMENT: str = "development"
    AUTH_ENABLED: bool = False
    AUTH_SIGNING_KEY: str = Field(default="", repr=False)
    AUTH_ACCESS_TTL_SECONDS: int = Field(default=900, ge=60, le=900)
    AUTH_REFRESH_TTL_DAYS: int = Field(default=30, ge=1, le=90)
    AUTH_REGISTER_LIMIT: int = Field(default=10, ge=1, le=10000)
    AUTH_REFRESH_LIMIT: int = Field(default=60, ge=1, le=10000)
    AUTH_LOGIN_LIMIT: int = Field(default=20, ge=1, le=10000)
    AUTH_ABUSE_WINDOW_SECONDS: int = Field(default=60, ge=1, le=86400)
    AUTH_ISSUER: str = "energy-rd-api"
    AUTH_AUDIENCE: str = "energy-rd-clients"
    SEED_PILOT: bool = False
    MIGRATE_ON_START: bool = False
    DB_POOL_SIZE: int = Field(default=5, ge=1, le=100)
    DB_MAX_OVERFLOW: int = Field(default=5, ge=0, le=100)
    DB_POOL_TIMEOUT: int = Field(default=10, gt=0, le=120)
    # Orígenes permitidos por CORS, separados por coma. Nunca "*" con credenciales.
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:8081,http://localhost:19006"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @model_validator(mode="after")
    def validate_environment(self) -> Self:
        if "*" in self.cors_origins_list:
            raise ValueError("CORS must list explicit origins")
        if self.ENVIRONMENT.lower() in {"production", "staging"}:
            url = make_url(self.DATABASE_URL)
            if (self.DATABASE_URL == DEFAULT_DATABASE_URL or not url.host
                    or url.host in {"localhost", "127.0.0.1", "::1"}
                    or not url.password or url.password == "change_me_local_only"):
                raise ValueError("Production/staging requires explicit non-local database credentials")
            if self.SEED_PILOT:
                raise ValueError("Demo seed is disabled in production/staging")
            if self.MIGRATE_ON_START:
                raise ValueError("Production/staging migrations must run as a single release step")
            if not self.cors_origins_list or any(
                urlsplit(origin).scheme != "https" or not urlsplit(origin).hostname
                for origin in self.cors_origins_list
            ):
                raise ValueError("Production/staging requires explicit HTTPS CORS origins")
        if not self.AUTH_ENABLED and self.ENVIRONMENT.lower() != "development":
            raise ValueError("AUTH_ENABLED is required outside development")
        if self.AUTH_ENABLED and (len(self.AUTH_SIGNING_KEY) < 43
                or len(set(self.AUTH_SIGNING_KEY)) < 16
                or any(s in self.AUTH_SIGNING_KEY.lower() for s in ("change_me", "changeme", "secret", "password"))):
            raise ValueError("AUTH_SIGNING_KEY requires a securely generated random key (at least 32 bytes)")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()

settings = get_settings()
