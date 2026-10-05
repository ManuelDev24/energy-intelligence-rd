"""ERD-OCR-01: envoltorio delgado sobre Tesseract. Nunca toca la base de datos."""
import io

from PIL import Image, UnidentifiedImageError
import pytesseract

MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10MB: suficiente para una foto de factura, evita abuso


class UnreadableImage(ValueError):
    """La imagen no se pudo decodificar (no es jpeg/png válida, o está corrupta)."""


def extract_text(image_bytes: bytes, lang: str = "spa+eng") -> str:
    if not image_bytes:
        raise UnreadableImage("Archivo vacío")
    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            img.load()
            return pytesseract.image_to_string(img, lang=lang)
    except UnidentifiedImageError as exc:
        raise UnreadableImage("No se pudo leer la imagen (formato no reconocido o archivo corrupto)") from exc
