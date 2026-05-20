"""PyMuPDF wrapper, renders pages and exposes the word stream."""
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import fitz


@dataclass(frozen=True)
class Word:
    """A single word with its bounding box on a page (in PDF points)."""

    text: str
    bbox: tuple[float, float, float, float]  # (x0, y0, x1, y1)
    page_index: int


class PdfDocument:
    """LRU-cached render + word stream around a single PDF file."""

    def __init__(self, pdf_path: Path, *, dpi: int = 150) -> None:
        self._pdf_path = pdf_path
        self._dpi = dpi
        self._doc = fitz.open(pdf_path)

    @property
    def page_count(self) -> int:
        return self._doc.page_count

    @lru_cache(maxsize=64)
    def render_page(self, page_index: int) -> bytes:
        page = self._doc.load_page(page_index)
        pix = page.get_pixmap(dpi=self._dpi)
        return pix.tobytes("png")

    @lru_cache(maxsize=64)
    def words(self, page_index: int) -> tuple[Word, ...]:
        page = self._doc.load_page(page_index)
        raw = page.get_text("words")  # list of (x0, y0, x1, y1, text, block, line, word_no)
        return tuple(
            Word(text=text, bbox=(x0, y0, x1, y1), page_index=page_index)
            for x0, y0, x1, y1, text, *_ in raw
        )

    def page_size(self, page_index: int) -> tuple[float, float]:
        """Return (width, height) of the page in PDF points."""
        page = self._doc.load_page(page_index)
        return (page.rect.width, page.rect.height)
