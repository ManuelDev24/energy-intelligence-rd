"""ERD-WORKER-01: inspección y operación manual de la cola de trabajos.

    uv run python -m scripts.jobs stats            # JSON: por estado, atraso del más viejo, muertos por tipo
    uv run python -m scripts.jobs dead [--limit N] # trabajos muertos (sin payload; el error ya va sin datos personales)
    uv run python -m scripts.jobs requeue <id>     # devuelve un muerto a la cola con los intentos en cero
Sale con 1 si `stats` ve trabajos muertos o con la concesión vencida (útil como comprobación de alertas).
"""
import argparse
import json
import sys

from app.database import SessionLocal
from app.services.jobs import list_dead, requeue_dead, stats


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("stats")
    dead = sub.add_parser("dead")
    dead.add_argument("--limit", type=int, default=50)
    requeue = sub.add_parser("requeue")
    requeue.add_argument("job_id", type=int)
    args = parser.parse_args(argv)
    with SessionLocal() as db:
        if args.command == "stats":
            report = stats(db)
            print(json.dumps(report, sort_keys=True))
            return 1 if report["dead"] or report["stuck"] else 0
        if args.command == "dead":
            for job in list_dead(db, args.limit):
                print(json.dumps({"id": job.id, "kind": job.kind, "attempts": job.attempts,
                                  "finished_at": job.finished_at.isoformat(), "error": job.last_error}, ensure_ascii=False))
            return 0
        if requeue_dead(db, args.job_id):
            print(f"Trabajo {args.job_id} devuelto a la cola")
            return 0
        print(f"El trabajo {args.job_id} no existe o no está muerto", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
