"""Shared fixtures for API tests."""

import fitz
import pytest


@pytest.fixture
def tiny_pdf_bytes() -> bytes:
    """An in-memory single-page PDF with a known sentence."""
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text(
        (72, 100),
        "Voici un exemple simple avec une petite phrase.",
        fontsize=12,
    )
    out = doc.tobytes()
    doc.close()
    return out


@pytest.fixture
def empty_pdf_bytes() -> bytes:
    """A PDF with no text layer (just an empty page)."""
    doc = fitz.open()
    doc.new_page()
    out = doc.tobytes()
    doc.close()
    return out
