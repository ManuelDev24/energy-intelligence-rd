#!/usr/bin/env python3
"""Vigila los workflows: las acciones de CodeQL (init/analyze/upload-sarif) deben usar el MISMO SHA y todas las acciones externas
deben ir fijadas por SHA de 40 caracteres. Un desfase de CodeQL rompe el escaneo con «Code scanning configuration error»
(ocurrió en `main` cuando Dependabot subió solo `analyze`). Uso, desde la raíz:  python3 scripts/check_workflow_pins.py"""
import re
import sys
from pathlib import Path

USES = re.compile(r"^\s*-?\s*uses:\s*([^@\s]+)@([^\s#]+)", re.M)
errors: list[str] = []
codeql: dict[str, set[str]] = {}
for path in sorted(Path(".github/workflows").glob("*.y*ml")):
    for action, ref in USES.findall(path.read_text()):
        if action.startswith("./"):
            continue
        if not re.fullmatch(r"[0-9a-f]{40}", ref):
            errors.append(f"{path}: {action}@{ref} no está fijada por SHA de 40 caracteres")
        if action.startswith("github/codeql-action"):
            codeql.setdefault(action, set()).add(ref)
shas = {ref for refs in codeql.values() for ref in refs}
if len(shas) > 1:
    errors.append(f"las acciones de CodeQL usan SHAs distintos ({', '.join(f'{a}={sorted(r)}' for a, r in sorted(codeql.items()))}): "
                  "deben coincidir (init, analyze y upload-sarif en la misma versión)")
for error in errors:
    print("ERROR:", error)
print(f"Resultado: {len(errors)} errores")
sys.exit(1 if errors else 0)
