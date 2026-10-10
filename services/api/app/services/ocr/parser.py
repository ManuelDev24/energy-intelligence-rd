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

# Fechas dd/mm/aaaa; las facturas de EDESUR a veces imprimen espacios ("16 /05 /2023").
_DATE_NUM = r"(\d{1,2})\s*[/\-]\s*(\d{1,2})\s*[/\-]\s*(\d{4})"
# Tesseract suele pegar ":" o "." a las fechas ("17/04/2023: - 16/05/2023").
_RANGE_SEP = r"[\s:.,]*(?:al|a|-|–)[\s:.,]*"
# Formato impreso por EDESUR/EDEESTE/EDENORTE: "17/04/2023 - 16/05/2023 = 29 días". Va en la fila de
# DATOS DEL CONTRATO, a veces en otra línea que la etiqueta "PERIODO DE FACTURACION".
# Ruido OCR habitual: "-" leído como "=", y "=" leído como ">" o perdido.
_RANGE_DAYS_RE = re.compile(
    rf"{_DATE_NUM}[\s:.,]*(?:al|a|-|–|=|>)[\s:.,]*{_DATE_NUM}[\s:.,]*[=>]?\s*(\d{{1,3}})[.,]?\s*d[ií]as", re.IGNORECASE)
_PERIOD_RE = re.compile(
    rf"per[ií1]+[od]+o?(?:\s+de\s+(?:facturaci[oó]n|consumo|lectura))?\s*:?\s*(?:del?)?\s*"
    rf"{_DATE_NUM}{_RANGE_SEP}{_DATE_NUM}", re.IGNORECASE)
# Escalones de energía: "200 kWh X RD$ 4.44" (uno por escalón; se suman).
_TIER_RE = re.compile(r"(\d[\d,]*)\s*k\s*w\s*h\s*[xX×*]\s*RD\s*[$S5]", re.IGNORECASE)  # "RD$" suele salir "RDS"
_NUM_TOKEN_RE = re.compile(r"\d[\d,.]*")
# Columnas numéricas de la tabla de lecturas, en el orden en que aparezcan en el encabezado.
_TABLE_COLUMNS = {"meter": r"(?:no\.?\s*de\s*)?(?:contador|medidor)", "previous": r"lec\w{0,5}a\s*anterior",
                  "current": r"lec\w{0,5}a\s*actual", "multiplier": r"m[uú]ltiplo", "consumption": r"consumo"}
_ND = r"[^\d\n]"  # "no dígito" pero sin cruzar de línea (evita que \D arrastre números de otra línea)
_AMOUNT_RE = re.compile(rf"total[\s/._-]+a[\s/._-]+pagar{_ND}{{0,20}}?(\d[\d,.\s]*\d)", re.IGNORECASE)
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


def _reading_table(text: str) -> dict[str, Decimal] | None:
    """Tabla 'LECTURA ANTERIOR  LECTURA ACTUAL  MULTIPLO  CONSUMO' con los valores en la línea siguiente.

    Solo se usa si hay tantos números como columnas numéricas; si no, no se adivina.
    """
    lines = [ln for ln in text.splitlines() if ln.strip()]
    for i, line in enumerate(lines[:-1]):
        if not (re.search(_TABLE_COLUMNS["previous"], line, re.IGNORECASE)
                and re.search(_TABLE_COLUMNS["current"], line, re.IGNORECASE)) or re.search(r"\d", line):
            continue
        found = []
        for name, pattern in _TABLE_COLUMNS.items():
            col = re.search(pattern, line, re.IGNORECASE)
            if col:
                found.append((col.start(), name))
        columns = [name for _, name in sorted(found)]
        values = [_num(tok) for tok in _NUM_TOKEN_RE.findall(lines[i + 1])]
        if len(values) != len(columns) or any(v is None for v in values):
            return None
        return dict(zip(columns, values))  # type: ignore[arg-type]
    return None


def parse_bill_text(text: str | None) -> OcrDraft:
    text = text or ""
    warnings: list[str] = []

    period_start = period_end = None
    explicit_days = None
    m = _RANGE_DAYS_RE.search(text) or _PERIOD_RE.search(text)
    if m:
        period_start = _date_from_match(m.group(1, 2, 3))
        period_end = _date_from_match(m.group(4, 5, 6))
        if m.re is _RANGE_DAYS_RE:
            explicit_days = m.group(7)
    if period_start is None or period_end is None:
        warnings.append("No se encontró el período de la factura (fechas de inicio/fin).")
        period_start = period_end = None
    elif period_end < period_start:
        warnings.append("Las fechas del período están invertidas; revíselas manualmente.")
        period_start = period_end = None

    days_field = OcrField(value=None, confidence="none")
    period_conf: Confidence = "high"
    if period_start and period_end and explicit_days is not None:
        elapsed = (period_end - period_start).days
        # Las distribuidoras imprimen días transcurridos (29 del 17/04 al 16/05); se aceptan ambas convenciones.
        if int(explicit_days) not in (elapsed, elapsed + 1):
            period_conf = "inferred"
            warnings.append(f"Los {int(explicit_days)} días impresos no coinciden con las fechas leídas "
                            f"({elapsed} días); revise el período contra la foto.")
    if period_start and period_end:
        explicit = re.search(r"\((\d{1,3})\s*d[ií]as\)", text, re.IGNORECASE)
        if explicit_days is not None:
            days_field = OcrField(value=str(int(explicit_days)), confidence="high")
        elif explicit:
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
    kwh_conf: Confidence = "high"
    m = _KWH_RE.search(text)
    if m:
        kwh = _num(m.group(1))

    prev = curr = None
    mp, mc = _PREV_RE.search(text), _CURR_RE.search(text)
    if mp:
        prev = _num(mp.group(1))
    if mc:
        curr = _num(mc.group(1))

    table = _reading_table(text) if prev is None and curr is None else None
    if table and "previous" in table and "current" in table:
        t_prev, t_curr = table["previous"], table["current"]
        printed = table.get("consumption")
        delta = (t_curr - t_prev) * table.get("multiplier", Decimal(1))
        if printed is not None and delta != printed:
            warnings.append("Las lecturas no coinciden con el consumo impreso; revise lecturas y consumo.")
        else:
            prev, curr = t_prev, t_curr
            if kwh is None and printed is not None:
                kwh = printed

    if kwh is None:
        tiers = [_num(t) for t in _TIER_RE.findall(text)]
        if tiers and all(t is not None for t in tiers):
            kwh, kwh_conf = sum(tiers, Decimal(0)), "inferred"  # type: ignore[arg-type]
    if kwh is None:
        warnings.append("No se encontró el consumo en kWh.")
    if prev is not None and curr is not None and curr < prev:
        warnings.append("La lectura actual es menor que la anterior (probable error de OCR); revise ambas.")
        prev = curr = None

    def field(value: Decimal | date | None, conf: Confidence = "high") -> OcrField:
        if value is None:
            return OcrField(value=None, confidence="none")
        return OcrField(value=value.isoformat() if isinstance(value, date) else f"{value:.2f}", confidence=conf)

    return OcrDraft(
        period_start=field(period_start, period_conf), period_end=field(period_end, period_conf), days=days_field,
        kwh=field(kwh, kwh_conf), amount_dop=field(amount),
        reading_previous=field(prev), reading_current=field(curr),
        warnings=warnings, raw_text_excerpt=text.strip()[:500],
    )
