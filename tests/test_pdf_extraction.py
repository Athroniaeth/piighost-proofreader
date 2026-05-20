"""Tests for PDF → Markdown extraction via opendataloader-pdf."""
from pathlib import Path

import pytest

from proofreader.pdf_extraction import ExtractionError, extract_markdown


def test_extract_returns_non_empty_markdown(tiny_pdf_path: Path):
    markdown = extract_markdown(tiny_pdf_path)
    assert "exemple" in markdown.lower()
    assert "phrase" in markdown.lower()


def test_extract_raises_on_missing_file(tmp_path: Path):
    with pytest.raises(ExtractionError):
        extract_markdown(tmp_path / "nope.pdf")
