from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings


class Base(DeclarativeBase):
    pass


def session_timeout_statements(statement_ms: int, lock_ms: int, idle_in_transaction_ms: int) -> str:
    return (f"SET statement_timeout = {int(statement_ms)}; SET lock_timeout = {int(lock_ms)}; "
            f"SET idle_in_transaction_session_timeout = {int(idle_in_transaction_ms)}")


def apply_session_timeouts(dbapi_connection) -> None:
    """Fija los tiempos de espera de la sesión (no usa `options` de arranque: los poolers como PgBouncer/Neon pooled no lo admiten)."""
    previous = dbapi_connection.autocommit
    dbapi_connection.autocommit = True
    try:
        with dbapi_connection.cursor() as cursor:
            cursor.execute(session_timeout_statements(settings.DB_STATEMENT_TIMEOUT_MS, settings.DB_LOCK_TIMEOUT_MS,
                                                      settings.DB_IDLE_IN_TRANSACTION_TIMEOUT_MS))
    finally:
        dbapi_connection.autocommit = previous


engine = create_engine(settings.DATABASE_URL, hide_parameters=True, pool_pre_ping=True, pool_size=settings.DB_POOL_SIZE,
                       max_overflow=settings.DB_MAX_OVERFLOW, pool_timeout=settings.DB_POOL_TIMEOUT)
event.listen(engine, "connect", lambda dbapi_connection, _record: apply_session_timeouts(dbapi_connection))
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
