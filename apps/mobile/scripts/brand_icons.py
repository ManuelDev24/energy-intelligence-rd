# Genera los íconos de la app desde el logo canónico (assets/brand/energy-rd-logo.png).
# Solo redimensiona y rellena el fondo blanco de las esquinas (fuera del cuadrado redondeado del
# logo) con el verde oscuro del propio logo: no recorta, recolorea ni redibuja el símbolo.
# Uso: uv run --with pillow python apps/mobile/scripts/brand_icons.py
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / "assets/brand/energy-rd-logo.png"
OUT = ROOT / "apps/mobile/assets"
BRAND_900 = (11, 43, 31)  # #0B2B1F, fondo del logo


def logo_on_brand() -> Image.Image:
    im = Image.open(SRC).convert("RGB")
    w, h = im.size
    # Flood-fill desde las 4 esquinas: solo afecta al blanco exterior conectado a cada esquina.
    for xy in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        ImageDraw.floodfill(im, xy, BRAND_900, thresh=60)
    return im


def main() -> None:
    base = logo_on_brand()

    # iOS / genérico: cuadrado completo (el sistema aplica su propia máscara).
    base.resize((1024, 1024), Image.LANCZOS).save(OUT / "icon.png", optimize=True)

    # Android adaptativo: el contenido debe caber en la zona segura (~66 %) porque el launcher
    # recorta en círculo/squircle. Fondo = mismo verde, así el borde del logo no se nota.
    canvas = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    fg = base.resize((680, 680), Image.LANCZOS).convert("RGBA")
    canvas.paste(fg, ((1024 - 680) // 2, (1024 - 680) // 2))
    canvas.save(OUT / "android-icon-foreground.png", optimize=True)
    Image.new("RGB", (1024, 1024), BRAND_900).save(OUT / "android-icon-background.png", optimize=True)

    # Splash: logo centrado; el color de fondo lo pone app.json.
    base.resize((512, 512), Image.LANCZOS).save(OUT / "splash-icon.png", optimize=True)

    # Favicon (Expo web).
    base.resize((48, 48), Image.LANCZOS).save(OUT / "favicon.png", optimize=True)

    for f in ["icon.png", "android-icon-foreground.png", "android-icon-background.png", "splash-icon.png", "favicon.png"]:
        p = OUT / f
        print(f, Image.open(p).size, f"{p.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
