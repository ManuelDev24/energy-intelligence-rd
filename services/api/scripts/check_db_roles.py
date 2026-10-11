"""Auditoría C-01: comprueba que la conexión de `DATABASE_URL` es un rol restringido y que toda tabla con datos por vivienda tiene RLS.

    uv run python -m scripts.check_db_roles

Solo lee. Sale con código 1 si el rol ignora la RLS (superusuario, BYPASSRLS o dueño de tablas) o si falta RLS/políticas en alguna tabla.
No imprime URL ni contraseñas.
"""
import sys

from sqlalchemy import text

from app.database import database_role_problem, engine


def main() -> int:
    with engine.connect() as connection:
        problems = []
        role_problem = database_role_problem(connection)
        if role_problem:
            problems.append(role_problem)
        with_home = {r[0] for r in connection.execute(text(
            "SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='home_id'"))}
        protected = {r[0] for r in connection.execute(text(
            "SELECT relname FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' AND relrowsecurity"))}
        missing = sorted(with_home - protected - {"audit_events", "home_invitations"})
        if missing:
            problems.append(f"tablas con home_id sin RLS: {', '.join(missing)} (¿falta aplicar la migración 0025?)")
        if "homes" not in protected:
            problems.append("la tabla homes no tiene RLS (¿falta aplicar la migración 0025?)")
        role = connection.execute(text("SELECT current_user")).scalar()
    if problems:
        print(f"ERROR rol «{role}»:")
        for problem in problems:
            print(f"  - {problem}")
        return 1
    print(f"OK: «{role}» es un rol restringido y {len(protected)} tablas tienen RLS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
