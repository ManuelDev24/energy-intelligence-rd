"""ERD-ANOM-01-COMPLETE (web): lecturas y facturas -> anomalías persistidas -> panel -> investigar / ver factura / descartar.

Requiere API :18011 (migrada a 0019, con AUTH_ENABLED) y la web :3011. Datos SINTÉTICOS: validan la tubería y las reglas,
no la calibración de umbrales con consumos reales.  Uso: python web-anomalies.py <dir-salida>
"""
import json, secrets, sys, uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from playwright.sync_api import sync_playwright

WEB, OUT = "http://localhost:3011", Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)
RD = timezone(timedelta(hours=-4))
TODAY = datetime.now(RD).date()
results = []


def check(name, ok, detail=""):
    results.append({"check": name, "ok": bool(ok), "detail": detail})
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""), flush=True)


def bff(page, path, method="GET", body=None):
    return page.evaluate("""async ([p, m, b]) => { const r = await fetch('/api/bff/' + p, {method: m, credentials: 'same-origin',
        headers: {'Content-Type': 'application/json'}, body: b ? JSON.stringify(b) : undefined});
        return {status: r.status, body: r.status === 204 ? null : await r.json()}; }""", [path, method, body])


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--no-sandbox"])
    page = browser.new_context(viewport={"width": 1280, "height": 1100}).new_page()
    api_calls = []
    page.on("request", lambda r: api_calls.append(r.url) if ("18011" in r.url) else None)
    page.goto(WEB + "/register", wait_until="networkidle")
    page.get_by_label("Correo electrónico").fill(f"erd-anom-{uuid.uuid4().hex}@example.com")
    page.get_by_label("Contraseña").fill(secrets.token_urlsafe(24))
    page.locator("#accept-terms").check()
    page.get_by_role("button", name="Crear cuenta").click()
    page.wait_for_url("**/homes", timeout=30000)
    page.get_by_role("button", name="Empezar").wait_for(timeout=30000)
    home = bff(page, "homes", "POST", {"name": "Casa anomalías", "distributor": "EDESUR"})["body"]["id"]

    # Lecturas: 12 días a 10 kWh/día y un día de 25 kWh (pico), todas a medianoche de RD.
    first, total = TODAY - timedelta(days=12), 0
    reads = [(first, 0)]
    for n in range(11):
        total += 25 if n == 6 else 10
        reads.append((first + timedelta(days=n + 1), total))
    for day, kwh in reads:
        at = datetime(day.year, day.month, day.day, tzinfo=RD).isoformat()
        assert bff(page, f"homes/{home}/readings", "POST", {"read_at": at, "reading_kwh": str(kwh)})["status"] == 201
    # Facturas: cuatro normales y una muy por encima (de 5 a 1 mes atrás).
    for months_ago, kwh in ((5, 300), (4, 300), (3, 300), (2, 300), (1, 650)):
        end = TODAY - timedelta(days=30 * months_ago)
        start = end - timedelta(days=29)
        r = bff(page, f"homes/{home}/bills", "POST", {"period_start": str(start), "period_end": str(end), "days": 30, "kwh": str(kwh), "amount_dop": str(kwh * 12)})
        assert r["status"] == 201, r

    listed = bff(page, f"homes/{home}/anomalies")
    kinds = sorted((a["kind"], a["source"]) for a in listed["body"])
    check("las anomalías se guardaron al escribir (sin worker): un pico por lecturas y un aumento por factura",
          listed["status"] == 200 and ("peak", "readings") in kinds and ("increase", "bills") in kinds, str(kinds))
    check("cada anomalía trae confianza, explicación y estado", all(a["confidence"] and a["explanation"] and a["status"] == "open" for a in listed["body"]))

    page.reload(wait_until="networkidle")
    page.get_by_role("button", name="Casa anomalías · EDESUR").click()
    page.wait_for_url("**/dashboard", timeout=30000)
    page.get_by_role("heading", name="Desviaciones detectadas").wait_for(timeout=30000)
    page.get_by_role("article", name="Pico de consumo en un día", exact=False).first.wait_for(timeout=15000)
    page.screenshot(path=str(OUT / "anom-1-panel.jpg"), type="jpeg", quality=70)
    section = page.locator("section[aria-labelledby=dash-anomalies]").inner_text()
    check("el panel muestra título por tipo, confianza y 'no identifica equipos'",
          "Pico de consumo en un día" in section and "Consumo más alto de lo habitual" in section and "Confianza" in section and "no identifica equipos" in section,
          section[:140].replace("\n", " | "))

    # Investigar en Consumo (solo lo detectado por lecturas).
    link = page.get_by_role("link", name="Investigar en Consumo la desviación").first
    check("el pico por lecturas ofrece investigar en Consumo y la factura NO", page.get_by_role("link", name="Investigar en Consumo").count() == 1)
    href = link.get_attribute("href")
    link.click()
    page.wait_for_url("**/consumption?**", timeout=15000)
    page.wait_for_timeout(2500)
    check("Consumo se abre con el rango de la desviación", "from=" in href and "granularity=day" in href, href)
    page.screenshot(path=str(OUT / "anom-2-consumo.jpg"), type="jpeg", quality=70)

    # Ver factura.
    page.go_back()
    page.get_by_role("heading", name="Desviaciones detectadas").wait_for(timeout=30000)
    page.get_by_role("link", name="Ver la factura de la desviación").first.click()
    page.wait_for_url("**/bills/**", timeout=15000)
    check("«Ver factura» abre el detalle de la factura señalada", "/bills/" in page.url)
    page.go_back()

    # Descartar: desaparece, persiste tras recargar y no reaparece al volver a escanear.
    page.get_by_role("heading", name="Desviaciones detectadas").wait_for(timeout=30000)
    before = page.get_by_role("button", name="Descartar la desviación").count()
    page.get_by_role("button", name="Descartar la desviación").first.click()
    page.wait_for_timeout(1500)
    after = page.get_by_role("button", name="Descartar la desviación").count()
    check("descartar quita una tarjeta del panel", after == before - 1, f"{before} -> {after}")
    page.reload(wait_until="networkidle")
    page.get_by_role("button", name="Casa anomalías · EDESUR").click()
    page.get_by_role("heading", name="Desviaciones detectadas").wait_for(timeout=30000)
    check("sigue descartada tras recargar (persistida)", page.get_by_role("button", name="Descartar la desviación").count() == after)
    dismissed = bff(page, f"homes/{home}/anomalies?status=dismissed")["body"]
    check("la descartada se conserva con estado 'dismissed'", len(dismissed) == 1 and dismissed[0]["status"] == "dismissed")
    # Una escritura nueva dispara otro escaneo: lo descartado no reaparece.
    day = TODAY - timedelta(days=0)
    bff(page, f"homes/{home}/readings", "POST", {"read_at": datetime(day.year, day.month, day.day, 1, tzinfo=RD).isoformat(), "reading_kwh": str(total + 1)})
    again = bff(page, f"homes/{home}/anomalies?status=dismissed")["body"]
    active = bff(page, f"homes/{home}/anomalies")["body"]
    check("tras otro escaneo lo descartado no reaparece ni se duplica", len(again) == 1 and all(a["id"] != dismissed[0]["id"] for a in active))
    bad = bff(page, f"homes/{home}/anomalies?status=todo")
    check("el BFF rechaza filtros fuera de lista (400)", bad["status"] == 400)
    check("el navegador nunca habló con la API directamente (solo /api/bff)", not api_calls, str(api_calls[:2]))
    browser.close()

(OUT / "results.json").write_text(json.dumps(results, indent=2, ensure_ascii=False))
failed = [r for r in results if not r["ok"]]
print(f"\n{len(results) - len(failed)}/{len(results)} comprobaciones OK")
sys.exit(1 if failed else 0)
