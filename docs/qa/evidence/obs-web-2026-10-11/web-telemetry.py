"""ERD-OBS-01 (web): verifica en un navegador real que los eventos de error salen REDACTADOS y que sin DSN no sale nada.

Un servidor local hace de «Sentry» (recibe los sobres). No prueba Sentry real, cuentas ni alertas: solo lo que el navegador envía.
Requiere `next dev -p 3012` (NO dos servidores a la vez: comparten `.next`). Dos corridas:
  modo «dsn»:   NEXT_PUBLIC_SENTRY_DSN=http://publickey@127.0.0.1:19999/1  →  python web-telemetry.py <dir> dsn
  modo «nodsn»: sin esa variable                                            →  python web-telemetry.py <dir> nodsn
"""
import gzip, json, re, sys, threading, time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)
MODE = sys.argv[2] if len(sys.argv) > 2 else "dsn"
received = []
results = []


class Ingest(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")

    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("content-length", 0)))
        if self.headers.get("content-encoding") == "gzip":
            body = gzip.decompress(body)
        received.append({"path": self.path, "body": body.decode("utf-8", "replace")})
        self.send_response(200); self._cors(); self.end_headers(); self.wfile.write(b"{}")

    def log_message(self, *a):
        pass


def check(name, ok, detail=""):
    results.append({"check": name, "ok": bool(ok), "detail": detail})
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""), flush=True)


def events():
    out = []
    for r in received:
        lines = r["body"].split("\n")
        for i in range(1, len(lines) - 1, 2):
            try:
                if json.loads(lines[i]).get("type") == "event":
                    out.append(json.loads(lines[i + 1]))
            except (ValueError, IndexError):
                pass
    return out


server = HTTPServer(("127.0.0.1", 19999), Ingest)
threading.Thread(target=server.serve_forever, daemon=True).start()
SECRET_MAIL, SECRET_TOKEN = "ana.perez@example.com", "A" * 20 + "b" * 23
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--no-sandbox"])
    page = browser.new_context().new_page()
    if MODE == "dsn":
        page.goto("http://localhost:3012/login?email=" + SECRET_MAIL + "&token=" + SECRET_TOKEN, wait_until="networkidle")
        page.evaluate(f"setTimeout(() => {{ throw new Error('falló para {SECRET_MAIL} con {SECRET_TOKEN}') }}, 10)")
        deadline = time.time() + 20
        while time.time() < deadline and not events():
            time.sleep(0.5)
        ev = events()
        check("el navegador envió el error no capturado al DSN", len(ev) == 1, f"{len(ev)} evento(s)")
        raw = "\n".join(r["body"] for r in received)
        if ev:
            e = ev[0]
            check("el correo y el token NO aparecen en ninguna parte del sobre", SECRET_MAIL not in raw and SECRET_TOKEN not in raw)
            check("el mensaje llegó con [Filtered]", "[Filtered]" in json.dumps(e.get("exception", {})), json.dumps(e.get("exception", {}).get("values", [{}])[0].get("value", "")))
            req = e.get("request", {})
            check("la URL llegó sin query ni fragmento", "?" not in req.get("url", "") and "#" not in req.get("url", "") and "email=" not in raw and "token=" not in raw, req.get("url", "(el evento no lleva URL de petición)"))
            check("no hay usuario, cookies, ni cuerpo", "user" not in e and "cookies" not in req and "data" not in req)
            check("no hay migas de pan", not e.get("breadcrumbs"))
        kinds = [json.loads(l).get("type") for r in received for l in r["body"].split("\n")[1::2] if l.startswith("{")]
        check("no se envió ninguna sesión ni traza", not {"session", "transaction"} & set(kinds), str(sorted(set(kinds))))
        page.screenshot(path=str(OUT / "obs-1-login.jpg"), type="jpeg", quality=60)
    else:
        page.goto("http://localhost:3012/login", wait_until="networkidle")
        page.evaluate("setTimeout(() => { throw new Error('sin dsn') }, 10)")
        time.sleep(4)
        check("sin NEXT_PUBLIC_SENTRY_DSN no sale ninguna petición hacia Sentry", not received, f"{len(received)} petición(es)")
    browser.close()

(OUT / f"results-{MODE}.json").write_text(json.dumps(results, ensure_ascii=False, indent=2))
failed = [r for r in results if not r["ok"]]
print(f"{len(results) - len(failed)}/{len(results)} comprobaciones OK")
sys.exit(1 if failed else 0)
