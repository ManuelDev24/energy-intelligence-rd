"""Facturas SINTÉTICAS con la estructura y las etiquetas observadas en facturas reales de EDESUR, EDENORTE y EDEESTE.

Todo dato es inventado (nombres, cifras, fechas). Sirven para probar el lector de punta a punta con Tesseract real y para el
simulacro de despliegue local. No reemplazan facturas reales: reproducen lo que se SABE del diseño, no lo que no se ha visto."""
import io
import random
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

from PIL import Image, ImageChops, ImageDraw, ImageFilter

from tests.fonts import load_font

BLUE, YELLOW, WHITE = (157, 195, 230), (255, 217, 0), (255, 255, 255)


@dataclass(frozen=True)
class BillData:
    start: date
    end: date
    prev: int
    curr: int
    due: date
    cargo_fijo: Decimal = Decimal("137.25")

    @property
    def days(self) -> int:
        return (self.end - self.start).days

    @property
    def kwh(self) -> int:
        return self.curr - self.prev

    def tiers(self) -> list[tuple[int, Decimal, Decimal]]:
        first = min(self.kwh, 200)
        rest = self.kwh - first
        rows = [(first, Decimal("4.44"), Decimal(first) * Decimal("4.44"))] if first else []
        if rest:
            rows.append((rest, Decimal("6.97"), Decimal(rest) * Decimal("6.97")))
        return rows

    @property
    def total(self) -> Decimal:
        return (self.cargo_fijo + sum((t[2] for t in self.tiers()), Decimal(0))).quantize(Decimal("0.01"))


def expected(d: BillData) -> dict[str, str]:
    return {"period_start": d.start.isoformat(), "period_end": d.end.isoformat(), "days": str(d.days), "kwh": str(d.kwh),
            "amount_dop": f"{d.total:.2f}", "reading_previous": str(d.prev), "reading_current": str(d.curr),
            "due_date": d.due.isoformat()}


def _money(v: Decimal) -> str:
    return f"{v:,.2f}"


def _fmt(d: date) -> str:
    return d.strftime("%d/%m/%Y")


class _Canvas:
    def __init__(self, width: int, height: int, background=WHITE):
        self.scale = width / 768
        self.img = Image.new("RGB", (width, round(height * self.scale)), background)
        self.draw = ImageDraw.Draw(self.img)

    def font(self, size: float, bold=False):
        return load_font(max(8, round(size * self.scale)), bold=bold)

    def box(self, x0, y0, x1, y1, fill=None, outline=(30, 30, 30)):
        s = self.scale
        self.draw.rectangle([x0 * s, y0 * s, x1 * s, y1 * s], fill=fill, outline=outline, width=max(1, round(s)))

    def text(self, x, y, value, size=10, bold=False, fill=(0, 0, 0), anchor="la"):
        self.draw.text((x * self.scale, y * self.scale), value, font=self.font(size, bold), fill=fill, anchor=anchor)


def _edesur(c: _Canvas, d: BillData):
    c.text(40, 20, "EDESUR DOMINICANA, S.A.", 12, True)
    c.text(40, 40, "RNC: 1-00-00000-0", 9)
    c.text(600, 24, "Duplicado", 14)
    c.box(40, 70, 400, 170)
    c.text(50, 80, "REFERENCIA DE PAGO:  1000000001-10", 9)
    c.text(50, 100, "NCF:  B0200000001", 9)
    c.text(50, 120, f"FECHA DE EMISION:  {_fmt(d.end + timedelta(days=0))}", 9)
    c.text(50, 148, "FECHA LIMITE PAGO:", 10, True)
    c.text(280, 146, _fmt(d.due), 13, True)
    c.box(40, 200, 728, 250)
    c.text(50, 206, "DATOS DEL CONTRATO", 9, True)
    c.text(60, 224, "TARIFA", 8, True); c.text(60, 238, "BTS1", 9)
    c.text(200, 224, "VOLTAJE", 8, True); c.text(200, 238, "Baja 120/240 Doble Monofásica", 9)
    c.text(520, 224, "PERIODO DE FACTURACIÓN", 8, True)
    c.text(520, 238, f"{_fmt(d.start)} - {_fmt(d.end)} = {d.days} días", 9)
    c.box(40, 270, 380, 400)
    c.text(46, 276, "TIPO DE  No. DE   LECTURA   LECTURA   MULTIPLO CONSUMO", 7, True)
    c.text(46, 290, "LECTURA CONTADOR  ANTERIOR  ACTUAL", 7, True)
    c.text(46, 316, f"Activa B.T.   10203040   {d.prev:,}   {d.curr:,}   1.00   {d.kwh}kWh", 8)
    c.box(390, 270, 728, 560)
    c.text(400, 276, "CALCULO DE LA FACTURA", 9, True)
    c.text(400, 300, "Cargo fijo", 8, True)
    c.text(410, 314, f"{d.days} días", 8); c.text(580, 314, "RD$", 8); c.text(690, 314, _money(d.cargo_fijo), 8, anchor="ra")
    c.text(400, 340, "Energía", 8, True)
    y = 356
    for kwh, price, amount in d.tiers():
        c.text(410, y, f"{kwh} kWh x RD$ {price}", 8); c.text(580, y, "RD$", 8); c.text(690, y, _money(amount), 8, anchor="ra")
        y += 16
    c.text(400, 520, "IMPORTE TOTAL EN $RD", 8, True); c.text(720, 520, _money(d.total), 9, anchor="ra")
    c.text(400, 540, "FECHA LIMITE PAGO", 8, True); c.text(720, 540, _fmt(d.due), 9, anchor="ra")
    c.text(40, 600, "NOTIFICACIONES:", 8, True)
    c.text(400, 700, "REFERENCIA DE PAGO", 8, True); c.text(540, 700, "1000000001-10", 8)
    c.text(400, 720, "FECHA LIMITE DE PAGO", 8, True); c.text(540, 720, _fmt(d.due), 8)
    c.text(400, 740, "IMPORTE EN RD$", 9, True); c.text(540, 740, _money(d.total), 9)


