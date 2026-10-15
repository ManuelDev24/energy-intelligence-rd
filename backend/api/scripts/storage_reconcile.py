"""ERD-OPS-DR: concilia la tabla `documents` con los objetos del almacenamiento. Úsese SIEMPRE tras restaurar la base de datos.

Uso:  uv run python -m scripts.storage_reconcile [--delete-orphans] [--min-age-minutes 60]
Salida: un JSON (sin claves de objeto ni contenido). Código 0 = consistente (los huérfanos solo se informan), 1 = hay filas
SIN objeto (pérdida de datos: hay que pedir que se vuelvan a subir) o un borrado falló, 2 = almacenamiento no configurado.
Solo lee del almacenamiento; con --delete-orphans borra los objetos sin fila ni borrado pendiente más viejos que el margen.
"""
import argparse
import json
import sys

from app.database import SessionLocal
from app.services import document_storage
from app.services.errors import StorageUnavailable
from app.services.storage import StorageFailure


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--delete-orphans", action="store_true", help="borra objetos sin fila (más viejos que el margen)")
    parser.add_argument("--min-age-minutes", type=int, default=60, help="margen antes de considerar huérfano un objeto")
    args = parser.parse_args(argv)
    try:
        with SessionLocal() as db:
            report = document_storage.reconcile(db, delete_orphans=args.delete_orphans, min_age_minutes=args.min_age_minutes)
    except StorageUnavailable:
        print("El almacenamiento no está configurado (STORAGE_BACKEND=disabled).", file=sys.stderr)
        return 2
    except StorageFailure:
        print("No se pudo listar el almacenamiento.", file=sys.stderr)
        return 1
    print(json.dumps(report, sort_keys=True))
    return 1 if report["missing"] or report["orphan_delete_failed"] else 0


if __name__ == "__main__":
    sys.exit(main())
