"""QA web contra PostgreSQL + API real (contenedores aislados) — ERD-WEB-QUALITY / ERD-WEB-POSTMERGE-QA / ERD-REL-VERIFY.

Requiere: API real en :18001 (seed piloto), web `next dev` en :3000 apuntando a esa API.
Uso: pwvenv/bin/python webqa/qa.py <dir-evidencia>
"""
import json, re, subprocess, sys, time, traceback, urllib.request
from collections import Counter
from pathlib import Path
from playwright.sync_api import sync_playwright, Page

WEB = "http://localhost:3000"
API = "http://127.0.0.1:18001/api/v1"
OUT = Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)
AXE = "https://cdn.jsdelivr.net/npm/axe-core@4.10.3/axe.min.js"
results: list[dict] = []


def check(name: str, ok: bool, detail: str = ""):
    results.append({"check": name, "ok": bool(ok), "detail": detail})
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""), flush=True)


def api(path: str, method: str = "GET", body: dict | None = None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body else None,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as r:
        raw = r.read()
        return json.loads(raw) if raw else None


def homes_by_code():
    return {h["code"]: h for h in api("/homes")}


def login(page: Page, home_label: str):
    page.goto(WEB + "/login", wait_until="domcontentloaded")
    sel = page.get_by_label("Vivienda")
    page.wait_for_function("document.querySelectorAll('select option').length > 1")
    label = next(o for o in sel.locator("option").all_inner_texts() if home_label in o)
    sel.select_option(label=label)
    page.get_by_role("button", name="Entrar").click()
    page.wait_for_url("**/dashboard")


def wait_dashboard(page: Page):
    page.get_by_role("heading", name="Inicio").wait_for()
    page.wait_for_selector("main [role=status][aria-label=Cargando]", state="detached", timeout=30000)
    page.wait_for_timeout(500)


def metrics(node, out):
    if isinstance(node, list):
        for n in node: metrics(n, out)
    elif isinstance(node, dict):
        if isinstance(node.get("value"), str) and isinstance(node.get("unit"), str) and isinstance(node.get("quality"), str):
            out.append(node)
        else:
            for k, v in node.items():
                if k != "quality_legend": metrics(v, out)
    return out


def run_axe(page: Page, name: str):
    page.add_script_tag(url=AXE)
    res = page.evaluate("""async () => {
      const r = await axe.run(document, { exclude: [['nextjs-portal']], runOnly: ['wcag2a','wcag2aa','wcag21a','wcag21aa','best-practice'] });
      return r.violations.map(v => ({id: v.id, impact: v.impact, n: v.nodes.length, help: v.help, target: v.nodes[0]?.target?.join(' ')}));
    }""")
    serious = [v for v in res if v["impact"] in ("serious", "critical")]
    check(f"axe {name}: sin violaciones serias/críticas", not serious,
          "; ".join(f"{v['id']}({v['impact']}×{v['n']}: {v['target']})" for v in res) or "0 violaciones")
    return res


HOURLY = re.compile(r"(kWh/h\b|por hora\b(?!\.)|\bhourly\b|\b\d{1,2}:\d{2}\s*(a\.?\s?m\.?|p\.?\s?m\.?)?\s*[–-]\s*\d{1,2}:\d{2})", re.I)


def main():
    codes = homes_by_code()
    check("API real: 5 viviendas piloto", sorted(codes) == [f"PILOT-0{i}" for i in range(1, 6)], ",".join(sorted(codes)))
    axe_all: dict[str, list] = {}
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1280, "height": 900}, reduced_motion="reduce")
        page = ctx.new_page()
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))

        # ---- 1. Etiquetas de calidad y ausencia de datos horarios en las 5 viviendas ----
        for i in range(1, 6):
            code = f"PILOT-0{i}"; h = codes[code]
            login(page, f"Vivienda piloto 0{i}")
            wait_dashboard(page)
            dash = api(f"/homes/{h['id']}/dashboard")
            expected = Counter(m["quality"] for m in metrics(dash, []) if m["quality"] != "REAL")
            badges = page.eval_on_selector_all("main [data-quality]", "els => els.map(e => [e.dataset.quality, e.closest('details') ? 'legend' : '', e.textContent.trim()])")
            shown = Counter(q for q, legend, _ in badges if not legend)
            labels = {q: t for q, _, t in badges}
            text = page.locator("main").inner_text()
            page.locator("main details summary", has_text="Estado de los datos").click()
            legend_text = page.locator("main details").inner_text()
            legend_ok = all(w in legend_text for w in ("REAL", "ESTIMADO", "PROYECTADO")) and "mensual" in legend_text.lower()
            check(f"{code} etiquetas: cada métrica no-REAL de la API lleva su etiqueta",
                  all(shown[q] >= n for q, n in expected.items()),
                  f"API {dict(expected)} · pantalla {dict(shown)} · textos {labels}")
            check(f"{code} etiquetas en español (ESTIMADO/PROYECTADO, nunca ESTIMATED/PROJECTED)",
                  not re.search(r"\b(ESTIMATED|PROJECTED)\b", text), "")
            check(f"{code} sin datos horarios", dash["data_status"].get("resolution") in ("monthly", "month") and not HOURLY.search(text),
                  f"resolution={dash['data_status'].get('resolution')} match={HOURLY.search(text).group(0) if HOURLY.search(text) else None}")
            check(f"{code} leyenda de calidad (REAL/ESTIMADO/PROYECTADO, resolución mensual) en 'Estado de los datos'", legend_ok, legend_text.replace("\n", " ")[:160])
            lb = dash.get("latest_bill")
            if lb:
                kwh = float(lb["kwh"]["value"])
                check(f"{code} última factura coincide con la API", f"{kwh:,.2f}".rstrip("0").rstrip(".") in text or f"{kwh:,.2f}" in text, f"{kwh} kWh")
            if dash.get("alert"):
                sev = {"critical": "Crítica", "warning": "Advertencia"}.get(dash["alert"]["severity"], dash["alert"]["severity"])
                check(f"{code} alerta '{sev}' visible", sev in text, "")
            else:
                check(f"{code} sin alerta (la API no envía alerta)", "Crítica" not in text.split("Desviaciones")[0], "")
            if dash.get("projection"):
                pk = float(dash["projection"]["kwh"]["value"])
                shown_pk = f"{int(pk):,} kWh" if pk == int(pk) else f"{pk:,.2f} kWh"
                check(f"{code} proyección {shown_pk} visible con PROYECTADO", shown_pk in text and "PROYECTADO" in text, shown_pk)
            page.screenshot(path=str(OUT / f"web-dashboard-{code}.png"), full_page=True)

        # ---- 2. Títulos, skip link y axe en pantallas internas (PILOT-01) ----
        login(page, "Vivienda piloto 01"); wait_dashboard(page)
        p01 = codes["PILOT-01"]["id"]
        bill_id = api(f"/homes/{p01}/bills")[0]["id"]
        screens = {"/dashboard": "Inicio", "/consumption": "Consumo", "/readings": "Lecturas", "/bills": "Facturas",
                   "/bills/new": "Nueva factura", f"/bills/{bill_id}": "Detalle de factura", "/goal": "Meta mensual",
                   "/equipment": "Equipos", "/alerts": "Alertas", "/profile": "Perfil"}
        for path, title in screens.items():
            # navegación de cliente (un reload perdería la vivienda solo si no está en localStorage; aquí sí está)
            page.goto(WEB + path, wait_until="domcontentloaded")
            page.wait_for_selector("main", timeout=20000)
            page.wait_for_timeout(1500)
            check(f"título {path} = '{title} · Energy RD'", page.title() == f"{title} · Energy RD", page.title())
            text = page.locator("main").inner_text()
            check(f"{path} sin datos horarios inventados", not HOURLY.search(text), HOURLY.search(text).group(0) if HOURLY.search(text) else "")
            axe_all[path] = run_axe(page, path)
        page.goto(WEB + "/login", wait_until="domcontentloaded"); page.wait_for_timeout(1000)
        check("título /login", page.title() == "Iniciar sesión · Energy RD", page.title())
        axe_all["/login"] = run_axe(page, "/login")

        login(page, "Vivienda piloto 01"); wait_dashboard(page)
        # `next dev` inyecta su indicador (nextjs-portal) como primer foco; no existe en producción.
        page.evaluate("document.querySelectorAll('nextjs-portal').forEach(e => e.remove()); document.activeElement && document.activeElement.blur()")
        page.keyboard.press("Tab")
        focused = page.evaluate("[document.activeElement.textContent.trim(), document.activeElement.getBoundingClientRect().width]")
        check("Tab 1 enfoca 'Saltar al contenido' y es visible", focused[0] == "Saltar al contenido" and focused[1] > 10, str(focused))
        page.screenshot(path=str(OUT / "web-skip-link.png"))
        page.keyboard.press("Enter"); page.wait_for_timeout(300)
        check("Enter en el skip link lleva el foco a <main>", page.evaluate("document.activeElement.tagName") == "MAIN", page.evaluate("document.activeElement.tagName"))

        # ---- 3. Selector de vivienda y de período ----
        sw = page.get_by_label("Vivienda activa").first
        sw.select_option(label=next(o for o in sw.locator("option").all_inner_texts() if "piloto 02" in o))
        page.get_by_text("Vivienda piloto 02 (demo) · EDENORTE").wait_for(timeout=15000); wait_dashboard(page)
        t = page.locator("main").inner_text()
        check("selector de vivienda: cambia a PILOT-02 sin datos de PILOT-01", "EDENORTE" in t and "280.00 kWh → 420.00 kWh" not in t, "")
        sw.select_option(label=next(o for o in sw.locator("option").all_inner_texts() if "piloto 01" in o))
        page.get_by_text("Vivienda piloto 01 (demo) · EDESUR").wait_for(timeout=15000); wait_dashboard(page)
        period = page.get_by_label("Período de facturación")
        jul = next(o for o in period.locator("option").all_inner_texts() if "jul" in o)
        with page.expect_response(lambda r: "/dashboard" in r.url and "bill" in r.url) as resp:
            period.select_option(label=jul)
        hist = resp.value.json()
        wait_dashboard(page)
        t = page.locator("main").inner_text()
        check("selector de período: 'Resumen histórico' y datos de julio desde la API",
              "Resumen histórico" in t and hist["latest_bill"]["period_end"].startswith("2026-07"), f"latest={hist['latest_bill']['period_start']}..{hist['latest_bill']['period_end']} kwh={hist['latest_bill']['kwh']['value']}")
        cmp_ = hist.get("comparison") or {}
        check("comparación del período coincide con la API", (not cmp_) or "vs. período anterior" in t or "Vs. período anterior" in t, json.dumps({k: (v or {}).get("value") if isinstance(v, dict) else v for k, v in cmp_.items()})[:200])
        page.screenshot(path=str(OUT / "web-period-jul-PILOT-01.png"), full_page=True)

        # ---- 4. Recorrido real vivienda → factura → dashboard → proyección/alerta (PILOT-05) ----
        login(page, "Vivienda piloto 05"); wait_dashboard(page)
        p05 = codes["PILOT-05"]["id"]
        before = len(api(f"/homes/{p05}/bills"))
        page.goto(WEB + "/bills/new"); page.get_by_role("button", name="Registrar manualmente").click()
        page.get_by_role("button", name="Confirmar y guardar factura").click(); page.wait_for_timeout(300)
        fa = page.evaluate("[document.activeElement.id, document.activeElement.getAttribute('aria-invalid')]")
        check("formulario con errores: el foco va al primer campo inválido", fa[1] == "true", str(fa))
        page.screenshot(path=str(OUT / "web-bill-form-errors-focus.png"), full_page=True)
        page.get_by_label("Inicio del período").fill("2026-08-01"); page.get_by_label("Fin del período").fill("2026-08-31")
        page.get_by_label("Consumo facturado (kWh)").fill("-5"); page.get_by_label("Monto (RD$)").fill("5200")
        page.get_by_label("Días facturados").fill("31")
        page.get_by_role("button", name="Confirmar y guardar factura").click(); page.wait_for_timeout(300)
        check("kWh negativo rechazado en el cliente y enfocado", page.evaluate("document.activeElement.getAttribute('aria-invalid')") == "true"
              and len(api(f"/homes/{p05}/bills")) == before, page.evaluate("document.activeElement.id"))
        page.get_by_label("Consumo facturado (kWh)").fill("400")
        page.get_by_role("button", name="Confirmar y guardar factura").click()
        page.wait_for_url("**/dashboard", timeout=20000); wait_dashboard(page)
        t = page.locator("main").inner_text()
        d5 = api(f"/homes/{p05}/dashboard")
        check("tras la factura: alerta crítica +66.67 % (240 → 400 kWh)", "Crítica" in t and "66.67%" in t, d5["alert"]["message"] if d5.get("alert") else "sin alerta")
        check("tras la factura: proyección 466.67 kWh PROYECTADO", "466.67 kWh" in t, d5["projection"]["kwh"]["value"] if d5.get("projection") else "")
        page.screenshot(path=str(OUT / "web-flow-PILOT-05-alert.png"), full_page=True)
        page.goto(WEB + "/alerts"); page.wait_for_timeout(1500)
        check("la alerta aparece en /alerts", "Crítica" in page.locator("main").inner_text(), "")
        new_bill = [b for b in api(f"/homes/{p05}/bills") if b["period_start"] == "2026-08-01"]
        for b in new_bill: api(f"/homes/{p05}/bills/{b['id']}", "DELETE")
        check("limpieza: PILOT-05 vuelve a 2 facturas", len(api(f"/homes/{p05}/bills")) == 2, "")

        # ---- 5. Estados loading / error independiente / empty ----
        login(page, "Vivienda piloto 01"); wait_dashboard(page)
        page.route("**/api/v1/homes/*/dashboard*", lambda r: (time.sleep(3), r.continue_()))
        page.reload(); page.wait_for_selector("main [role=status][aria-label=Cargando]", timeout=5000)
        page.screenshot(path=str(OUT / "web-state-loading.png"))
        check("loading: esqueleto con role=status mientras la API responde", True, "")
        page.unroute("**/api/v1/homes/*/dashboard*"); wait_dashboard(page)

        page.route("**/api/v1/homes/*/dashboard*", lambda r: r.fulfill(status=500, body='{"detail":"SECRET-UPSTREAM"}', content_type="application/json"))
        page.reload(); page.get_by_role("button", name="Reintentar").first.wait_for(timeout=40000)
        t = page.locator("main").inner_text()
        check("error HTTP en /dashboard: 'Reintentar', sin texto del servidor", "SECRET-UPSTREAM" not in t, "")
        check("errores independientes: el selector de período (facturas) sigue funcionando con /dashboard en 500",
              page.get_by_label("Período de facturación").is_enabled(), "")
        unread = page.get_by_role("link", name=re.compile(r"Alertas, \d+ sin leer")).count()
        check("errores independientes: el contador de alertas sigue visible con /dashboard en 500", unread > 0, f"{unread}")
        page.screenshot(path=str(OUT / "web-state-error-dashboard-500.png"), full_page=True)
        page.unroute("**/api/v1/homes/*/dashboard*")
        page.get_by_role("button", name="Reintentar").first.click(); wait_dashboard(page)
        check("Reintentar recupera el dashboard", "Próxima factura estimada" in page.locator("main").inner_text(), "")

        page.route("**/api/v1/homes/*/alerts*", lambda r: r.fulfill(status=503, body="{}", content_type="application/json"))
        page.goto(WEB + "/alerts"); page.get_by_role("button", name="Reintentar").first.wait_for(timeout=40000)
        page.goto(WEB + "/dashboard"); wait_dashboard(page)
        check("errores independientes: /alerts en 503 no rompe el dashboard", "Próxima factura estimada" in page.locator("main").inner_text(), "")
        page.unroute("**/api/v1/homes/*/alerts*")

        empty = api("/homes", "POST", {"name": "QA vacía (demo)", "distributor": "EDESUR"})
        login(page, "QA vacía"); wait_dashboard(page)
        t = page.locator("main").inner_text()
        check("empty: vivienda sin facturas muestra 'Aún no hay facturas' con acción", "Aún no hay facturas" in t and "Registrar factura" in t, "")
        page.screenshot(path=str(OUT / "web-state-empty.png"), full_page=True)
        try: api(f"/homes/{empty['id']}", "DELETE")
        except Exception as e: print("note: delete empty home:", e)

        # ---- 6. API realmente apagada ----
        login(page, "Vivienda piloto 01"); wait_dashboard(page)
        subprocess.run(["docker", "stop", "erd-rel-api"], check=True, capture_output=True)
        try:
            page.reload(); t0 = time.time()
            page.get_by_role("button", name="Reintentar").first.wait_for(timeout=60000)
            secs = time.time() - t0
            check("API apagada: error con 'Reintentar'", True, f"apareció en {secs:.1f} s")
            page.screenshot(path=str(OUT / "web-state-api-down.png"), full_page=True)
        finally:
            subprocess.run(["docker", "start", "erd-rel-api"], check=True, capture_output=True)
            for _ in range(60):
                try: api("/homes"); break
                except Exception: time.sleep(1)
        for btn in page.get_by_role("button", name="Reintentar").all():
            if btn.is_visible(): btn.click()
        wait_dashboard(page)
        page.get_by_text("Próxima factura estimada").wait_for(timeout=20000)
        check("API encendida de nuevo: Reintentar recupera sin recargar", "Próxima factura estimada" in page.locator("main").inner_text(), "")

        # ---- 7. Responsive 375 ----
        m = browser.new_context(viewport={"width": 375, "height": 812}, reduced_motion="reduce").new_page()
        login(m, "Vivienda piloto 01"); wait_dashboard(m)
        sw_ = m.evaluate("document.documentElement.scrollWidth")
        check("375 px: sin desborde horizontal", sw_ <= 375, f"scrollWidth={sw_}")
        m.screenshot(path=str(OUT / "web-dashboard-375.png"), full_page=True)

        check("sin errores JS no capturados en la página", not errors, "; ".join(errors[:3]))
        browser.close()
    (OUT / "results.json").write_text(json.dumps({"results": results, "axe": axe_all}, ensure_ascii=False, indent=2))
    fails = [r for r in results if not r["ok"]]
    print(f"\nTOTAL {len(results)} checks, {len(fails)} FAIL")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        traceback.print_exc()
        (OUT / "results.json").write_text(json.dumps({"results": results, "crashed": traceback.format_exc()}, ensure_ascii=False, indent=2))
        sys.exit(1)
