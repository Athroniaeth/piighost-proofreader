"""Tests for the async pipeline helpers."""

from pathlib import Path
from unittest.mock import AsyncMock

import fitz

from proofreader.api.pipeline import deanonymize_mistake, locate_in_any_page
from proofreader.models import Mistake
from proofreader.pdf_render import PdfDocument


async def test_deanonymize_mistake_calls_client_for_each_string_field():
    mistake = Mistake(
        error_text="<PERSON_1>",
        correction="<PERSON_1> correct",
        description="error involving <PERSON_1>",
        type="orthographe",
        context_before="around <PERSON_1>",
    )
    client = AsyncMock()
    client.deanonymize.side_effect = lambda text, thread_id: text.replace("<PERSON_1>", "Jean")

    out = await deanonymize_mistake(mistake, client=client, thread_id="t1")

    assert out.error_text == "Jean"
    assert out.correction == "Jean correct"
    assert out.description == "error involving Jean"
    assert out.context_before == "around Jean"
    assert client.deanonymize.await_count == 4


def test_locate_in_any_page_returns_first_match(tmp_path: Path):
    pdf_path = tmp_path / "tiny.pdf"
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 100), "Voici un exemple simple", fontsize=12)
    doc.save(pdf_path)
    doc.close()
    pdf = PdfDocument(pdf_path)
    all_words = {p: list(pdf.words(p)) for p in range(pdf.page_count)}

    mistake = Mistake(
        error_text="exemple",
        correction="exemple correct",
        description="x",
        type="orthographe",
        context_before="Voici un",
    )
    located = locate_in_any_page(mistake, all_words=all_words)
    assert located is not None
    assert located.page_index == 0
    assert located.bbox[0] > 0


def test_locate_in_any_page_returns_none_when_nothing_matches(tmp_path: Path):
    pdf_path = tmp_path / "tiny.pdf"
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 100), "Hello world", fontsize=12)
    doc.save(pdf_path)
    doc.close()
    pdf = PdfDocument(pdf_path)
    all_words = {p: list(pdf.words(p)) for p in range(pdf.page_count)}

    mistake = Mistake(
        error_text="nonexistent",
        correction="x",
        description="x",
        type="orthographe",
        context_before="not in pdf",
    )
    assert locate_in_any_page(mistake, all_words=all_words) is None