def _edenorte(c: _Canvas, d: BillData):
    c.box(20, 20, 748, 1000, fill=BLUE, outline=(20, 90, 140))
    c.text(40, 40, "edenorte", 18, True, (20, 90, 140))
    c.text(520, 40, "CONTRATO :  1000001", 13, True)
    c.text(40, 100, "FECHA EMISION...........: " + _fmt(d.end), 8)
    c.text(520, 100, "No. Factura...........: 100000000001", 8)
    c.text(520, 118, "NCF: B0200000002", 8)
    c.text(520, 136, "Válida Hasta..........: 31/12/2999", 8)
    c.text(40, 230, "DATOS TECNICOS DEL SUMINISTRO", 9, True)
    c.text(40, 330, "TIPO DE    NO DE     LECTURA   LECTURA   MULTIPLO   CONSUMO", 7, True)
    c.text(40, 344, "LECTURA  CONTADOR  ANTERIOR  ACTUAL               PROMEDIADO", 7, True)
    c.text(280, 330, "DETALLE IMPORTES FACTURADOS", 11, True)
    c.text(40, 390, f"CONEXION                                                  {d.kwh}", 8)
    c.text(440, 392, f"No. De Días Facturados : {_fmt(d.start)} - {_fmt(d.end)} {d.days} días", 8)
    c.text(440, 420, "Cargo Fijo", 8, True)
    c.text(440, 434, f"{d.days} días, RD$ {d.cargo_fijo}", 8); c.text(690, 434, "RD$", 8); c.text(740, 434, _money(d.cargo_fijo), 8, anchor="ra")
    c.text(440, 460, "Energía", 8, True)
    y = 476
    for kwh, price, amount in d.tiers():
        c.text(440, y, f"{kwh} kWh X RD$   {price}", 8); c.text(690, y, "RD$", 8); c.text(740, y, _money(amount), 8, anchor="ra")
        y += 16
    c.text(440, 760, "FACTURADO DE MAY", 9, True); c.text(740, 760, f"RD${_money(d.total)}", 9, anchor="ra")
    c.text(440, 790, "PAGUE ANTES DE", 9, True); c.text(740, 790, _fmt(d.due), 9, anchor="ra")
    c.text(440, 860, "FACTURAS PENDIENTES AL " + _fmt(d.end) + "...: 0", 8)
    c.text(440, 880, f"VALOR TOTAL A PAGAR...: RD $ {_money(d.total + Decimal('647.85'))}", 8)


