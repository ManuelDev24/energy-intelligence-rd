from PIL import ImageFont

from tests.fonts import load_font


def test_ocr_test_fonts_are_bundled_and_render_text_on_any_os():
    for bold in (False, True):
        font = load_font(38, bold=bold)
        assert isinstance(font, ImageFont.FreeTypeFont)
        assert font.getbbox("EDESUR 123 RD$")[2] > 0
