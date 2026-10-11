from sqlalchemy import create_engine, event, text
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


def database_role_problem(connection) -> str | None:
    """Auditoría C-01: explica por qué el rol de esta conexión NO sirve para el API/worker (None si es un rol restringido).

    La RLS no se aplica a superusuarios, a roles con BYPASSRLS ni a quien es dueño de las tablas (sin FORCE)."""
    role, superuser, bypass, owns = connection.execute(text(
        "SELECT current_user, r.rolsuper, r.rolbypassrls, "
        "EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tableowner = current_user) "
        "FROM pg_roles r WHERE r.rolname = current_user")).one()
    reasons = [reason for reason, active in (("es superusuario", superuser), ("tiene BYPASSRLS", bypass), ("es dueño de tablas", owns)) if active]
    return f"el rol «{role}» {' y '.join(reasons)}: ignora la RLS" if reasons else None


def require_restricted_role() -> None:
    """Falla el arranque si el rol de DATABASE_URL ignora la RLS y la configuración lo exige (staging/production)."""
    if not settings.DB_REQUIRE_RESTRICTED_ROLE:
        return
    with engine.connect() as connection:
        problem = database_role_problem(connection)
    if problem:
        raise RuntimeError(f"DB_REQUIRE_RESTRICTED_ROLE: {problem}. Usa erd_app (API) o erd_worker (worker); ver docs/ops/DB_ROLES.md")
