"""ERD-OCR-REAL-QA: variantes de imagen para Tesseract. Solo Pillow (sin numpy ni OpenCV), sin BD ni FastAPI.

Medido con 3 facturas reales de 2019–2024 (muestras públicas de 768×1024 px, una con fondos azul y amarillo): el texto
con el ajuste por defecto de Tesseract casi no salía (0–1 de 8 campos); con el canal de máximo brillo, ampliado y con
otro modo de segmentación salían 4–5 de 8 y ninguno mal. Ninguna variante gana siempre, así que se prueban en orden y
se queda la que mejor lee (`score_text`), con tope de tiempo.
"""
from collections.abc import Iterator

from PIL import Image, ImageChops, ImageFilter, ImageOps

TARGET_LONG_SIDE = 2600   # lado largo ideal para el motor: ampliar lo pequeño, no agrandar lo ya grande
MAX_UPSCALE = 3.0
# Segmentación de Tesseract: 4 = una columna de texto de tamaños variables, 6 = un bloque uniforme, 3 = automática.
PASSES = (("brillo", 4), ("brillo", 6), ("fondo plano", 4), ("brillo", 3))


def _brightness(image: Image.Image) -> Image.Image:
    """Canal de máximo brillo (HSV «V»): los fondos de color (azul, amarillo) quedan claros y el texto negro, oscuro."""
    if image.mode == "L":
        return image
    r, g, b = image.convert("RGB").split()
    return ImageChops.lighter(ImageChops.lighter(r, g), b)


def _scaled(gray: Image.Image) -> Image.Image:
    scale = min(MAX_UPSCALE, max(1.0, TARGET_LONG_SIDE / max(gray.size)))
    if scale > 1.05:
        gray = gray.resize((round(gray.width * scale), round(gray.height * scale)), Image.LANCZOS)
    return ImageOps.autocontrast(gray)


def _flatten(gray: Image.Image, radius: int = 30) -> Image.Image:
    """Resta el fondo desenfocado: iguala sombras y degradados de una foto (el fondo queda ~blanco, el texto oscuro)."""
    background = ImageChops.invert(gray.filter(ImageFilter.GaussianBlur(radius)))
    return ImageOps.autocontrast(ImageChops.add(gray, background))


def variants(image: Image.Image) -> Iterator[tuple[str, int, Image.Image]]:
    """(nombre, modo de segmentación, imagen) en el orden en que conviene probarlos; cada imagen se crea al pedirla."""
    base = _scaled(_brightness(image))
    flat: Image.Image | None = None
    for name, psm in PASSES:
        if name == "fondo plano":
            flat = flat or _flatten(base)
            yield name, psm, flat
        else:
            yield name, psm, base


def score_text(text: str) -> int:
    """Cuántos campos clave se leen (período, días, consumo, monto, fecha límite, lecturas), 0 a 7, menos 2 por cada contradicción. Sirve para elegir entre
    lecturas del mismo documento; no mide si los valores son correctos."""
    from app.services.ocr.parser import parse_bill_text
    draft = parse_bill_text(text)
    read = sum(1 for f in (draft.period_start, draft.days, draft.kwh, draft.amount_dop, draft.due_date,
                           draft.reading_previous, draft.reading_current) if f.value is not None)
    # Una lectura que se contradice (días que no cuadran con las fechas, lecturas absurdas) vale menos que una incompleta.
    contradictions = sum(1 for w in draft.warnings if "no coinciden" in w or "invertidas" in w or "menor que" in w or "corrigió" in w)
    return read - 2 * contradictions
