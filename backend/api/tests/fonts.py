"""Bundled fonts for synthetic OCR test images (test data only, not production OCR).

Pillow resolves bare font names like "DejaVuSans.ttf" only from OS font folders, so fixtures failed with
"cannot open resource" on macOS. Loading the vendored DejaVu 2.37 files by absolute path makes the generated
invoices identical on macOS, Linux CI and Docker.
"""
from pathlib import Path

from PIL import ImageFont

_ASSETS = Path(__file__).with_name("assets")


def load_font(size: int, *, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(_ASSETS / ("DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf")), size)
