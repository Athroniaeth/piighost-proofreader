"""Shared test fixtures."""

from pathlib import Path

import fitz
import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
SAMPLES_DIR = REPO_ROOT / "samples"


@pytest.fixture
def samples_dir() -> Path:
    return SAMPLES_DIR


@pytest.fixture(scope="session")
def tiny_pdf_path(tmp_path_factory) -> Path:
    """Build a 1-page PDF with a known sentence, return the path.

    Uses ASCII-only text to avoid Unicode apostrophe drift between
    PyMuPDF writing and opendataloader-pdf reading.
    """
    pdf_path = tmp_path_factory.mktemp("pdfs") / "tiny.pdf"
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text(
        (72, 100),
        "Voici un exemple simple avec mot mot dans une phrase.",
        fontsize=12,
    )
    doc.save(pdf_path)
    doc.close()
    return pdf_path
