"""Builds the macOS app and menu bar icons from the desktop app's artwork (apps/desktop/assets).

Output is committed; re-run after the artwork changes:

    python tools/generate-macos-icons.py      (needs Pillow)

- apps/desktop/src-tauri/icons/icon.icns   the app icon on Apple's grid: a white rounded tile of
                                           824 px in a 1024 px canvas with the system's soft shadow,
                                           the mark inside it. ICNS holds 16 px to 1024 px.
- apps/desktop/assets/tray-template@2x.png the menu bar icon: the mark in black with alpha only, so
                                           macOS can draw it in the menu bar's own colour (a template
                                           image). 36 px tall = 18 pt at 2x.
- apps/desktop/assets/tray-sharing-mac@2x.png  the same size in brand colours with the orange "live"
                                           dot, shown while this Mac's screen is shared.
"""

from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "apps/desktop/assets"
ICONS = ROOT / "apps/desktop/src-tauri/icons"

WHITE = (255, 255, 255, 255)
LIVE = (245, 158, 11, 255)  # the orange dot of tray-sharing@2x.png


def trimmed(path: Path) -> Image.Image:
    """Crops to the artwork, ignoring the faint alpha noise around the edges."""
    image = Image.open(path).convert("RGBA")
    solid = image.getchannel("A").point(lambda a: 255 if a > 8 else 0)
    return image.crop(solid.getbbox())


def fit(mark: Image.Image, width: int, height: int) -> Image.Image:
    scale = min(width / mark.width, height / mark.height)
    return mark.resize((max(1, round(mark.width * scale)), max(1, round(mark.height * scale))), Image.LANCZOS)


def app_icon(mark: Image.Image) -> Image.Image:
    canvas = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    tile_box = (100, 100, 924, 924)
    radius = 185  # Apple's macOS 11+ template rounds the 824 px tile by about 22.5%
    # The template's shadow: black at 30%, blurred 28 px, 12 px down.
    shadow = Image.new("L", canvas.size, 0)
    ImageDraw.Draw(shadow).rounded_rectangle((tile_box[0], tile_box[1] + 12, tile_box[2], tile_box[3] + 12), radius, fill=77)
    canvas.putalpha(shadow.filter(ImageFilter.GaussianBlur(28)))
    ImageDraw.Draw(canvas).rounded_rectangle(tile_box, radius, fill=WHITE)
    inner = fit(mark, 824 - 2 * 120, 824 - 2 * 120)
    canvas.alpha_composite(inner, ((1024 - inner.width) // 2, (1024 - inner.height) // 2))
    return canvas


def template(mark: Image.Image) -> Image.Image:
    """Black, with the artwork's ink as alpha: red and dark pixels count, white and clear ones do not."""
    r, g, b, a = mark.split()
    ink = ImageChops.multiply(a, ImageChops.invert(ImageChops.darker(g, b)))
    return Image.merge("RGBA", (Image.new("L", mark.size, 0),) * 3 + (ink,))


def menu_bar(mark: Image.Image, live: bool) -> Image.Image:
    height = 36
    glyph = fit(mark, 64, 32)
    width = glyph.width + (10 if live else 4)
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    image.alpha_composite(glyph, (2, (height - glyph.height) // 2))
    if live:
        # The dot over the lower right, with a clear gap around it so it reads on any menu bar.
        d = 15
        x, y = width - d - 1, height - d - 2
        draw = ImageDraw.Draw(image)
        draw.ellipse((x - 2, y - 2, x + d + 2, y + d + 2), fill=(0, 0, 0, 0))
        draw.ellipse((x, y, x + d, y + d), fill=LIVE)
    return image


def main() -> None:
    mark = trimmed(ASSETS / "icon.png")
    app_icon(mark).save(ICONS / "icon.icns", format="ICNS")
    menu_bar(template(mark), live=False).save(ASSETS / "tray-template@2x.png", optimize=True)
    menu_bar(mark, live=True).save(ASSETS / "tray-sharing-mac@2x.png", optimize=True)
    print("macOS icons written to apps/desktop/src-tauri/icons and apps/desktop/assets")


if __name__ == "__main__":
    main()
