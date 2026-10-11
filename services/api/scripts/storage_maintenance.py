"""ERD-STORE-01: mantenimiento del almacenamiento de originales. Pensado para un cron o para el worker (ERD-WORKER-01).

Uso:  uv run python -m scripts.storage_maintenance [--reencrypt]
1) expira originales sin factura vencidos, 2) borra del almacenamiento los objetos encolados, 3) limpia la cola vieja,
4) con --reencrypt reescribe con la clave activa los objetos cifrados con una clave anterior (rotación).
Es idempotente y seguro de ejecutar en paralelo (la cola usa FOR UPDATE SKIP LOCKED). Sale con 1 si algún borrado falló
(se reintenta en la siguiente ejecución) y con 2 si el almacenamiento no está configurado. No imprime claves ni contenido.
"""
import argparse
import json
import sys

from app.database import SessionLocal
from app.services import document_storage
from app.services.errors import StorageUnavailable


def run(db, *, reencrypt: bool = False, batch: int = 200) -> dict:
    return document_storage.run_maintenance(db, reencrypt=reencrypt, batch=batch)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--reencrypt", action="store_true", help="rota las claves de cifrado de los objetos existentes")
    args = parser.parse_args(argv)
    try:
        with SessionLocal() as db:
            report = run(db, reencrypt=args.reencrypt)
    except StorageUnavailable:
        print("El almacenamiento no está configurado (STORAGE_BACKEND=disabled).", file=sys.stderr)
        return 2
    print(json.dumps(report, sort_keys=True))
    return 1 if report["failed"] or report.get("reencrypt", {}).get("failed") else 0


if __name__ == "__main__":
    sys.exit(main())
