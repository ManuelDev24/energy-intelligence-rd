"""ERD-PROF-01 (web): Mi cuenta contra API real con auth: contraseña, notificaciones, sesiones y descarga de datos.

Requiere la pila de ERD-ONB-ACCEPTANCE (API :18011 con migración 0016, web :3011). Solo cuentas erd-prof-<uuid>@example.com.
"""
import json, re, secrets, sys, uuid
from pathlib import Path
from playwright.sync_api import sync_playwright

WEB, OUT = "http://localhost:3011", Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)
results = []
email, password = f"erd-prof-{uuid.uuid4().hex}@example.com", secrets.token_urlsafe(24)
new_password = secrets.token_urlsafe(24)


def check(name, ok, detail=""):
    results.append({"check": name, "ok": bool(ok), "detail": detail})
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""), flush=True)


def bff(page, path, method="GET", body=None):
    return page.evaluate("""async ([p, m, b]) => { const r = await fetch('/api/bff/' + p, {method: m, credentials: 'same-origin',
        headers: {'Content-Type': 'application/json'}, body: b ? JSON.stringify(b) : undefined});
        return {status: r.status, body: r.status === 204 ? null : await r.json().catch(() => null)}; }""", [path, method, body])


def login(page, mail, pw):
    page.goto(WEB + "/login", wait_until="networkidle")
    page.get_by_label("Correo electrónico").fill(mail); page.get_by_label("Contraseña").fill(pw)
    page.get_by_role("button", name=__import__("re").compile("Iniciar sesión")).last.click()
    page.wait_for_url("**/homes", timeout=30000)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--no-sandbox"])
    ctx_a = browser.new_context(viewport={"width": 1000, "height": 2200}, accept_downloads=True)
    a = ctx_a.new_page()
    a.goto(WEB + "/register", wait_until="networkidle")
    a.get_by_label("Correo electrónico").fill(email); a.get_by_label("Contraseña").fill(password)
    a.locator("#accept-terms").check(); a.get_by_role("button", name="Crear cuenta").click()
    a.wait_for_url("**/homes", timeout=30000)
    # Segunda sesión de la misma cuenta (otro navegador).
    b = browser.new_context().new_page(); login(b, email, password)

    a.get_by_role("link", name="Mi cuenta").click(); a.wait_for_url("**/account")
    a.get_by_role("heading", name="Sesiones activas").wait_for()
    items = a.locator("li:has-text('Iniciada el')")
    items.first.wait_for()
    marked = a.locator("li strong:has-text('Esta sesión')")
    check("sesiones: aparecen 2 y una está marcada como actual", items.count() == 2 and marked.count() == 1, f"items={items.count()} actual={marked.count()}")
    a.screenshot(path=str(OUT / "prof-1-cuenta.jpg"), type="jpeg", quality=60, full_page=True)

    # Notificaciones
    a.get_by_label("Avisos de consumo por correo").wait_for()
    check("notificaciones: por defecto ambas activadas", a.get_by_label("Avisos de consumo por correo").is_checked() and a.get_by_label(re.compile("Avisos en el teléfono")).is_checked())
    a.get_by_label("Avisos de consumo por correo").uncheck()
    a.get_by_role("button", name="Guardar preferencias").click()
    a.get_by_text("Preferencias guardadas.").wait_for()
    a.reload(wait_until="networkidle"); a.get_by_label("Avisos de consumo por correo").wait_for()
    check("notificaciones: persisten tras recargar", not a.get_by_label("Avisos de consumo por correo").is_checked())

    # Cerrar la otra sesión → la segunda deja de funcionar
    a.get_by_role("button", name="Cerrar las demás sesiones").click()
    a.get_by_text("Se cerraron las demás sesiones.").wait_for()
    check("sesiones: la otra sesión deja de funcionar al instante", bff(b, "auth/me")["status"] == 401)
    check("sesiones: esta sesión sigue activa", bff(a, "auth/me")["status"] == 200)

    # Cambio de contraseña con contraseña actual incorrecta, luego correcta
    a.get_by_label("Contraseña actual").fill("contraseña-incorrecta-1234"); a.get_by_label("Nueva contraseña", exact=True).fill(new_password)
    a.get_by_label("Confirmar nueva contraseña").fill(new_password)
    a.get_by_role("button", name="Cambiar contraseña").click()
    a.get_by_text("La contraseña no es correcta.").wait_for()
    check("contraseña: la actual incorrecta no cambia nada", bff(a, "auth/me")["status"] == 200)
    login(b, email, password)    # la contraseña antigua sigue valiendo
    check("contraseña: tras el intento fallido la antigua sigue sirviendo", bff(b, "auth/me")["status"] == 200)
    a.get_by_label("Contraseña actual").fill(password)
    a.get_by_role("button", name="Cambiar contraseña").click()
    a.get_by_text("Contraseña cambiada.").wait_for()
    check("contraseña: esta sesión sigue activa con cookies renovadas", bff(a, "auth/me")["status"] == 200)
    check("contraseña: la otra sesión se cerró", bff(b, "auth/me")["status"] == 401)
    c = browser.new_context().new_page()
    c.goto(WEB + "/login", wait_until="networkidle")
    c.get_by_label("Correo electrónico").fill(email); c.get_by_label("Contraseña").fill(password)
    c.get_by_role("button", name=__import__("re").compile("Iniciar sesión")).last.click()
    c.get_by_text("Credenciales inválidas.").wait_for(timeout=15000)
    check("contraseña: la antigua ya no inicia sesión", bff(c, "auth/me")["status"] == 401)
    login(c, email, new_password)
    check("contraseña: la nueva sí inicia sesión", bff(c, "auth/me")["status"] == 200)

    # Descarga de datos
    with a.expect_download() as info:
        a.get_by_role("button", name="Descargar mis datos").click()
    download = info.value
    path = OUT / "descarga-ejemplo.json"; download.save_as(str(path))
    data = json.loads(path.read_text())
    check("datos: se descarga un JSON con el nombre de la API", download.suggested_filename.startswith("energyrd-datos-") and data["format_version"] == 1, download.suggested_filename)
    check("datos: contiene la cuenta y ningún secreto", data["account"]["email"] == email and "password" not in path.read_text().lower() and "refresh" not in path.read_text().lower())
    path.unlink()  # no se versiona el archivo de datos
    browser.close()

(OUT / "results.json").write_text(json.dumps(results, indent=2, ensure_ascii=False))
failed = [r for r in results if not r["ok"]]
print(f"{len(results) - len(failed)}/{len(results)} comprobaciones OK")
sys.exit(1 if failed else 0)
