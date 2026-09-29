from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(r"C:\KURU")
ASSETS = ROOT / "assets"
FONT = r"C:\Windows\Fonts\yumindb.ttf"
BLACK = (0, 0, 0, 255)
WHITE = (255, 255, 255, 255)
MASTER = 512
GLYPH_RATIO = 0.70
PNG_SIZES = [16, 32, 64, 80, 128]


def border_for(size: int) -> int:
    """Keep the ring readable after LANCZOS downscale."""
    if size <= 16:
        return 72
    if size <= 32:
        return 56
    return 44


def glyph_stroke_for(size: int) -> int:
    """Mincho hairlines vanish below ~32px."""
    if size <= 16:
        return 14
    if size <= 32:
        return 8
    return 0


def render(border: int, stroke: int) -> Image.Image:
    im = Image.new("RGBA", (MASTER, MASTER), (0, 0, 0, 0))
    draw = ImageDraw.Draw(im)
    pad = round(MASTER * 0.02)
    draw.ellipse((pad, pad, MASTER - 1 - pad, MASTER - 1 - pad), fill=BLACK)
    inner = pad + border
    draw.ellipse((inner, inner, MASTER - 1 - inner, MASTER - 1 - inner), fill=WHITE)
    font = ImageFont.truetype(FONT, round(MASTER * GLYPH_RATIO))
    bbox = draw.textbbox((0, 0), "く", font=font, stroke_width=stroke)
    x = (MASTER - (bbox[2] - bbox[0])) / 2 - bbox[0]
    y = (MASTER - (bbox[3] - bbox[1])) / 2 - bbox[1] + MASTER * 0.02
    draw.text((x, y), "く", font=font, fill=BLACK, stroke_width=stroke, stroke_fill=BLACK)
    return im


KEYS = {(border_for(s), glyph_stroke_for(s)) for s in PNG_SIZES}
MASTERS = {key: render(*key) for key in KEYS}


def frame(size: int) -> Image.Image:
    return MASTERS[(border_for(size), glyph_stroke_for(size))].resize(
        (size, size), Image.Resampling.LANCZOS
    )


def main() -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)
    for size in PNG_SIZES:
        frame(size).save(ASSETS / f"icon-{size}.png")


if __name__ == "__main__":
    main()
