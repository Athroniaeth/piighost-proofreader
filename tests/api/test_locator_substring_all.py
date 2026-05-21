"""Tests for find_all_substring_spans (locator extension)."""

from pathlib import Path

import fitz

from proofreader.locator import find_all_substring_spans
from proofreader.pdf_render import PdfDocument


def test_finds_all_occurrences_in_word_stream(tmp_path: Path):
    pdf_path = tmp_path / "tiny.pdf"
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 100), "Pierre travaille avec Pierre dupont", fontsize=12)
    doc.save(pdf_path)
    doc.close()
    pdf = PdfDocument(pdf_path)
    words = list(pdf.words(0))

    hits = find_all_substring_spans(["Pierre"], words)
    assert len(hits) == 2
    # bboxes are positive and distinct
    assert hits[0][0].bbox != hits[1][0].bbox


def test_returns_empty_when_no_match(tmp_path: Path):
    pdf_path = tmp_path / "tiny.pdf"
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 100), "Hello world", fontsize=12)
    doc.save(pdf_path)
    doc.close()
    pdf = PdfDocument(pdf_path)
    words = list(pdf.words(0))

    assert find_all_substring_spans(["nope"], words) == []
