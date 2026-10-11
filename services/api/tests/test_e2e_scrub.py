"""ERD-E2E-PLAYWRIGHT: la depuración de evidencias E2E no deja pasar credenciales."""
import importlib.util
import zipfile
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[3] / "scripts/scrub_e2e_artifacts.py"
spec = importlib.util.spec_from_file_location("scrub_e2e_artifacts", SCRIPT)
scrub = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scrub)

JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnopqrstuvwxyz123456"


def test_scrub_text_redacts_credentials_and_emails():
    raw = (
        f'Authorization: Bearer {JWT}\ncookie: erd-session=abc123; erd-logout=zzz999\n'
        '{"email":"persona@example.com","password":"S3cr3to-largo","refresh_token":"opaque-token-value"}'
    )
    clean = scrub.scrub_text(raw)
    for leaked in (JWT, "abc123", "zzz999", "persona@example.com", "S3cr3to-largo", "opaque-token-value"):
        assert leaked not in clean
    assert "[REDACTED]" in clean


def test_scrub_dir_removes_videos_and_cleans_text_and_zip(tmp_path):
    (tmp_path / "video.webm").write_bytes(b"\x1aE\xdf\xa3")
    (tmp_path / "error-context.md").write_text(f"token={JWT} usuario a@example.com", encoding="utf-8")
    archive = tmp_path / "trace.zip"
    with zipfile.ZipFile(archive, "w") as z:
        z.writestr("0-trace.trace", f'{{"headers":"Cookie: erd-session=secreto","password":"abc"}}')
        z.writestr("resources/body.json", '{"access_token":"xyz"}')
    stats = scrub.scrub_dir(tmp_path)
    assert not (tmp_path / "video.webm").exists()
    assert JWT not in (tmp_path / "error-context.md").read_text(encoding="utf-8")
    with zipfile.ZipFile(archive) as z:
        assert z.namelist() == ["0-trace.trace"]
        body = z.read("0-trace.trace").decode()
    assert "secreto" not in body and '"abc"' not in body
    assert stats["videos_removed"] == 1 and stats["zips"] == 1
