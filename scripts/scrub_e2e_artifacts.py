"""ERD-E2E-PLAYWRIGHT: depura las evidencias de una corrida E2E fallida antes de publicarlas.

Las pruebas usan solo datos sintéticos (@example.com, contraseñas aleatorias) y la base se borra al terminar. Aun así,
una traza puede contener cookies, tokens o contraseñas de esa corrida: se redactan. Los videos no se pueden depurar
y se eliminan; las capturas se conservan (muestran únicamente datos sintéticos).

Uso: python scripts/scrub_e2e_artifacts.py DIRECTORIO [DIRECTORIO...]
"""
from __future__ import annotations

import re
import sys
import zipfile
from pathlib import Path

TEXT_SUFFIXES = {".md", ".txt", ".json", ".jsonl", ".html", ".trace", ".network", ".log", ".stacks", ".yml", ".yaml"}
REDACTED = "[REDACTED]"
PATTERNS: list[tuple[re.Pattern[str], str]] = [
    # JWT / tokens opacos largos y credenciales en cabeceras o JSON.
    (re.compile(r"eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}"), REDACTED),
    (re.compile(r"(?i)(authorization|cookie|set-cookie|x-csrf-token)(\"?\s*[:=]\s*\"?)([^\"\\\n]+)"), rf"\1\2{REDACTED}"),
    (re.compile(r"(?i)(\"?(?:password|new_password|current_password|refresh_token|access_token|token|secret|api[_-]?key)\"?\s*[:=]\s*\"?)([^\"\\\s,}&]+)"), rf"\1{REDACTED}"),
    (re.compile(r"(?i)(erd-[a-z-]+=)[^;\"\\\s]+"), rf"\1{REDACTED}"),
    (re.compile(r"(?i)\b(bearer\s+)[A-Za-z0-9._~+/=-]{12,}"), rf"\1{REDACTED}"),
    (re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"), "[email]"),
]


def scrub_text(text: str) -> str:
    for pattern, replacement in PATTERNS:
        text = pattern.sub(replacement, text)
    return text


def scrub_zip(path: Path) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    with zipfile.ZipFile(path) as source, zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as target:
        for info in source.infolist():
            data = source.read(info)
            if info.filename.startswith("resources/") or Path(info.filename).suffix in {".png", ".jpeg", ".jpg"}:
                # Recursos de red (cuerpos de respuesta) y capturas de la traza: se omiten, pueden llevar datos de sesión.
                continue
            if Path(info.filename).suffix in TEXT_SUFFIXES or info.filename.endswith(("trace", "network")):
                data = scrub_text(data.decode("utf-8", errors="replace")).encode("utf-8")
            target.writestr(info.filename, data)
    tmp.replace(path)


def scrub_dir(root: Path) -> dict[str, int]:
    stats = {"scrubbed": 0, "videos_removed": 0, "zips": 0}
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        if path.suffix in {".webm", ".mp4"}:
            path.unlink()
            stats["videos_removed"] += 1
        elif path.suffix == ".zip":
            scrub_zip(path)
            stats["zips"] += 1
        elif path.suffix in TEXT_SUFFIXES:
            original = path.read_text(encoding="utf-8", errors="replace")
            cleaned = scrub_text(original)
            if cleaned != original:
                path.write_text(cleaned, encoding="utf-8")
                stats["scrubbed"] += 1
    return stats


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 2
    for name in argv:
        root = Path(name)
        if not root.exists():
            continue
        print(f"{name}: {scrub_dir(root)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
