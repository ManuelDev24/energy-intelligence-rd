"""ERD-ADM-RBAC: secure, idempotent bootstrap of the first super_admin.

This is the ONLY sanctioned way to create a super_admin. There is deliberately no HTTP
endpoint for this — it must be run from a trusted operator shell (e.g. `uv run python -m
app.cli_bootstrap_admin ops@energyrd.do`), never exposed over the network.

Idempotent: running it twice for the same email is a no-op the second time (it finds the
existing active assignment and does nothing), so it is safe to include in deploy scripts.
"""
import sys

from app.services.admin import bootstrap_super_admin


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    if len(argv) != 1 or "@" not in argv[0]:
        print("Uso: python -m app.cli_bootstrap_admin <email-de-un-usuario-existente>", file=sys.stderr)
        return 2
    email = argv[0]
    from app.database import SessionLocal

    with SessionLocal() as db:
        result = bootstrap_super_admin(db, email)
    if result["created"]:
        print(f"super_admin creado para {email} (assignment_id={result['assignment_id']})")
    else:
        print(f"{email} ya es super_admin activo (assignment_id={result['assignment_id']}); nada que hacer")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
