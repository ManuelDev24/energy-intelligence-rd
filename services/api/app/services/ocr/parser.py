"""ERD-OCR-01: extrae campos de factura de texto OCR con heurísticas en español (RD).

Regla del plan ("Nunca OCR -> DB"): esta función es PURA y de solo lectura de texto; nunca toca
la base de datos. Su salida es siempre un OcrDraft para que una persona confirme o corrija antes
de llamar al POST /bills ya existente (que es el único camino real hacia la base de datos).
Nunca lanza excepción: entrada rara o vacía siempre produce un draft con campos en None.
"""
import re
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation

from app.schemas.ocr import Confidence, OcrDraft, OcrField

_MONTHS = {"enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6, "julio": 7,
           "agosto": 8, "septiembre": 9, "setiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12}

# Fechas dd/mm/aaaa; las facturas de EDESUR a veces imprimen espacios ("16 /05 /2023").
_DATE_NUM = r"(\d{1,2})\s*[/\-]\s*(\d{1,2})\s*[/\-]\s*(\d{4})"
# Tesseract lee a veces «07/09/2019» como «07.09/2019»: en las líneas de período (que además exigen «= N días») se tolera el punto.
_DATE_LOOSE = r"(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{4})"
# Tesseract suele pegar ":" o "." a las fechas ("17/04/2023: - 16/05/2023").
_RANGE_SEP = r"[\s:.,]*(?:al|a|-|–)[\s:.,]*"
# Formato impreso por EDESUR/EDEESTE/EDENORTE: "17/04/2023 - 16/05/2023 = 29 días". Va en la fila de
# DATOS DEL CONTRATO, a veces en otra línea que la etiqueta "PERIODO DE FACTURACION".
# Ruido OCR habitual: "-" leído como "=", y "=" leído como ">" o perdido.
_RANGE_DAYS_RE = re.compile(
    rf"{_DATE_LOOSE}[\s:.,]*(?:al|a|-|–|=|>)[\s:.,]*{_DATE_LOOSE}[\s:.,]*[=>]?\s*(\d{{1,3}})[.,]?\s*d[ií1l]a[sz5]", re.IGNORECASE)
_PERIOD_RE = re.compile(
    rf"per[ií1]+[od]+o?(?:\s+de\s+(?:facturaci[oó]n|consumo|lectura))?\s*:?\s*(?:del?)?\s*"
    rf"{_DATE_NUM}{_RANGE_SEP}{_DATE_NUM}", re.IGNORECASE)
# Escalones de energía: "200 kWh X RD$ 4.44" (uno por escalón; se suman).
# "RD$" suele salir "RDS" y las cifras junto a «kWh» salen con letras parecidas: «108» → «1OB» (observado en una factura real).
_TIER_RE = re.compile(r"([\dOoIlB][\dOoIlB,]*)\s*k\s*w\s*h\s*[xX×*]\s*R[D0O]\s*[$S5]", re.IGNORECASE)
_OCR_DIGITS = str.maketrans("OoIlB", "00118")
_NUM_TOKEN_RE = re.compile(r"\d[\d,.]*")
# Columnas numéricas de la tabla de lecturas, en el orden en que aparezcan en el encabezado.
_TABLE_COLUMNS = {"meter": r"(?:no\.?\s*de\s*)?(?:contador|medidor)", "previous": r"lec\w{0,5}a\s*anterior",
                  "current": r"lec\w{0,5}a\s*actual", "multiplier": r"m[uú]ltiplo", "consumption": r"consumo"}
_ND = r"[^\d\n]"  # "no dígito" pero sin cruzar de línea (evita que \D arrastre números de otra línea)
_AMOUNT_RE = re.compile(rf"total[\s/._-]+a[\s/._-]+pagar{_ND}{{0,20}}?(\d[\d,. ]*\d)", re.IGNORECASE)
# Etiquetas observadas en facturas REALES (muestras públicas de 2019, 2020 y 2024):
#  - EDENORTE: «FACTURADO DE MAY  RD$616.77» es lo facturado del mes; «VALOR TOTAL A PAGAR» puede sumar balance pendiente.
#  - EDESUR/EDEESTE: «IMPORTE TOTAL [EN $RD]  1,262.23» en el cuadro y «IMPORTE EN RD$ 1,262.23» en el talón de pago.
_NUM = r"(\d[\d,. ]*\d)"  # solo espacios: un salto de línea nunca une cifras de líneas distintas
_FACTURADO_RE = re.compile(rf"facturado\s+de\s+[a-záéíóú]{{3,10}}\.?{_ND}{{0,12}}?{_NUM}", re.IGNORECASE)
_IMPORTE_RES = (
    re.compile(rf"(?<![a-z])importe\s*total(?:\s*en)?{_ND}{{0,12}}?{_NUM}", re.IGNORECASE),
    re.compile(rf"(?<![a-z])importe\s*en{_ND}{{0,10}}?{_NUM}", re.IGNORECASE),
)
# Etiquetas alternativas del total (SIN verificar con facturas reales; solo si falta lo anterior y siempre `inferred`).
# Nunca «subtotal», «total energía» ni «total impuestos»: no son el monto a pagar.
_AMOUNT_ALT_RES = tuple(
    re.compile(rf"(?<![a-z]){label}{_ND}{{0,20}}?{_NUM}", re.IGNORECASE)
    for label in (r"monto\s+a\s+pagar", r"valor\s+a\s+pagar", r"importe\s+a\s+pagar", r"total\s+(?:de\s+la\s+)?factura(?:do)?",
                  r"total\s+general", r"importe\s+total", r"monto\s+total", r"total\s+(?:a\s+)?cobrar"))
_KWH_RE = re.compile(rf"consum\w*{_ND}{{0,30}}?(\d[\d,.\s]*\d)\s*k\s*w\s*h", re.IGNORECASE)
_PREV_RE = re.compile(rf"lec\w{{0,5}}a\s*(?:anterior|previa){_ND}{{0,20}}?(\d[\d,.\s]*\d)", re.IGNORECASE)
_CURR_RE = re.compile(rf"lec\w{{0,5}}a\s*(?:actua\w*){_ND}{{0,20}}?(\d[\d,.\s]*\d)", re.IGNORECASE)


# ERD-ALERT-02: fecha límite de pago. Observadas en facturas reales: «FECHA LIMITE PAGO» (EDESUR), «FECHA LÍMITE DE PAGO»
# (EDEESTE) y «PAGUE ANTES DE» (EDENORTE). Las demás etiquetas siguen SIN verificar y solo se usan si faltan las anteriores.
# «FECHA VENCIMIENTO NCF» (EDEESTE) y «Válida hasta» (EDENORTE) son la vigencia del comprobante fiscal, NO la fecha de pago.
_DUE_PRIMARY_RE = re.compile(
    rf"(?:fecha\s+l[ií]mite(?:\s+de)?(?:\s+pago)?|pagu?e\s+antes\s+del?|pagar\s+antes\s+del?){_ND}{{0,12}}?{_DATE_NUM}", re.IGNORECASE)
_DUE_FALLBACK_RE = re.compile(
    rf"(?:fecha\s+de\s+vencimiento|fecha\s+vencimiento|vencimiento|vence(?:\s+el)?)(?!\s*(?:de\s+)?(?:del\s+)?n\W?c\W?f)"
    rf"{_ND}{{0,12}}?{_DATE_NUM}", re.IGNORECASE)


_EMISSION_RE = re.compile(rf"emisi[oó]n{_ND}{{0,12}}?{_DATE_NUM}", re.IGNORECASE)


def _repair_year(start: date, end: date, printed_days: int, anchor: date | None = None) -> tuple[date, date] | None:
    """Si el período no cuadra con los días impresos por un año mal leído (2024 → 2004), prueba cambiar solo el año de UNA
    fecha. Devuelve el par corregido únicamente si exactamente una opción cuadra; nunca adivina entre varias."""
    options: set[tuple[date, date]] = set()
    for year in {end.year, end.year - 1}:
        try:
            options.add((start.replace(year=year), end))
        except ValueError:
            pass
    for year in {start.year, start.year + 1}:
        try:
            options.add((start, end.replace(year=year)))
        except ValueError:
            pass
    this_year = date.today().year
    fits = [(s, e) for s, e in options if s < e and printed_days in ((e - s).days, (e - s).days + 1)
            and 2015 <= s.year <= this_year + 1 and 2015 <= e.year <= this_year + 1]
    if len(fits) == 1:
        return fits[0]
    if len(fits) > 1 and anchor is not None:
        # Varias opciones cuadran con los días: se queda la que termina más cerca de la fecha de emisión (si es clara).
        ranked = sorted(fits, key=lambda pair: abs((pair[1] - anchor).days))
        best, runner = abs((ranked[0][1] - anchor).days), abs((ranked[1][1] - anchor).days)
        if best <= 45 and runner - best >= 60:
            return ranked[0]
    return None


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


# Fila de la tabla de lecturas tal como la deja Tesseract: «Activa B.T. 15197994 4.971 5,205 1.00 234kWh». El separador de miles sale
# como punto o coma, el multiplicador y el consumo salen deformados («Lecco», «4AWRh»).
_ROW_RE = re.compile(r"ac\w{0,2}va\s*[bB8]\.?\s*[tT]\.?\s+(\d{6,9})\s+(\d{1,3}(?:[.,]\d{3})*|\d+)\s+(\d{1,3}(?:[.,]\d{3})*|\d+)\b", re.IGNORECASE)
MAX_PLAUSIBLE_DELTA_KWH = 20_000


def _reading_row(text: str) -> tuple[Decimal, Decimal] | None:
    """(lectura anterior, lectura actual) de la fila de lecturas, si ambas son coherentes (actual ≥ anterior y un salto plausible)."""
    m = _ROW_RE.search(text)
    if not m:
        return None
    prev, curr = (_num(m.group(i).replace(".", "").replace(",", "")) for i in (2, 3))
    if prev is None or curr is None or curr < prev or curr - prev > MAX_PLAUSIBLE_DELTA_KWH:
        return None
    return prev, curr


def _all_numbers(regex: re.Pattern[str], text: str) -> list[Decimal]:
    return [n for m in regex.finditer(text) if (n := _num(m.group(1))) is not None]


def _importe_numbers(text: str) -> tuple[list[Decimal], bool]:
    """Cifras tras «IMPORTE TOTAL / IMPORTE EN». Las facturas siempre imprimen dos decimales; si Tesseract pierde la coma y el
    punto («1,262.23» → «126223») se reinterpreta como centavos. Devuelve (valores, hubo_reinterpretación)."""
    values, fixed = [], False
    for rx in _IMPORTE_RES:
        for m in rx.finditer(text):
            raw = m.group(1).strip()
            n = _num(raw)
            if n is None:
                continue
            if re.fullmatch(r"\d{4,}", raw.replace(" ", "")):
                n, fixed = n / 100, True
            values.append(n)
    return values, fixed


_MONEY = r"\d[\d,]*\.\d{2}"
_TIER_AMOUNT_RE = re.compile(rf"\d[\dOoIlB,]*\s*k\s*w\s*h\s*[xX×*]\s*R[D0O]\s*[$S5][^\n]*?({_MONEY})\s*$", re.IGNORECASE | re.MULTILINE)
_CARGO_RE = re.compile(rf"cargo\s+fijo[^\n]*(?:\n[^\n]*)?", re.IGNORECASE)


def _concept_sum(text: str) -> Decimal | None:
    """Suma «cargo fijo + cada escalón de energía» tal como se imprime. En las 3 facturas reales vistas (EDESUR, EDENORTE, EDEESTE)
    esta suma coincide al centavo con el monto de la factura; sirve para CONFIRMAR o dudar de una lectura, no para cambiarla
    (otras facturas pueden traer más cargos). `None` si no se leyó el cargo fijo y al menos un escalón."""
    tiers = [_num(m.group(1)) for m in _TIER_AMOUNT_RE.finditer(text)]
    cargo_block = _CARGO_RE.search(text)
    if not tiers or any(v is None for v in tiers) or not cargo_block:
        return None
    window = [m for m in re.findall(_MONEY, cargo_block.group(0)) if not re.search(rf"k\s*w\s*h.*{re.escape(m)}", cargo_block.group(0), re.IGNORECASE)]
    cargo = _num(window[-1]) if window else None
    if cargo is None:
        return None
    return cargo + sum(tiers, Decimal(0))  # type: ignore[arg-type]


def _read_amount(text: str, warnings: list[str]) -> tuple[Decimal | None, Confidence]:
    """Monto de la factura. «FACTURADO DE <mes>» (EDENORTE) manda sobre «TOTAL A PAGAR», que puede incluir saldos anteriores;
    luego «TOTAL A PAGAR»; luego «IMPORTE TOTAL / IMPORTE EN» (EDESUR/EDEESTE: alta solo si dos lecturas independientes
    coinciden, porque Tesseract falla con cifras sueltas); por último etiquetas sin verificar (siempre `inferred`)."""
    billed = _all_numbers(_FACTURADO_RE, text)
    to_pay = _all_numbers(_AMOUNT_RE, text)
    if billed:
        if to_pay and to_pay[0] != billed[0]:
            warnings.append(f"El «total a pagar» ({to_pay[0]:.2f}) difiere de lo facturado en el mes ({billed[0]:.2f}); "
                            "suele incluir saldos anteriores. Se usó lo facturado del mes.")
        # Una sola lectura de cifras no basta para «alta»: la suma de los conceptos (`_cross_check_amount`) la confirma o la deja dudosa.
        return billed[0], "inferred"
    if to_pay:
        return to_pay[0], "high"
    importes, reinterpreted = _importe_numbers(text)
    if importes:
        top, votes = max(((v, importes.count(v)) for v in set(importes)), key=lambda item: (item[1], -importes.index(item[0])))
        if reinterpreted:
            warnings.append("El importe salió sin separadores decimales; se interpretó con dos decimales. Compárelo con la factura.")
        if votes >= 2 and not reinterpreted:
            return top, "high"
        if not reinterpreted:
            warnings.append("El importe se leyó una sola vez en la imagen; compárelo con la factura.")
        return importes[0], "inferred"
    for alt in _AMOUNT_ALT_RES:
        for n in _all_numbers(alt, text)[:1]:
            warnings.append("El total se leyó de una etiqueta distinta de «TOTAL A PAGAR»; compárelo con la factura.")
            return n, "inferred"
    warnings.append("No se encontró el monto total a pagar.")
    return None, "high"


def _cross_check_amount(text: str, amount: Decimal | None, conf: Confidence, warnings: list[str]) -> tuple[Decimal | None, Confidence]:
    total = _concept_sum(text)
    if total is None:
        return amount, conf
    if amount is None:
        warnings.append("El monto no se leyó; se calculó sumando el cargo fijo y la energía impresos. Compárelo con la factura.")
        return total, "inferred"
    if amount == total:  # exacto: una diferencia de un centavo suele ser un dígito mal leído
        return amount, "high"  # dos lecturas independientes (el total y los conceptos) coinciden
    warnings.append(f"El monto ({amount:.2f}) no coincide con la suma de los conceptos ({total:.2f}); revíselo contra la factura.")
    return amount, "inferred"


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
            em = _EMISSION_RE.search(text)
            fixed = _repair_year(period_start, period_end, int(explicit_days), _date_from_match(em.group(1, 2, 3)) if em else None)
            if fixed:
                period_start, period_end = fixed
                warnings.append(f"Se corrigió el año de una fecha para que el período coincida con los {int(explicit_days)} días "
                                "impresos; revise las fechas contra la foto.")
            else:
                warnings.append(f"Los {int(explicit_days)} días impresos no coinciden con las fechas leídas "
                                f"({elapsed} días); revise el período contra la foto.")
    if period_start and period_end:
        explicit = re.search(r"\((\d{1,3})\s*d[ií1l]a[sz5]\)", text, re.IGNORECASE)
        if explicit_days is not None:
            days_field = OcrField(value=str(int(explicit_days)), confidence="high")
        elif explicit:
            days_field = OcrField(value=explicit.group(1), confidence="high")
        else:
            days_field = OcrField(value=str((period_end - period_start).days + 1), confidence="inferred")

    due = None
    due_conf: Confidence = "high"
    m = _DUE_PRIMARY_RE.search(text)
    if m is None:
        m = _DUE_FALLBACK_RE.search(text)
        due_conf = "inferred"
    if m:
        due = _date_from_match(m.group(1, 2, 3))
        if due is not None and period_start and period_end:
            if not period_start <= due <= period_end + timedelta(days=120):
                warnings.append("La fecha límite de pago leída no es coherente con el período; revísela.")
                due = None
        elif due is not None:
            due_conf = "inferred"  # sin período con qué contrastarla
        if due is not None and due_conf == "high" and not (period_start and period_end):
            due_conf = "inferred"

    amount, amount_conf = _read_amount(text, warnings)
    amount, amount_conf = _cross_check_amount(text, amount, amount_conf, warnings)

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

    reading_conf: Confidence = "high"
    if prev is None and curr is None:
        row = _reading_row(text)
        if row:
            prev, curr, reading_conf = row[0], row[1], "inferred"
            if kwh is None:
                # Sin multiplicador legible se supone 1 (medidores residenciales de baja tensión); por eso solo `inferred`.
                kwh, kwh_conf = curr - prev, "inferred"
                warnings.append("El consumo se calculó con las lecturas de la tabla (multiplicador supuesto 1); compárelo con la factura.")

    if kwh is None:
        tiers = [_num(t.translate(_OCR_DIGITS)) for t in _TIER_RE.findall(text)]
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
        kwh=field(kwh, kwh_conf), amount_dop=field(amount, amount_conf),
        reading_previous=field(prev, reading_conf), reading_current=field(curr, reading_conf), due_date=field(due, due_conf),
        warnings=warnings, raw_text_excerpt=text.strip()[:500],
    )
