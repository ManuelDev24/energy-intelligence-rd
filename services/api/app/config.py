import os
from functools import lru_cache
from typing import Literal, Self
from urllib.parse import urlsplit

from pydantic import model_validator, Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url

# Solo para desarrollo local; coincide con los defaults de docker-compose.yml.
DEFAULT_DATABASE_URL = "postgresql+psycopg://energy:change_me_local_only@localhost:5433/energy_rd"
ENVIRONMENTS = {"development", "staging", "production"}
LOCAL_DATABASE_HOSTS = {"localhost", "127.0.0.1", "::1"}
# Variables que fijan las plataformas de despliegue habituales (Render, Heroku, Cloud Run, Fly, Vercel, Railway, ECS/Lambda, Kubernetes).
# Si alguna existe y ENVIRONMENT no se declaró, el arranque falla: nunca se asume «desarrollo» en una plataforma.
PLATFORM_ENV_VARS = ("RENDER", "RENDER_SERVICE_ID", "DYNO", "K_SERVICE", "FLY_APP_NAME", "VERCEL", "RAILWAY_ENVIRONMENT",
                     "AWS_EXECUTION_ENV", "ECS_CONTAINER_METADATA_URI", "KUBERNETES_SERVICE_HOST")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../../.env"), case_sensitive=True, extra="ignore", hide_input_in_errors=True
    )

    PROJECT_NAME: str = "Energy RD API"
    VERSION: str = "0.1.0"
    DATABASE_URL: str = DEFAULT_DATABASE_URL
    ENVIRONMENT: str = "development"
    # Auditoría C-03: la autenticación está ENCENDIDA por defecto (falla cerrado). El modo piloto local sin cuentas exige
    # `AUTH_ENABLED=false` de forma explícita y solo se admite con ENVIRONMENT=development.
    AUTH_ENABLED: bool = True
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
    # ERD-DB-DOCUMENTS: originales de factura. Sin factura asociada caducan (propuesta, pendiente de aprobación legal).
    DOCUMENT_UNCONFIRMED_RETENTION_DAYS: int = Field(default=7, ge=1, le=90)
    DOCUMENT_MAX_PHOTO_BYTES: int = Field(default=10 * 1024 * 1024, ge=1024, le=50 * 1024 * 1024)
    DOCUMENT_MAX_PDF_BYTES: int = Field(default=20 * 1024 * 1024, ge=1024, le=50 * 1024 * 1024)
    DOCUMENT_MAX_UNCONFIRMED_PER_HOME: int = Field(default=20, ge=1, le=200)
    # ERD-STORE-01: almacenamiento privado de originales (ver STORAGE.md). 'disabled' = las rutas responden 503.
    STORAGE_BACKEND: Literal["disabled", "local", "s3"] = "disabled"
    STORAGE_LOCAL_DIR: str = ""  # solo desarrollo/pruebas
    STORAGE_S3_BUCKET: str = ""
    STORAGE_S3_PREFIX: str = ""
    STORAGE_S3_ENDPOINT_URL: str = ""  # vacío = AWS; para Cloudflare R2 la URL de la cuenta
    STORAGE_S3_REGION: str = "auto"
    STORAGE_S3_ACCESS_KEY_ID: str = Field(default="", repr=False)
    STORAGE_S3_SECRET_ACCESS_KEY: str = Field(default="", repr=False)
    # "id:clave,id2:clave2" (base64url de 32 bytes); la primera cifra, todas descifran. Ver STORAGE.md para rotar.
    STORAGE_ENCRYPTION_KEYS: str = Field(default="", repr=False)
    STORAGE_URL_SIGNING_KEY: str = Field(default="", repr=False)
    STORAGE_URL_TTL_SECONDS: int = Field(default=60, ge=10, le=300)
    # ERD-WORKER-01: cola de trabajos en PostgreSQL (ver docs/ops/JOBS.md).
    WORKER_POLL_SECONDS: float = Field(default=2.0, ge=0.2, le=60)
    JOB_DEFAULT_MAX_ATTEMPTS: int = Field(default=5, ge=1, le=20)
    JOB_BACKOFF_BASE_SECONDS: int = Field(default=30, ge=1, le=3600)
    JOB_BACKOFF_CAP_SECONDS: int = Field(default=3600, ge=1, le=86400)
    JOB_SUCCEEDED_RETENTION_DAYS: int = Field(default=7, ge=1, le=365)
    JOB_DEAD_RETENTION_DAYS: int = Field(default=90, ge=1, le=730)
    # Auditoría C-15 (DB-05): plazos de retención (propuestos; deben coincidir con el aviso de privacidad aprobado). Los aplica el trabajo
    # diario `maintenance.retention` (app/services/retention.py).
    RETENTION_SESSION_DAYS: int = Field(default=30, ge=1, le=365)          # sesiones vencidas o revocadas (y sus refresh tokens)
    RETENTION_ABUSE_BUCKET_DAYS: int = Field(default=7, ge=1, le=90)       # contadores anti-abuso (HMAC de IP/correo)
    RETENTION_INVITATION_DAYS: int = Field(default=90, ge=1, le=730)       # invitaciones aceptadas, revocadas o vencidas (correo de un tercero)
    RETENTION_NOTIFICATION_DAYS: int = Field(default=365, ge=30, le=1825)  # registro de avisos enviados
    RETENTION_DISMISSED_ALERT_DAYS: int = Field(default=365, ge=30, le=1825)
    RETENTION_AUDIT_DAYS: int = Field(default=730, ge=90, le=3650)         # historial de cambios
    # ERD-OCR-PROD: OCR asíncrono de originales (imágenes y PDF).
    OCR_MAX_PDF_PAGES: int = Field(default=6, ge=1, le=20)
    OCR_PAGE_TIMEOUT_SECONDS: int = Field(default=40, ge=5, le=120)
    OCR_MAX_ACTIVE_PER_HOME: int = Field(default=3, ge=1, le=20)
    # ERD-ANOM-01-COMPLETE: umbrales del motor de anomalías (ver ANOMALIES.md). Valores de partida sin calibrar con datos reales.
    ANOMALY_INCREASE_WARNING_PCT: int = Field(default=50, ge=5, le=1000)
    ANOMALY_INCREASE_CRITICAL_PCT: int = Field(default=100, ge=5, le=1000)
    ANOMALY_DROP_INFO_PCT: int = Field(default=40, ge=5, le=95)
    ANOMALY_DROP_WARNING_PCT: int = Field(default=70, ge=5, le=95)
    ANOMALY_PEAK_WARNING_PCT: int = Field(default=100, ge=10, le=1000)
    ANOMALY_PEAK_CRITICAL_PCT: int = Field(default=200, ge=10, le=2000)
    ANOMALY_PEAK_MIN_EXTRA_KWH: float = Field(default=3.0, ge=0, le=100)
    ANOMALY_MIN_HISTORY: int = Field(default=3, ge=2, le=12)
    ANOMALY_MIN_BASELINE_KWH_PER_DAY: float = Field(default=0.5, ge=0, le=100)
    ANOMALY_MIN_COVERAGE: float = Field(default=0.5, gt=0, le=1)
    ANOMALY_NIGHT_START_HOUR: int = Field(default=23, ge=18, le=23)
    ANOMALY_NIGHT_END_HOUR: int = Field(default=5, ge=1, le=9)
    ANOMALY_NIGHT_SHARE: float = Field(default=0.6, gt=0, le=2)
    ANOMALY_NIGHT_MIN_HOURS: float = Field(default=2.0, ge=0.5, le=8)
    ANOMALY_NIGHT_MIN_KWH_PER_HOUR: float = Field(default=0.15, ge=0, le=10)
    ANOMALY_HORIZON_DAYS: int = Field(default=60, ge=14, le=366)
    ANOMALY_HORIZON_MONTHS: int = Field(default=12, ge=3, le=36)
    # ERD-ALERT-02: avisos. El push usa el servicio de Expo (el token de acceso es opcional); topes para no saturar a nadie.
    EXPO_ACCESS_TOKEN: str = Field(default="", repr=False)
    NOTIFY_DAILY_CAP: int = Field(default=10, ge=1, le=100)
    MAX_DEVICES_PER_USER: int = Field(default=10, ge=1, le=50)
    EMAIL_BACKEND: Literal["console", "resend"] = "console"
    RESEND_API_KEY: str = Field(default="", repr=False)
    EMAIL_FROM: str = ""
    # Solo desarrollo: ruta opcional donde el backend console agrega los mensajes (JSON por línea).
    EMAIL_DEV_OUTBOX: str = ""
    AUTH_ISSUER: str = "energy-rd-api"
    AUTH_AUDIENCE: str = "energy-rd-clients"
    SEED_PILOT: bool = False
    MIGRATE_ON_START: bool = False
    # Auditoría C-01: con la RLS (migración 0025) el API debe conectarse como `erd_app` y el worker como `erd_worker` (roles sin privilegios
    # especiales). Si esta bandera está activa, el arranque falla cuando el rol de la conexión es superusuario, ignora la RLS o es dueño de las
    # tablas. Obligatoria en staging/production. `MIGRATION_DATABASE_URL` (rol dueño) solo la usan las migraciones (Alembic).
    DB_REQUIRE_RESTRICTED_ROLE: bool = False
    MIGRATION_DATABASE_URL: str = Field(default="", repr=False)
    DB_POOL_SIZE: int = Field(default=5, ge=1, le=100)
    DB_MAX_OVERFLOW: int = Field(default=5, ge=0, le=100)
    DB_POOL_TIMEOUT: int = Field(default=10, gt=0, le=120)
    # Auditoría C-08: tiempos de espera de la base (ms; 0 = sin límite). Sin ellos una consulta lenta o un FOR UPDATE colgado retiene
    # una de las pocas conexiones del pool sin límite y todas las peticiones se acumulan detrás. No aplican a las migraciones (Alembic).
    DB_STATEMENT_TIMEOUT_MS: int = Field(default=30_000, ge=0, le=600_000)
    DB_LOCK_TIMEOUT_MS: int = Field(default=5_000, ge=0, le=120_000)
    DB_IDLE_IN_TRANSACTION_TIMEOUT_MS: int = Field(default=60_000, ge=0, le=600_000)
    # Auditoría C-08: tope del cuerpo de cada petición (antes se leía completo sin límite, incluso sin autenticar). Las dos rutas de
    # subida de facturas admiten el archivo más grande permitido más el sobre multipart; el resto solo JSON pequeño.
    MAX_REQUEST_BODY_BYTES: int = Field(default=256 * 1024, ge=4096, le=10 * 1024 * 1024)
    UPLOAD_BODY_OVERHEAD_BYTES: int = Field(default=256 * 1024, ge=4096, le=4 * 1024 * 1024)
    # Auditoría C-08: Argon2 usa 64 MiB y 4 hilos por cálculo; sin tope, unas pocas decenas de logins simultáneos agotan memoria y CPU.
    AUTH_HASH_CONCURRENCY: int = Field(default=4, ge=1, le=32)
    AUTH_HASH_WAIT_SECONDS: float = Field(default=5.0, gt=0, le=60)
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

    # Auditoría C-10: verificación de correo. El enlace lleva el token en el fragmento (#token=), como la recuperación.
    # Vacío = misma web que PASSWORD_RESET_URL, ruta /verificar-correo.
    EMAIL_VERIFICATION_URL: str = ""
    EMAIL_VERIFICATION_TTL_HOURS: int = Field(default=48, ge=1, le=168)
    EMAIL_VERIFICATION_ACCOUNT_LIMIT: int = Field(default=3, ge=1, le=20)  # envíos por cuenta y hora
    # ERD-SHARE-01: invitaciones a una vivienda (el token viaja en el fragmento #token=, como el de recuperación).
    # Vacío = misma web que PASSWORD_RESET_URL, ruta /invitacion (no añade una variable obligatoria al despliegue).
    INVITATION_URL: str = ""
    INVITATION_TTL_DAYS: int = Field(default=7, ge=1, le=30)
    INVITATION_MAX_PENDING_PER_HOME: int = Field(default=10, ge=1, le=50)
    INVITATION_DAILY_LIMIT_PER_USER: int = Field(default=20, ge=1, le=200)
    # ERD-OBS-01: Sentry es opcional; sin DSN no se envía nada. El DSN no es secreto fuerte pero no se imprime.
    SENTRY_DSN: str = Field(default="", repr=False)
    SENTRY_TRACES_SAMPLE_RATE: float = Field(default=0.05, ge=0.0, le=1.0)

    @property
    def max_upload_request_bytes(self) -> int:
        return max(self.DOCUMENT_MAX_PDF_BYTES, self.DOCUMENT_MAX_PHOTO_BYTES) + self.UPLOAD_BODY_OVERHEAD_BYTES

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @model_validator(mode="after")
    def validate_environment(self) -> Self:
        if self.ENVIRONMENT.lower() not in ENVIRONMENTS:
            raise ValueError("ENVIRONMENT must be one of: development, staging, production")
        if "ENVIRONMENT" not in self.model_fields_set:
            database_host = make_url(self.DATABASE_URL).host
            if any(os.environ.get(name) for name in PLATFORM_ENV_VARS) or (database_host and database_host not in LOCAL_DATABASE_HOSTS):
                raise ValueError("ENVIRONMENT must be set explicitly (development, staging or production) on a deployment platform "
                                 "or with a non-local database; it is never assumed to be development")
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
            if not self.DB_REQUIRE_RESTRICTED_ROLE:
                raise ValueError("Production/staging requires DB_REQUIRE_RESTRICTED_ROLE=true (API as erd_app, worker as erd_worker; see docs/ops/DB_ROLES.md)")
            if self.MIGRATION_DATABASE_URL:
                migration = make_url(self.MIGRATION_DATABASE_URL)
                if not migration.host or migration.host in LOCAL_DATABASE_HOSTS or not migration.password or migration.password == "change_me_local_only":
                    raise ValueError("MIGRATION_DATABASE_URL must be an explicit non-local URL with a password")
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
        if self.SENTRY_DSN and (urlsplit(self.SENTRY_DSN).scheme != "https" or not urlsplit(self.SENTRY_DSN).hostname):
            raise ValueError("SENTRY_DSN must be an HTTPS DSN")
        self._validate_storage()
        reset_url = urlsplit(self.PASSWORD_RESET_URL)
        if reset_url.query or reset_url.fragment or "#" in self.PASSWORD_RESET_URL or "?" in self.PASSWORD_RESET_URL:
            raise ValueError("PASSWORD_RESET_URL must not contain query or fragment; the token is appended as #token=")
        if not self.INVITATION_URL:
            reset = urlsplit(self.PASSWORD_RESET_URL)
            self.INVITATION_URL = f"{reset.scheme}://{reset.netloc}/invitacion"
        if not self.EMAIL_VERIFICATION_URL:
            reset = urlsplit(self.PASSWORD_RESET_URL)
            self.EMAIL_VERIFICATION_URL = f"{reset.scheme}://{reset.netloc}/verificar-correo"
        verification_url = urlsplit(self.EMAIL_VERIFICATION_URL)
        if (verification_url.query or verification_url.fragment or "#" in self.EMAIL_VERIFICATION_URL
                or "?" in self.EMAIL_VERIFICATION_URL or not verification_url.hostname
                or (self.ENVIRONMENT.lower() != "development" and verification_url.scheme != "https")):
            raise ValueError("EMAIL_VERIFICATION_URL must be an HTTPS URL (outside development) without query or fragment")
        invitation_url = urlsplit(self.INVITATION_URL)
        if (invitation_url.query or invitation_url.fragment or "#" in self.INVITATION_URL or "?" in self.INVITATION_URL
                or not invitation_url.hostname):
            raise ValueError("INVITATION_URL must not contain query or fragment; the token is appended as #token=")
        if self.ENVIRONMENT.lower() != "development" and invitation_url.scheme != "https":
            raise ValueError("Non-development environments require an HTTPS INVITATION_URL")
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
            raise ValueError("AUTH_SIGNING_KEY requires a securely generated random key (at least 32 bytes); "
                             "AUTH_ENABLED=false (local pilot mode, development only) is the only way to run without one")
        return self


    def _validate_storage(self) -> None:
        if self.STORAGE_BACKEND == "disabled":
            return
        from app.services.storage.crypto import Keyring
        Keyring.parse(self.STORAGE_ENCRYPTION_KEYS)
        if len(self.STORAGE_URL_SIGNING_KEY) < 43 or len(set(self.STORAGE_URL_SIGNING_KEY)) < 16 or any(
                s in self.STORAGE_URL_SIGNING_KEY.lower() for s in ("change_me", "changeme", "secret", "password")):
            raise ValueError("STORAGE_URL_SIGNING_KEY requires a securely generated random key (at least 32 bytes)")
        if self.STORAGE_BACKEND == "local":
            if not self.STORAGE_LOCAL_DIR:
                raise ValueError("STORAGE_BACKEND=local requires STORAGE_LOCAL_DIR")
            if self.ENVIRONMENT.lower() in {"production", "staging"}:
                raise ValueError("Production/staging cannot use local file storage for documents")
        if self.STORAGE_BACKEND == "s3" and not (
                self.STORAGE_S3_BUCKET and self.STORAGE_S3_ACCESS_KEY_ID and self.STORAGE_S3_SECRET_ACCESS_KEY):
            raise ValueError("STORAGE_BACKEND=s3 requires bucket and access credentials")


@lru_cache
def get_settings() -> Settings:
    return Settings()

settings = get_settings()
