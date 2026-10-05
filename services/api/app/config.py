from functools import lru_cache
from typing import Literal, Self
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
    # ERD-AUTH-05: recuperación de contraseña (ver PASSWORD_RECOVERY.md).
    AUTH_FORGOT_LIMIT: int = Field(default=5, ge=1, le=10000)
    AUTH_RESET_LIMIT: int = Field(default=10, ge=1, le=10000)
    PASSWORD_RESET_TTL_MINUTES: int = Field(default=30, ge=5, le=60)
    PASSWORD_RESET_ACCOUNT_LIMIT: int = Field(default=3, ge=1, le=20)
    PASSWORD_RESET_ACCOUNT_WINDOW_SECONDS: int = Field(default=3600, ge=60, le=86400)
    # Página web que lee el token del FRAGMENTO (#token=...); nunca query string.
    PASSWORD_RESET_URL: str = "http://localhost:3000/restablecer-contrasena"
    EMAIL_BACKEND: Literal["console", "resend"] = "console"
    RESEND_API_KEY: str = Field(default="", repr=False)
    EMAIL_FROM: str = ""
    # Solo desarrollo: ruta opcional donde el backend console agrega los mensajes (JSON por línea).
    EMAIL_DEV_OUTBOX: str = ""
    AUTH_ISSUER: str = "energy-rd-api"
    AUTH_AUDIENCE: str = "energy-rd-clients"
    SEED_PILOT: bool = False
    MIGRATE_ON_START: bool = False
    DB_POOL_SIZE: int = Field(default=5, ge=1, le=100)
    DB_MAX_OVERFLOW: int = Field(default=5, ge=0, le=100)
    DB_POOL_TIMEOUT: int = Field(default=10, gt=0, le=120)
    # Orígenes permitidos por CORS, separados por coma. Nunca "*" con credenciales.
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:8081,http://localhost:19006"
    # ERD-SEC-PROXY-01: uvicorn corre con --no-proxy-headers a propósito (Render solo
    # AGREGA a un X-Forwarded-For suministrado por el cliente, por lo que es falsificable).
    # 'cf-connecting-ip' solo es seguro porque esta topología garantiza que Cloudflare está
    # directamente delante de Render y Cloudflare sobrescribe ese header en su borde; nunca
    # generalizar esta confianza a otra topología sin volver a verificarlo.
    CLIENT_IP_SOURCE: Literal["socket", "cf-connecting-ip"] = "socket"
    # Secreto compartido BFF<->API para firmar X-Forwarded-Client-Ip (la IP real del
    # navegador, distinta de la IP del propio BFF en la conexión servidor-a-servidor).
    BFF_API_SHARED_SECRET: str = Field(default="", repr=False)

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
            if self.CLIENT_IP_SOURCE == "cf-connecting-ip" and (
                len(self.BFF_API_SHARED_SECRET) < 43
                or len(set(self.BFF_API_SHARED_SECRET)) < 16
                or any(s in self.BFF_API_SHARED_SECRET.lower() for s in ("change_me", "changeme", "secret", "password"))
            ):
                raise ValueError(
                    "BFF_API_SHARED_SECRET requires a securely generated random key (at least 32 bytes) "
                    "when CLIENT_IP_SOURCE is cf-connecting-ip"
                )
        reset_url = urlsplit(self.PASSWORD_RESET_URL)
        if reset_url.query or reset_url.fragment or "#" in self.PASSWORD_RESET_URL or "?" in self.PASSWORD_RESET_URL:
            raise ValueError("PASSWORD_RESET_URL must not contain query or fragment; the token is appended as #token=")
        if self.ENVIRONMENT.lower() != "development":
            if self.EMAIL_BACKEND != "resend" or not self.RESEND_API_KEY.strip() or not self.EMAIL_FROM.strip():
                raise ValueError("Non-development environments require EMAIL_BACKEND=resend with RESEND_API_KEY and EMAIL_FROM")
            if reset_url.scheme != "https" or not reset_url.hostname:
                raise ValueError("Non-development environments require an HTTPS PASSWORD_RESET_URL")
            if self.EMAIL_DEV_OUTBOX:
                raise ValueError("EMAIL_DEV_OUTBOX is development-only")
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
