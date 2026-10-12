"""Enforce the small project's dependency boundaries without new tooling."""
import ast
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
errors = []
for path in (ROOT / "services/api/app/services").rglob("*.py"):
    imports = [node.module or "" for node in ast.walk(ast.parse(path.read_text())) if isinstance(node, ast.ImportFrom)]
    if any(name.startswith("fastapi") for name in imports):
        errors.append(f"Application services cannot import FastAPI: {path.relative_to(ROOT)}")
for name in ("calculations.py", "consumption_calc.py", "tariff_calc.py"):
    pure = ROOT / "services/api/app/services" / name
    if re.search(r"(?:from|import) (?:app\.|sqlalchemy|fastapi)", pure.read_text()):
        errors.append(f"Energy calculations must stay independent of HTTP and ORM: {name}")
for package in (ROOT / "packages").glob("*/src"):
    for path in package.rglob("*"):
        if path.suffix not in {".ts", ".tsx"}: continue
        if re.search(r"(?:from|import).*['\"][^'\"]*(?:apps/|services/)", path.read_text()):
            errors.append(f"Shared package imports an application: {path.relative_to(ROOT)}")
for path in (ROOT / "services/api/app/api/v1").glob("*.py"):
    if re.search(r"\.commit\(|\.rollback\(|\.flush\(", path.read_text()):
        errors.append(f"Router controls a transaction: {path.relative_to(ROOT)}")
# Auditoría C-02: un handler `async def` sin `await` ejecuta trabajo bloqueante (CPU, disco, red, BD síncrona) en el bucle de eventos
# y congela todo el servidor. Sin `await` debe ser `def` (FastAPI lo corre en el threadpool).
for path in (ROOT / "services/api/app/api").rglob("*.py"):
    for node in ast.walk(ast.parse(path.read_text())):
        if isinstance(node, ast.AsyncFunctionDef) and not any(isinstance(child, (ast.Await, ast.AsyncFor, ast.AsyncWith)) for child in ast.walk(node)):
            errors.append(f"Async handler without await blocks the event loop; use def: {path.relative_to(ROOT)}:{node.lineno} {node.name}")
if errors:
    raise SystemExit("\n".join(errors))
print("Architecture boundaries passed")
