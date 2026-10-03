from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

# Solo para desarrollo local; coincide con los defaults de docker-compose.yml.
DEFAULT_DATABASE_URL = "postgresql+psycopg://energy:change_me_local_only@localhost:5433/energy_rd"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../../.env"), case_sensitive=True, extra="ignore"
    )

    PROJECT_NAME: str = "Energy RD API"
    VERSION: str = "0.1.0"
    DATABASE_URL: str = DEFAULT_DATABASE_URL
    ENVIRONMENT: str = "development"


@lru_cache
def get_settings() -> Settings:
    return Settings()

settings = get_settings()
