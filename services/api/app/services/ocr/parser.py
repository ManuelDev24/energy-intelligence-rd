"""ERD-OCR-01: extrae campos de factura de texto OCR con heurísticas en español (RD).

Regla del plan ("Nunca OCR -> DB"): esta función es PURA y de solo lectura de texto; nunca toca
la base de datos. Su salida es siempre un OcrDraft para que una persona confirme o corrija antes
de llamar al POST /bills ya existente (que es el único camino real hacia la base de datos).
Nunca lanza excepción: entrada rara o vacía siempre produce un draft con campos en None.
"""
import re
from datetime import date
from decimal import Decimal, InvalidOperation

from app.schemas.ocr import Confidence, OcrDraft, OcrField

_MONTHS = {"enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6, "julio": 7,
           "agosto": 8, "septiembre": 9, "setiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12}

_DATE_NUM = r"(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})"
_PERIOD_RE = re.compile(
    rf"per[ií1]+[od]+o?\s*(?:del?)?\s*{_DATE_NUM}\s*(?:al|a|-|–)\s*{_DATE_NUM}", re.IGNORECASE)
_ND = r"[^\d\n]"  # "no dígito" pero sin cruzar de línea (evita que \D arrastre números de otra línea)
_AMOUNT_RE = re.compile(rf"total\s+a\s+pagar{_ND}{{0,20}}?(\d[\d,.\s]*\d)", re.IGNORECASE)
_KWH_RE = re.compile(rf"consum\w*{_ND}{{0,30}}?(\d[\d,.\s]*\d)\s*k\s*w\s*h", re.IGNORECASE)
_PREV_RE = re.compile(rf"lec\w{{0,5}}a\s*(?:anterior|previa){_ND}{{0,20}}?(\d[\d,.\s]*\d)", re.IGNORECASE)
_CURR_RE = re.compile(rf"lec\w{{0,5}}a\s*(?:actua\w*){_ND}{{0,20}}?(\d[\d,.\s]*\d)", re.IGNORECASE)


def _num(raw: str) -> Decimal | None:
    """'4,520.75' / '2 310.00' / '170' -> Decimal; nunca lanza."""
    cleaned = raw.strip().replace(" ", "").replace(",", "")
    try:
        return Decimal(cleaned)
    except InvalidOperation:
        return None


def _date_from_match(groups: tuple[str, ...]) -> date | None:
    d, m, y = groups[0], groups[1], groups[2]
    try:
        return date(int(y), int(m), int(d))
    except ValueError:
        return None


def parse_bill_text(text: str | None) -> OcrDraft:
    text = text or ""
    warnings: list[str] = []

    period_start = period_end = None
    m = _PERIOD_RE.search(text)
    if m:
        period_start = _date_from_match(m.group(1, 2, 3))
        period_end = _date_from_match(m.group(4, 5, 6))
    if period_start is None or period_end is None:
        warnings.append("No se encontró el período de la factura (fechas de inicio/fin).")
        period_start = period_end = None
    elif period_end < period_start:
        warnings.append("Las fechas del período están invertidas; revíselas manualmente.")
        period_start = period_end = None

    days_field = OcrField(value=None, confidence="none")
    if period_start and period_end:
        explicit = re.search(r"\((\d{1,3})\s*d[ií]as\)", text, re.IGNORECASE)
        if explicit:
            days_field = OcrField(value=explicit.group(1), confidence="high")
        else:
            days_field = OcrField(value=str((period_end - period_start).days + 1), confidence="inferred")

    amount = None
    m = _AMOUNT_RE.search(text)
    if m:
        amount = _num(m.group(1))
    if amount is None:
        warnings.append("No se encontró el monto total a pagar.")

    kwh = None
    m = _KWH_RE.search(text)
    if m:
        kwh = _num(m.group(1))
    if kwh is None:
        warnings.append("No se encontró el consumo en kWh.")

    prev = curr = None
    mp, mc = _PREV_RE.search(text), _CURR_RE.search(text)
    if mp:
        prev = _num(mp.group(1))
    if mc:
        curr = _num(mc.group(1))
    if prev is not None and curr is not None and curr < prev:
        warnings.append("La lectura actual es menor que la anterior (probable error de OCR); revise ambas.")
        prev = curr = None

    def field(value: Decimal | date | None, conf: Confidence = "high") -> OcrField:
        if value is None:
            return OcrField(value=None, confidence="none")
        return OcrField(value=value.isoformat() if isinstance(value, date) else f"{value:.2f}", confidence=conf)

    return OcrDraft(
        period_start=field(period_start), period_end=field(period_end), days=days_field,
        kwh=field(kwh), amount_dop=field(amount),
        reading_previous=field(prev), reading_current=field(curr),
        warnings=warnings, raw_text_excerpt=text.strip()[:500],
    )
