"""Draw semi-transparent highlight rectangles over a rendered PDF page."""

from dataclasses import dataclass
from io import BytesIO

from PIL import Image, ImageDraw

ACTIVE_FILL = (255, 230, 0, 150)  # yellow, semi-transparent
INACTIVE_FILL = (235, 30, 30, 150)  # red, semi-transparent


@dataclass(frozen=True)
class HighlightSpec:
    bbox: tuple[float, float, float, float]  # (x0, y0, x1, y1) in PDF points
    is_active: bool


def overlay_highlights(
    page_png: bytes,
    *,
    page_width_pt: float,
    page_height_pt: float,
    highlights: list[HighlightSpec],
) -> bytes:
    """Return a PNG with all highlights painted over ``page_png``."""
    base = Image.open(BytesIO(page_png)).convert("RGBA")
    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    img_w, img_h = base.size
    sx = img_w / page_width_pt
    sy = img_h / page_height_pt
    for hi in highlights:
        x0, y0, x1, y1 = hi.bbox
        rect = (x0 * sx, y0 * sy, x1 * sx, y1 * sy)
        fill = ACTIVE_FILL if hi.is_active else INACTIVE_FILL
        draw.rectangle(rect, fill=fill)
    out = Image.alpha_composite(base, overlay).convert("RGB")
    buf = BytesIO()
    out.save(buf, format="PNG")
    return buf.getvalue()
