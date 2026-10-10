"""ERD-SHARE-01 (web): dos cuentas reales; invitar por la UI, aceptar por el enlace del correo, transferir y salir.

Requiere API auth-enabled con EMAIL_DEV_OUTBOX=/tmp/claude-0/outbox.jsonl y PASSWORD_RESET_URL=http://localhost:3011/…
y `next dev` con NEXT_PUBLIC_AUTH_ENABLED=true (puertos 18011 / 3011). Solo cuentas desechables erd-share-<uuid>@example.com.
"""
import json, re, secrets, sys, uuid
from pathlib import Path
from playwright.sync_api import sync_playwright

WEB, OUT, OUTBOX = "http://localhost:3011", Path(sys.argv[1]), Path("/tmp/claude-0/outbox.jsonl")
OUT.mkdir(parents=True, exist_ok=True)
results = []
alice = (f"erd-share-{uuid.uuid4().hex}@example.com", secrets.token_urlsafe(24))
bob = (f"erd-share-{uuid.uuid4().hex}@example.com", secrets.token_urlsafe(24))


def check(name, ok, detail=""):
    results.append({"check": name, "ok": bool(ok), "detail": detail})
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""), flush=True)


def bff(page, path, method="GET", body=None):
    return page.evaluate("""async ([p, m, b]) => { const r = await fetch('/api/bff/' + p, {method: m, credentials: 'same-origin',
        headers: {'Content-Type': 'application/json'}, body: b ? JSON.stringify(b) : undefined});
        return {status: r.status, body: r.status === 204 ? null : await r.json()}; }""", [path, method, body])


def register(page, creds):
    page.goto(WEB + "/register", wait_until="networkidle")
    page.get_by_label("Correo electrónico").fill(creds[0]); page.get_by_label("Contraseña").fill(creds[1])
    page.locator("#accept-terms").check(); page.get_by_role("button", name="Crear cuenta").click()
    page.wait_for_url("**/homes", timeout=30000)
    page.get_by_role("button", name="Empezar").wait_for(timeout=30000)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--no-sandbox"])
    a = browser.new_context(viewport={"width": 1100, "height": 1200}).new_page()
    b = browser.new_context(viewport={"width": 1100, "height": 900}).new_page()
    register(a, alice); register(b, bob)
    home = bff(a, "homes", "POST", {"name": "Casa compartida QA", "distributor": "EDESUR"})["body"]["id"]
    a.reload(wait_until="networkidle")
    a.get_by_role("button", name="Compartir Casa compartida QA").click()
    a.get_by_role("heading", name="Miembros").wait_for()
    check("el propietario ve el panel con su propio rol", "Propietario" in a.inner_text("main"))
    a.get_by_label("Correo de la persona invitada").fill("no-es-correo")
    a.get_by_role("button", name="Enviar invitación").click()
    check("correo inválido se rechaza en el cliente", a.get_by_text("correo electrónico válido").is_visible())
    a.get_by_label("Correo de la persona invitada").fill(bob[0].upper())
    a.get_by_role("button", name="Enviar invitación").click()
    a.get_by_text("Invitación enviada").wait_for()
    a.get_by_text(f"{bob[0]} · caduca").wait_for(timeout=15000)
    check("invitación aparece como pendiente (con el correo normalizado)", a.get_by_text(f"{bob[0]} · caduca").is_visible())
    a.screenshot(path=str(OUT / "share-1-propietario.jpg"), type="jpeg", quality=70)

    mails = [json.loads(l) for l in OUTBOX.read_text().splitlines()]
    mail = next(m for m in mails if m["to"] == bob[0])
    link = re.search(r"https?://\S+#token=[A-Za-z0-9_-]{43}", mail["text"]).group(0)
    check("el correo lleva el enlace con el token en el fragmento y sin datos del invitador", "#token=" in link and alice[0] not in mail["text"], link.split("#")[0])
    check("segunda invitación al mismo correo se bloquea (409)", bff(a, f"homes/{home}/invitations", "POST", {"email": bob[0]})["status"] == 409)

    # Bob abre el enlace SIN iniciar sesión primero? Ya la tiene: abre el enlace.
    b.goto(link, wait_until="networkidle")
    check("el token se borra de la barra de direcciones", "token=" not in b.url, b.url)
    b.get_by_role("button", name="Aceptar invitación").wait_for(timeout=30000)
    b.screenshot(path=str(OUT / "share-2-aceptar.jpg"), type="jpeg", quality=70)
    b.get_by_role("button", name="Aceptar invitación").click()
    b.wait_for_url("**/dashboard", timeout=30000)
    check("Bob acepta y llega al panel de la vivienda", b.get_by_role("heading", name="Inicio").is_visible())
    check("Bob ve la vivienda en su lista", [h["id"] for h in bff(b, "homes")["body"]] == [home])
    check("Bob (miembro) no puede listar miembros (403)", bff(b, f"homes/{home}/members")["status"] == 403)
    r = bff(b, "invitations/accept", "POST", {"token": link.split("#token=")[1]})
    check("reutilizar el token devuelve 400 invitation_invalid", r["status"] == 400 and r["body"].get("code") == "invitation_invalid", str(r["status"]))

    # Alice ve a Bob, transfiere y deja de ser propietaria.
    a.reload(wait_until="networkidle")
    a.get_by_role("button", name="Compartir Casa compartida QA").click()
    a.get_by_text(bob[0]).first.wait_for()
    a.screenshot(path=str(OUT / "share-3-miembros.jpg"), type="jpeg", quality=70)
    a.get_by_role("button", name=f"Transferir la propiedad a {bob[0]}").click()
    form = a.get_by_role("form", name="Confirmar acción")
    form.get_by_label("Tu contraseña").fill("contraseña-incorrecta-123")
    form.get_by_role("button", name="Confirmar").click()
    a.get_by_text("La contraseña no es correcta.").wait_for()
    roles = {m["email"]: m["role"] for m in bff(a, f"homes/{home}/members")["body"]}
    check("contraseña incorrecta no transfiere (Alice sigue siendo propietaria)", roles.get(alice[0]) == "owner" and roles.get(bob[0]) == "member", str(roles))
    form.get_by_label("Tu contraseña").fill(alice[1])
    form.get_by_role("button", name="Confirmar").click()
    a.get_by_text("Propiedad transferida").wait_for()
    members = bff(b, f"homes/{home}/members")
    check("Bob ahora es propietario y Alice miembro", members["status"] == 200 and {m["email"]: m["role"] for m in members["body"]} == {alice[0]: "member", bob[0]: "owner"})

    # Alice (ya miembro) sale de la vivienda.
    a.get_by_role("button", name="Cerrar").click()
    a.get_by_role("button", name="Compartir Casa compartida QA").click()
    a.get_by_role("button", name=re.compile("Salir de la vivienda")).click()
    a.get_by_role("form", name="Confirmar acción").get_by_role("button", name="Confirmar").click()
    a.wait_for_function("document.body.innerText.includes('Aún no tienes viviendas') || !document.body.innerText.includes('Casa compartida QA')", timeout=15000)
    check("Alice sale y deja de ver la vivienda", bff(a, "homes")["body"] == [])
    # Bob (único miembro y propietario) no puede salir; debe borrar la vivienda.
    check("el único propietario no puede salir (409)", bff(b, f"homes/{home}/members/me", "DELETE", {})["status"] == 409)
    browser.close()

(OUT / "results.json").write_text(json.dumps(results, indent=2, ensure_ascii=False))
failed = [r for r in results if not r["ok"]]
print(f"{len(results) - len(failed)}/{len(results)} comprobaciones OK")
sys.exit(1 if failed else 0)
