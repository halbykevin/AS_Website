"""Builds the website's brand assets from the desktop app's artwork (apps/desktop/assets).

Output goes to apps/website/public and is committed; re-run after the artwork changes:

    python tools/generate-website-brand.py      (needs Pillow)

- brand/logo-{light,dark}-{w}.webp  the lockup, sized for srcset. "dark" repaints the grey "Desk"
                                    wordmark near-white so it reads on the dark theme.
- brand/mark-{w}.webp               the AS + monitor mark on its own.
- favicon.ico, favicon-32.png, apple-touch-icon.png, icon-192.png, icon-512.png, og-image.png
"""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "apps/desktop/assets"
PUBLIC = ROOT / "apps/website/public"
BRAND = PUBLIC / "brand"

WHITE = (255, 255, 255, 255)
DARK_INK = (234, 241, 249)  # matches the site's dark-theme foreground


def trimmed(path: Path) -> Image.Image:
    """Crops to the artwork, ignoring the faint alpha noise around the edges."""
    image = Image.open(path).convert("RGBA")
    solid = image.getchannel("A").point(lambda a: 255 if a > 8 else 0)
    return image.crop(solid.getbbox())


def recolor_ink(image: Image.Image, rgb: tuple[int, int, int]) -> Image.Image:
    """Repaints the neutral grey wordmark, keeping the red and every pixel's alpha."""
    out = image.copy()
    pixels = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = pixels[x, y]
            if a and max(r, g, b) - min(r, g, b) < 48:
                pixels[x, y] = (*rgb, a)
    return out


def resize_width(image: Image.Image, width: int) -> Image.Image:
    return image.resize((width, round(image.height * width / image.width)), Image.LANCZOS)


def on_square(mark: Image.Image, size: int, padding: float, background=None) -> Image.Image:
    """Centers the mark in a square canvas with the given padding fraction."""
    canvas = Image.new("RGBA", (size, size), background or (0, 0, 0, 0))
    inner = round(size * (1 - 2 * padding))
    scale = inner / max(mark.width, mark.height)
    fitted = mark.resize((max(1, round(mark.width * scale)), max(1, round(mark.height * scale))), Image.LANCZOS)
    canvas.alpha_composite(fitted, ((size - fitted.width) // 2, (size - fitted.height) // 2))
    return canvas


def rounded_tile(size: int, radius: float) -> Image.Image:
    tile = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(tile).rounded_rectangle((0, 0, size - 1, size - 1), round(size * radius), fill=WHITE)
    return tile


def main() -> None:
    BRAND.mkdir(parents=True, exist_ok=True)
    logo = trimmed(ASSETS / "logo.png")
    mark = trimmed(ASSETS / "icon.png")
    logo_dark = recolor_ink(logo, DARK_INK)

    # Lockup: 1x/2x/3x of the largest display width (header ~92px, footer ~74px).
    for width in (96, 192, 288):
        resize_width(logo, width).save(BRAND / f"logo-light-{width}.webp", quality=92, method=6)
        resize_width(logo_dark, width).save(BRAND / f"logo-dark-{width}.webp", quality=92, method=6)
    for width in (32, 64, 96):
        resize_width(mark, width).save(BRAND / f"mark-{width}.webp", quality=92, method=6)

    # Browser and platform icons: the mark on a white rounded tile, like the desktop launcher icon.
    def tile_icon(size: int) -> Image.Image:
        tile = rounded_tile(size, 0.22)
        tile.alpha_composite(on_square(mark, size, 0.14))
        return tile

    tile_icon(256).save(PUBLIC / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    tile_icon(32).save(PUBLIC / "favicon-32.png", optimize=True)
    for size in (192, 512):
        tile_icon(size).save(PUBLIC / f"icon-{size}.png", optimize=True)
    # iOS rounds the corners itself and shows transparency as black, so this one is full-bleed white.
    on_square(mark, 180, 0.14, WHITE).convert("RGB").save(PUBLIC / "apple-touch-icon.png", optimize=True)

    # Social preview: the lockup on white with a brand-red base line.
    og = Image.new("RGBA", (1200, 630), WHITE)
    lockup = resize_width(logo, 560)
    og.alpha_composite(lockup, ((1200 - lockup.width) // 2, (630 - lockup.height) // 2 - 12))
    ImageDraw.Draw(og).rectangle((0, 610, 1200, 630), fill=(226, 1, 20, 255))
    og.convert("RGB").save(PUBLIC / "og-image.png", optimize=True)

    print(f"Brand assets written to {PUBLIC.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
