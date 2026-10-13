"""ERD-OCR-REAL-QA: evalúa el OCR con facturas reales anonimizadas que NO están en el repositorio.

Uso:  uv run python -m scripts.ocr_qa <directorio> [--json salida.json]
El directorio contiene las fotos y `expected.json` (ver docs/qa/OCR_REAL_QA.md). Sale con 1 si algún campo
salió mal con confianza alta; con 2 si el manifiesto o los archivos no son válidos.
"""
import argparse
import json
import sys
from pathlib import Path

from app.services.ocr import qa


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("directory", type=Path)
    parser.add_argument("--json", type=Path, help="escribe el informe completo (sin texto leído) en este archivo")
    args = parser.parse_args(argv)
    try:
        report = qa.run_directory(args.directory)
    except (OSError, ValueError) as exc:
        print(f"Entrada inválida: {exc}", file=sys.stderr)
        return 2
    for distributor, row in sorted(report["by_distributor"].items()):
        print(f"{distributor}: {row['files']} factura(s) · ok {row['ok']} · sin leer {row['missing']} · "
              f"mal pero avisado {row['wrong_flagged']} · MAL SIN AVISO {row['wrong_silent']}")
    for item in report["silent_errors"]:
        print(f"ERROR SILENCIOSO {item['file']}: {item['field']} esperado {item['expected']} leído {item['got']}")
    if args.json:
        args.json.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print("RESULTADO:", "APROBADO" if report["passed"] else "REPROBADO")
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
