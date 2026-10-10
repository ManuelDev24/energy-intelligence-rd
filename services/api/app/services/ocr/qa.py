"""ERD-OCR-REAL-QA: evalúa el OCR contra facturas de verdad conocida. Sin FastAPI ni base de datos.

Las fotos y su `expected.json` viven FUERA del repositorio (contienen datos personales aunque estén tapados).
Un campo puede salir bien (`ok`), no salir (`missing`), salir mal pero avisado (`wrong_flagged`: confianza
distinta de `high`) o salir mal con confianza `high` (`wrong_silent`): este último es el único que hace
fallar la evaluación, porque la persona no tendría motivo para corregirlo.
"""
import json
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Callable

from app.services.ocr.engine import extract_text
from app.services.ocr.parser import parse_bill_text

FIELDS = ("period_start", "period_end", "days", "kwh", "amount_dop", "reading_previous", "reading_current")
DISTRIBUTORS = ("EDESUR", "EDENORTE", "EDEESTE")
MANIFEST = "expected.json"


@dataclass(frozen=True)
class FieldResult:
    name: str
    status: str  # ok | missing | wrong_flagged | wrong_silent
    expected: str
    got: str | None
    confidence: str


@dataclass(frozen=True)
class FileResult:
    fields: list[FieldResult]
    warnings: list[str] = field(default_factory=list)

    @property
    def silent_errors(self):
        return [f for f in self.fields if f.status == "wrong_silent"]


def _same(expected: str, got: str) -> bool:
    try:
        return Decimal(expected) == Decimal(got)
    except InvalidOperation:
        return expected == got


def evaluate(draft, expected: dict[str, str]) -> FileResult:
    results = []
    for name in FIELDS:
        if name not in expected:
            continue
        item = getattr(draft, name)
        if item.value is None:
            status = "missing"
        elif _same(expected[name], item.value):
            status = "ok"
        else:
            status = "wrong_silent" if item.confidence == "high" else "wrong_flagged"
        results.append(FieldResult(name, status, expected[name], item.value, item.confidence))
    return FileResult(results, list(draft.warnings))


def summarize(results: dict[str, tuple[str, FileResult]]) -> dict:
    by_distributor: dict[str, dict[str, int]] = {}
    silent = []
    for filename, (distributor, result) in results.items():
        row = by_distributor.setdefault(distributor, {"files": 0, "ok": 0, "missing": 0, "wrong_flagged": 0,
                                                      "wrong_silent": 0})
        row["files"] += 1
        for item in result.fields:
            row[item.status] += 1
            if item.status == "wrong_silent":
                silent.append({"file": filename, "field": item.name, "expected": item.expected, "got": item.got})
    return {"by_distributor": by_distributor, "silent_errors": silent, "passed": not silent}


def load_manifest(path: Path) -> dict[str, dict]:
    manifest = json.loads(Path(path).read_text(encoding="utf-8"))
    for filename, entry in manifest.items():
        if entry.get("distributor") not in DISTRIBUTORS:
            raise ValueError(f"{filename}: distributor debe ser uno de {', '.join(DISTRIBUTORS)}")
        unknown = set(entry) - {"distributor", *FIELDS}
        if unknown:
            raise ValueError(f"{filename}: campos desconocidos: {', '.join(sorted(unknown))}")
    return manifest


def run_directory(directory: Path, reader: Callable[[bytes], str] = extract_text) -> dict:
    directory = Path(directory)
    manifest = load_manifest(directory / MANIFEST)
    missing = [name for name in manifest if not (directory / name).is_file()]
    if missing:
        raise FileNotFoundError(f"Faltan archivos del manifiesto: {', '.join(sorted(missing))}")
    results = {}
    for filename, entry in manifest.items():
        draft = parse_bill_text(reader((directory / filename).read_bytes()))
        results[filename] = (entry["distributor"], evaluate(draft, {k: v for k, v in entry.items() if k in FIELDS}))
    report = summarize(results)
    report["files"] = {name: {"distributor": dist, "warnings": res.warnings,
                              "fields": [vars(f) for f in res.fields]} for name, (dist, res) in results.items()}
    return report
