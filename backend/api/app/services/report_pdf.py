"""ERD-RPT-01: PDF del informe energético (reportlab, solo fuentes estándar: sin descargas ni archivos externos).

Mismo contenido y mismas etiquetas de calidad que la vista web/móvil (`packages/core/src/report.ts`). Texto Latin-1 (á é ñ ¿ ¡ « » ·): por eso se
evitan símbolos fuera de WinAnsi (≈, −). Los textos que vienen de la persona (nombre de la vivienda, equipos, títulos) se escapan antes de pasar
por el mini-marcado de reportlab para que `<` y `&` no se interpreten como etiquetas.
"""
import io
from datetime import date
from decimal import Decimal
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.schemas.report import EnergyReportOut

MONTHS = ("ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic")
QUALITY_LABEL = {"REAL": "real", "ESTIMATED": "estimado", "PROJECTED": "proyectado"}
DIFFICULTY = {"easy": "Fácil de aplicar", "medium": "Esfuerzo medio", "hard": "Requiere más esfuerzo"}
IMPACT = {"low": "Impacto bajo", "medium": "Impacto medio", "high": "Impacto alto"}


def num(value, decimals: int = 2) -> str:
    n = Decimal(str(value))
    text = f"{abs(n):,.{decimals}f}"
    return f"-{text}" if n < 0 else text


def smart(value) -> str:
    n = Decimal(str(value))
    return num(n, 0 if n == n.to_integral_value() else 2)


def kwh(value) -> str:
    return f"{smart(value)} kWh"


def dop(value) -> str:
    return f"RD$ {num(value)}"


def pct(value) -> str:
    n = Decimal(str(value))
    return f"{'+' if n > 0 else '-' if n < 0 else ''}{num(abs(n))}%"


def day(d: date) -> str:
    return f"{d.day} {MONTHS[d.month - 1]} {d.year}"


def period(a: date, b: date) -> str:
    if a == b:
        return day(a)
    if a.year == b.year and a.month == b.month:
        return f"{a.day}-{b.day} {MONTHS[b.month - 1]} {b.year}"
    if a.year == b.year:
        return f"{a.day} {MONTHS[a.month - 1]} - {b.day} {MONTHS[b.month - 1]} {b.year}"
    return f"{day(a)} - {day(b)}"


def tag(quality: str) -> str:
    return "" if quality == "REAL" else f" ({QUALITY_LABEL[quality]})"


def sections(r: EnergyReportOut) -> list[tuple[str, list[tuple[str, str]], str | None]]:
    """(título, [(etiqueta, valor)], texto cuando no hay líneas)."""
    t = r.totals
    out: list[tuple[str, list[tuple[str, str]], str | None]] = []
    summary: list[tuple[str, str]] = []
    if t.kwh and t.amount_dop:
        summary = [("Facturas en el período", str(t.bills_count)), ("Consumo total", kwh(t.kwh.value)), ("Gasto total", dop(t.amount_dop.value))]
        if t.avg_price_per_kwh:
            summary.append(("Precio medio" + tag("ESTIMATED"), f"{dop(t.avg_price_per_kwh.value)} por kWh"))
        if t.avg_kwh_per_bill:
            summary.append(("Consumo medio por factura" + tag("ESTIMATED"), kwh(t.avg_kwh_per_bill.value)))
        if r.peak_bill:
            summary.append(("Factura de mayor consumo", f"{period(r.peak_bill.period_start, r.peak_bill.period_end)}: {kwh(r.peak_bill.kwh.value)}"))
    out.append(("Resumen", summary, "No hay facturas registradas en este período."))
    if r.comparison:
        c = r.comparison
        lines = [("Consumo anterior", kwh(c.previous_kwh.value))]
        if c.kwh_pct:
            lines.append(("Variación del consumo" + tag("ESTIMATED"), pct(c.kwh_pct.value)))
        lines.append(("Gasto anterior", dop(c.previous_amount_dop.value)))
        if c.amount_pct:
            lines.append(("Variación del gasto" + tag("ESTIMATED"), pct(c.amount_pct.value)))
        out.append((f"Frente al período anterior ({period(c.previous_from, c.previous_to)})", lines, None))
    if r.bills:
        out.append(("Facturas", [(period(b.period_start, b.period_end), f"{kwh(b.kwh.value)} · {dop(b.amount_dop.value)}") for b in r.bills], None))
    if r.equipment:
        out.append(("Equipos que más pesan (estimado)", [
            (f"{e.name} ({e.room})" if e.room else e.name, f"{num(e.share_pct.value, 0)} % · aprox. {kwh(e.monthly_kwh.value)} al mes") for e in r.equipment], None))
    if r.recommendations:
        out.append(("Cómo ahorrar (estimado)", [(x.title, " · ".join(p for p in (
            f"aprox. {kwh(x.savings_kwh_month.value)} al mes" if x.savings_kwh_month else None, DIFFICULTY[x.difficulty], IMPACT[x.impact] if x.impact else None) if p)) for x in r.recommendations], None))
    if r.goal:
        lines = []
        if r.goal.monthly_kwh:
            lines.append(("Meta de consumo", kwh(r.goal.monthly_kwh)))
        if r.goal.monthly_amount_rd:
            lines.append(("Meta de gasto", dop(r.goal.monthly_amount_rd)))
        out.append(("Tu meta mensual", lines, None))
    return out


def render_energy_report(r: EnergyReportOut) -> bytes:
    styles = getSampleStyleSheet()
    base = ParagraphStyle("base", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.5, leading=13)
    small = ParagraphStyle("small", parent=base, fontSize=8, leading=11, textColor=colors.HexColor("#4B5563"))
    h1 = ParagraphStyle("h1", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=18, leading=22, alignment=0, spaceAfter=2)
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=12, leading=15, spaceBefore=10, spaceAfter=4)
    place = ", ".join(p for p in (r.home.municipality, r.home.province) if p)
    story: list = [
        Paragraph("Informe energético", h1),
        Paragraph(escape(f"{r.home.name} · {r.home.distributor}{' · ' + place if place else ''} · {period(r.period.period_from, r.period.period_to)}"), small),
        Spacer(1, 4 * mm),
    ]
    for title, lines, empty in sections(r):
        block: list = [Paragraph(escape(title), h2)]
        if lines:
            table = Table([[Paragraph(escape(a), base), Paragraph(escape(b), base)] for a, b in lines], colWidths=[85 * mm, 85 * mm])
            table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LINEBELOW", (0, 0), (-1, -1), 0.25, colors.HexColor("#E5E7EB")),
                                       ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2), ("ALIGN", (1, 0), (1, -1), "RIGHT")]))
            block.append(table)
        else:
            block.append(Paragraph(escape(empty or "Sin datos."), base))
        story.append(KeepTogether(block))
    if r.sources:
        story.append(Paragraph("Fuentes", h2))
        story += [Paragraph(escape(f"• {s.label} — {QUALITY_LABEL[s.quality]}"), base) for s in r.sources]
    story.append(Paragraph("Notas", h2))
    story += [Paragraph(escape(f"• {n}"), base) for n in r.notes]
    story += [Spacer(1, 4 * mm), Paragraph(escape(f"Generado el {day(r.generated_at.date())}. Las cifras marcadas como estimadas no son mediciones ni garantías."), small)]

    buffer = io.BytesIO()
    SimpleDocTemplate(buffer, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=16 * mm,
                      title="Informe energético", author="Energy RD", subject="Informe energético de la vivienda").build(story)
    return buffer.getvalue()