def _edeeste(c: _Canvas, d: BillData):
    c.box(40, 40, 400, 150, fill=BLUE)
    c.text(50, 50, "OFICINA: LAS AMERICAS", 8)
    c.text(50, 70, "REFERENCIA DE PAGO:   4000000001-16", 8)
    c.text(50, 90, f"FECHA DE EMISIÓN:   {_fmt(d.end)}", 8)
    c.box(40, 160, 400, 230, fill=YELLOW)
    c.text(50, 185, "FECHA LÍMITE DE PAGO:", 9, True); c.text(250, 183, _fmt(d.due), 14, True)
    c.box(420, 40, 728, 160, fill=BLUE)
    c.text(430, 50, "CONDICIÓN FISCAL:  Factura de Consumo", 8)
    c.text(430, 70, "NCF:  B0200000003", 8)
    c.text(430, 90, "FECHA VENCIMIENTO NCF:  31122024", 8)
    c.box(40, 300, 728, 360, fill=BLUE)
    c.text(50, 306, "DATOS DEL CONTRATO", 8, True)
    c.text(50, 326, "TARIFA", 7, True); c.text(50, 340, "BTS1", 8)
    c.text(520, 326, "PERIODO DE FACTURACIÓN", 7, True)
    c.text(520, 340, f"{_fmt(d.start)} - {_fmt(d.end)} = {d.days} días", 8)
    c.box(40, 380, 400, 480, fill=BLUE)
    c.text(46, 386, "TIPO DE LECTURA  NO. DE CONTADOR  LECTURA ANTERIOR  LECTURA ACTUAL  MÚLTIPLO  CONSUMO", 6, True)
    c.text(46, 420, f"Activa B.T.   30405060   {d.prev:,}   {d.curr:,}   1.0000   {d.kwh} kWh", 8)
    c.box(420, 380, 728, 560, fill=BLUE)
    c.text(430, 386, "CÁLCULO DE LA FACTURA", 8, True)
    c.text(430, 410, "Cargo fijo", 8, True)
    c.text(440, 424, f"{d.days} días, RD$ {d.cargo_fijo}", 8); c.text(640, 424, "RD$", 8); c.text(720, 424, _money(d.cargo_fijo), 8, anchor="ra")
    c.text(430, 450, "Energía", 8, True)
    y = 466
    for kwh, price, amount in d.tiers():
        c.text(440, y, f"{kwh} kWh x RD$ {price}/kWh", 8); c.text(640, y, "RD$", 8); c.text(720, y, _money(amount), 8, anchor="ra")
        y += 16
    c.text(430, 700, "IMPORTE TOTAL", 8, True); c.text(640, 700, "RD$", 8); c.text(720, 700, _money(d.total), 8, anchor="ra")
    c.text(430, 720, "FECHA LÍMITE DE PAGO", 8, True); c.text(720, 720, _fmt(d.due), 8, anchor="ra")
    c.text(430, 860, "REFERENCIA DE PAGO", 7, True); c.text(560, 860, "4000000001-16", 7)
    c.text(430, 880, "FECHA LÍMITE DE PAGO", 7, True); c.text(560, 880, _fmt(d.due), 7)
    c.text(430, 905, f"IMPORTE EN RD$  {_money(d.total)}", 10, True)


LAYOUTS = {"EDESUR": _edesur, "EDENORTE": _edenorte, "EDEESTE": _edeeste}


def render(distributor: str, data: BillData, width: int = 768) -> Image.Image:
    canvas = _Canvas(width, 1024)
    LAYOUTS[distributor](canvas, data)
    return canvas.img


def photoize(img: Image.Image, seed: int = 0, quality: int = 70) -> Image.Image:
    """Degradación tipo foto de celular: giro leve, desenfoque proporcional al tamaño, ruido, sombra y JPEG con pérdida.
    Pensada para imágenes de ~1800 px de ancho (una foto de celular real suele tener más, y más nítida)."""
    rng = random.Random(seed)
    out = img.rotate(rng.uniform(-1.6, 1.6), resample=Image.BICUBIC, expand=False, fillcolor=(235, 235, 235))
    out = out.filter(ImageFilter.GaussianBlur(rng.uniform(0.0007, 0.0011) * out.width))
    noise = Image.frombytes("L", out.size, rng.randbytes(out.width * out.height)).convert("RGB")  # ruido reproducible
    out = Image.blend(ImageChops.multiply(out, Image.new("RGB", out.size, (240, 240, 240))), noise, 0.07)
    shade = Image.linear_gradient("L").resize(out.size).rotate(rng.choice((0, 90, 180, 270)))  # sombra suave de un lado
    out = Image.composite(out, Image.new("RGB", out.size, (110, 110, 110)), shade.point(lambda p: 225 + p // 9))
    buf = io.BytesIO()
    out.save(buf, "JPEG", quality=quality)
    return Image.open(io.BytesIO(buf.getvalue())).convert("RGB")


def to_bytes(img: Image.Image, fmt: str = "PNG") -> bytes:
    buf = io.BytesIO()
    img.save(buf, fmt)
    return buf.getvalue()


SAMPLE = BillData(start=date(2026, 8, 12), end=date(2026, 9, 7), prev=4210, curr=4450, due=date(2026, 10, 7))
