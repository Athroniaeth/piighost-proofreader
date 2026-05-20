"""Tests for the PIL highlight overlay."""
from io import BytesIO

from PIL import Image

from proofreader.highlight import HighlightSpec, overlay_highlights


def _blank_png(width: int = 300, height: int = 200) -> bytes:
    buf = BytesIO()
    Image.new("RGB", (width, height), "white").save(buf, format="PNG")
    return buf.getvalue()


def test_overlay_returns_png_bytes():
    png = _blank_png()
    result = overlay_highlights(
        png,
        page_height_pt=200,
        page_width_pt=300,
        highlights=[HighlightSpec(bbox=(10, 10, 50, 30), is_active=True)],
    )
    assert result.startswith(b"\x89PNG")


def test_overlay_yellow_pixel_for_active():
    png = _blank_png()
    result = overlay_highlights(
        png,
        page_height_pt=200,
        page_width_pt=300,
        highlights=[HighlightSpec(bbox=(10, 10, 50, 30), is_active=True)],
    )
    img = Image.open(BytesIO(result)).convert("RGB")
    # bbox(10,10,50,30) in PDF points → roughly (10,10,50,30) px when page matches scale 1:1.
    # We just check that *some* pixel near the center is yellow-ish.
    r, g, b = img.getpixel((30, 20))
    assert r > 200 and g > 200 and b < 150  # yellow tint


def test_overlay_red_pixel_for_inactive():
    png = _blank_png()
    result = overlay_highlights(
        png,
        page_height_pt=200,
        page_width_pt=300,
        highlights=[HighlightSpec(bbox=(10, 10, 50, 30), is_active=False)],
    )
    img = Image.open(BytesIO(result)).convert("RGB")
    r, g, b = img.getpixel((30, 20))
    assert r > 200 and g < 150 and b < 150  # red tint
