"""Tests for PyMuPDF page render and word stream extraction."""
from pathlib import Path

from proofreader.pdf_render import PdfDocument, Word


def test_word_stream_has_known_words(tiny_pdf_path: Path):
    doc = PdfDocument(tiny_pdf_path)
    words = doc.words(page_index=0)
    texts = [w.text for w in words]
    assert "exemple" in texts
    assert "phrase" in texts


def test_word_stream_bboxes_make_sense(tiny_pdf_path: Path):
    doc = PdfDocument(tiny_pdf_path)
    [first, *_] = doc.words(page_index=0)
    assert first.bbox[0] >= 0
    assert first.bbox[2] > first.bbox[0]


def test_render_page_returns_png_bytes(tiny_pdf_path: Path):
    doc = PdfDocument(tiny_pdf_path)
    png = doc.render_page(page_index=0)
    assert png.startswith(b"\x89PNG")


def test_render_is_cached(tiny_pdf_path: Path):
    doc = PdfDocument(tiny_pdf_path)
    first = doc.render_page(page_index=0)
    second = doc.render_page(page_index=0)
    assert first is second  # exact same bytes object → LRU hit


def test_page_size_returns_pdf_points(tiny_pdf_path: Path):
    doc = PdfDocument(tiny_pdf_path)
    width, height = doc.page_size(page_index=0)
    assert width > 0
    assert height > 0
