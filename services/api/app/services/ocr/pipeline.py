"""ERD-OCR-PROD: de los bytes de un original (imagen o PDF multipágina) al texto que lee el parser. Sin BD ni FastAPI.

- Imágenes (JPEG/PNG/WEBP/HEIC): se corrige la orientación EXIF, se limita el tamaño y se lee con el motor OCR.
- PDF: por página se usa la capa de texto si existe (las facturas electrónicas la traen: exacto y sin OCR) y si no, se
  renderiza la página y se lee con el motor. Se leen como máximo `OCR_MAX_PDF_PAGES` páginas.
- El motor es intercambiable (`OcrEngine`); hoy solo Tesseract local, sin enviar la factura a terceros.
"""
import io
import time
from dataclasses import dataclass
from typing import Protocol

import pillow_heif
import pypdfium2 as pdfium
import pytesseract
from PIL import Image, ImageOps, UnidentifiedImageError

from app.config import settings
from app.services.ocr import preprocess

pillow_heif.register_heif_opener()
MAX_SIDE_PX = 4000
MIN_TEXT_LAYER_CHARS = 80
PDF_RENDER_SCALE = 2.5  # ≈ 180 dpi sobre una página carta


class UnreadableDocument(Exception):
    """El archivo no se puede leer y reintentar no lo arregla. `code`: unreadable | protected_pdf."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


class EngineError(Exception):
    """Fallo del motor (proceso caído, tiempo agotado): puede ser transitorio, se reintenta."""


class OcrEngine(Protocol):
    name: str

    def read_image(self, image: Image.Image) -> str: ...


GOOD_ENOUGH_SCORE = 6   # de 7 campos clave leídos: no hace falta probar más variantes
BUDGET_FRACTION = 0.8   # del tiempo máximo por página; el resto es margen para no chocar con el límite duro


class TesseractEngine:
    name = "tesseract"

    def _run(self, image: Image.Image, psm: int, timeout: float) -> str:
        try:
            return pytesseract.image_to_string(image, lang="spa+eng", config=f"--psm {psm}", timeout=max(1, int(timeout)))
        except (pytesseract.TesseractError, pytesseract.TesseractNotFoundError, RuntimeError, OSError) as exc:
            raise EngineError(type(exc).__name__) from exc

    def read_image(self, image: Image.Image) -> str:
        """Prueba variantes de imagen y modos de segmentación y devuelve la lectura con más campos clave. La primera
        variante debe terminar (si falla, el error se propaga y se reintenta); las siguientes solo mejoran el resultado."""
        budget = settings.OCR_PAGE_TIMEOUT_SECONDS * BUDGET_FRACTION
        started = time.monotonic()
        best, best_score = "", -1
        for index, (_name, psm, variant) in enumerate(preprocess.variants(image)):
            remaining = budget - (time.monotonic() - started)
            if index and remaining < 3:
                break
            try:
                text = self._run(variant, psm, remaining if index else settings.OCR_PAGE_TIMEOUT_SECONDS)
            except EngineError:
                if index == 0:
                    raise
                continue
            score = preprocess.score_text(text)
            if score > best_score or (score == best_score and len(text) > len(best)):
                best, best_score = text, score
            if best_score >= GOOD_ENOUGH_SCORE:
                break
        return best


@dataclass(frozen=True)
class Extracted:
    text: str
    method: str  # text_layer | ocr | mixed
    pages_read: int
    pages_total: int
    engine: str


def get_engine() -> OcrEngine:
    return TesseractEngine()


def _prepare(image: Image.Image) -> Image.Image:
    image = ImageOps.exif_transpose(image)
    if max(image.size) > MAX_SIDE_PX:
        image.thumbnail((MAX_SIDE_PX, MAX_SIDE_PX))
    return image.convert("L") if image.mode not in {"L", "RGB"} else image


def _from_image(content: bytes, engine: OcrEngine) -> Extracted:
    try:
        with Image.open(io.BytesIO(content)) as image:
            image.load()
            text = engine.read_image(_prepare(image))
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError, Image.DecompressionBombError) as exc:
        raise UnreadableDocument("unreadable", "No se pudo leer la imagen (formato no reconocido o archivo dañado)") from exc
    return Extracted(text, "ocr", 1, 1, engine.name)


def _from_pdf(content: bytes, engine: OcrEngine) -> Extracted:
    try:
        pdf = pdfium.PdfDocument(content)
    except pdfium.PdfiumError as exc:
        if "password" in str(exc).lower():
            raise UnreadableDocument("protected_pdf", "El PDF está protegido con contraseña") from exc
        raise UnreadableDocument("unreadable", "No se pudo leer el PDF (archivo dañado)") from exc
    try:
        total = len(pdf)
        if total == 0:
            raise UnreadableDocument("unreadable", "El PDF no tiene páginas")
        read = min(total, settings.OCR_MAX_PDF_PAGES)
        parts: list[str] = []
        used = set()
        for index in range(read):
            page = pdf[index]
            try:
                layer = page.get_textpage().get_text_range()
                if len("".join(layer.split())) >= MIN_TEXT_LAYER_CHARS:
                    parts.append(layer)
                    used.add("text_layer")
                    continue
                bitmap = page.render(scale=PDF_RENDER_SCALE)
                parts.append(engine.read_image(_prepare(bitmap.to_pil())))
                used.add("ocr")
            except pdfium.PdfiumError as exc:
                raise UnreadableDocument("unreadable", "No se pudo leer una página del PDF") from exc
            finally:
                page.close()
        method = "mixed" if len(used) > 1 else next(iter(used))
        return Extracted("\n\n".join(parts), method, read, total, engine.name if "ocr" in used else "pdf_text")
    finally:
        pdf.close()


def extract_document(content: bytes, content_type: str, engine: OcrEngine | None = None) -> Extracted:
    engine = engine or get_engine()
    if content_type == "application/pdf":
        return _from_pdf(content, engine)
    return _from_image(content, engine)
