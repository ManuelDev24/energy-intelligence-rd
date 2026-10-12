"""ERD-E2E-PLAYWRIGHT: prepara la base EXCLUSIVA de las pruebas E2E (nunca la base piloto) y sus fixtures deterministas.

Uso:  uv run python -m scripts.e2e_prepare --database-url postgresql+psycopg://…/energy_rd_e2e --out /ruta/run.json
1) crea la base (si existe, la BORRA: solo se acepta un nombre que termine en `_e2e`), 2) aplica todas las migraciones desde vacío,
3) carga las 5 viviendas piloto (idempotente) y una persona de pruebas dueña de las cinco, 4) genera una factura SINTÉTICA para el OCR,
5) escribe en `--out` lo que las pruebas necesitan (correo y contraseña de pruebas, ids). Los datos son inventados; la base se borra al terminar.
"""
import argparse
import json
import secrets
import sys
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

PILOT_EMAIL = "pilot-e2e@example.com"


def _guard(url: str):
    parsed = make_url(url)
    if not (parsed.database or "").endswith("_e2e"):
        raise SystemExit(f"Rechazado: la base debe terminar en '_e2e' (recibí '{parsed.database}'); nunca se toca la base piloto.")
    if parsed.host not in ("localhost", "127.0.0.1", None):
        raise SystemExit("Rechazado: las pruebas E2E solo corren contra un PostgreSQL local.")
    return parsed


def drop_database(url: str, create: bool = False) -> None:
    parsed = _guard(url)
    admin = create_engine(parsed.set(database="postgres"), isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        conn.execute(text("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = :d AND pid <> pg_backend_pid()"), {"d": parsed.database})
        conn.execute(text(f'DROP DATABASE IF EXISTS "{parsed.database}"'))
        if create:
            conn.execute(text(f'CREATE DATABASE "{parsed.database}"'))
    admin.dispose()


def recreate_database(url: str) -> None:
    drop_database(url, create=True)


def migrate(url: str) -> None:
    cfg = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    cfg.set_main_option("sqlalchemy.url", url)
    command.upgrade(cfg, "head")


def provision_roles(url: str) -> dict:
    """Auditoría C-01: el E2E conecta el API como `erd_app` y el worker como `erd_worker` (los roles sin privilegios de la migración 0027),
    con contraseñas aleatorias de esta corrida, para ejercitar la RLS en toda la pila. Las URL quedan solo en el run.json (carpeta ignorada)."""
    parsed = _guard(url)
    admin = create_engine(parsed, isolation_level="AUTOCOMMIT")
    urls = {}
    with admin.connect() as conn:
        for key, role in (("app_database_url", "erd_app"), ("worker_database_url", "erd_worker")):
            role_password = secrets.token_urlsafe(24)
            conn.execute(text(f"ALTER ROLE {role} LOGIN PASSWORD '{role_password}'"))  # nombres fijos y contraseña urlsafe: sin comillas
            urls[key] = parsed.set(username=role, password=role_password).render_as_string(hide_password=False)
    admin.dispose()
    return urls


def load_fixtures(url: str, password: str) -> dict:
    from app.config import settings  # noqa: F401  (valida la configuración antes de escribir)
    from app.models import Home, HomeMember, User
    from app.seed import seed_pilot
    from app.services.auth import password_hasher
    from app.services.legal import LEGAL_TERMS_VERSION
    from datetime import datetime, timezone

    engine = create_engine(url)
    with Session(engine) as db:
        seed_pilot(db)
        user = db.scalar(select(User).where(User.email == PILOT_EMAIL))
        if user is None:
            user = User(email=PILOT_EMAIL, password_hash=password_hasher.hash(password), role="user",
                        terms_version=LEGAL_TERMS_VERSION, terms_accepted_at=datetime.now(timezone.utc))
            db.add(user)
            db.flush()
        homes = list(db.scalars(select(Home).where(Home.code.like("PILOT-%")).order_by(Home.code)))
        for home in homes:
            if db.get(HomeMember, (home.id, user.id)) is None:
                db.add(HomeMember(home_id=home.id, user_id=user.id, role="owner"))
        db.commit()
        ids = {home.code: str(home.id) for home in homes}
    engine.dispose()
    return ids


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--database-url", required=True)
    parser.add_argument("--out", type=Path)
    parser.add_argument("--drop", action="store_true", help="solo borra la base E2E (limpieza al terminar)")
    args = parser.parse_args(argv)
    if args.drop:
        drop_database(args.database_url)
        return 0
    if args.out is None:
        parser.error("--out es obligatorio salvo con --drop")
    recreate_database(args.database_url)
    migrate(args.database_url)
    password = secrets.token_urlsafe(24)
    ids = load_fixtures(args.database_url, password)
    if len(ids) != 5:
        raise SystemExit(f"Se esperaban 5 viviendas piloto y hay {len(ids)}")
    args.out.parent.mkdir(parents=True, exist_ok=True)
    # Factura sintética para el OCR (datos inventados), generada con el mismo módulo que usan las pruebas de la API.
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from tests import synthetic_bills as sb
    bill = args.out.parent / "factura-sintetica.png"
    data = sb.BillData(sb.date(2026, 8, 12), sb.date(2026, 9, 7), 4210, 4450, sb.date(2026, 10, 7))
    bill.write_bytes(sb.to_bytes(sb.render("EDESUR", data, 768)))
    args.out.write_text(json.dumps({"pilot_email": PILOT_EMAIL, "pilot_password": password, "pilot_homes": ids,
                                    "bill_image": str(bill), "bill_expected": sb.expected(data), **provision_roles(args.database_url)}, indent=2))
    print(json.dumps({"homes": len(ids), "out": str(args.out)}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
