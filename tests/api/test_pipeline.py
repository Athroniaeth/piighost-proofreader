"""Tests for the async pipeline helpers and full pipeline generator."""

import json
from collections.abc import AsyncIterator
from pathlib import Path
from unittest.mock import AsyncMock, patch

import fitz

from proofreader.api.pipeline import deanonymize_mistake, locate_in_any_page, run_pipeline
from proofreader.models import Mistake
from proofreader.pdf_render import PdfDocument


def _parse_events(emitted: list[bytes]) -> list[dict]:
    events = []
    for chunk in emitted:
        text = chunk.decode("utf-8").strip("\n")
        lines = text.split("\n")
        name = lines[0].removeprefix("event: ")
        payload = json.loads(lines[1].removeprefix("data: "))
        events.append({"event": name, "data": payload})
    return events


async def _fake_stream(mistakes: list[Mistake]) -> AsyncIterator[Mistake]:
    for m in mistakes:
        yield m


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


async def test_run_pipeline_emits_meta_progress_mistake_done(tiny_pdf_bytes):
    fake_anon = AsyncMock()
    fake_anon.anonymize = AsyncMock(
        return_value="Voici un exemple simple avec une petite phrase."
    )
    fake_anon.deanonymize = AsyncMock(side_effect=lambda text, thread_id: text)

    raw_mistakes = [
        Mistake(
            error_text="exemple",
            correction="exemple correct",
            description="Démonstration.",
            type="orthographe",
            context_before="Voici un",
        )
    ]

    with patch(
        "proofreader.api.pipeline.stream_mistakes",
        return_value=_fake_stream(raw_mistakes),
    ), patch(
        "proofreader.api.pipeline.AnonymizationClient", return_value=fake_anon
    ):
        emitted = [
            chunk
            async for chunk in run_pipeline(
                pdf_bytes=tiny_pdf_bytes,
                filename="t.pdf",
                debug=False,
                piighost_api_url="http://piighost",
                litellm_model="gpt-4o-mini",
                litellm_api_key="x",
                litellm_api_base=None,
            )
        ]

    events = _parse_events(emitted)
    names = [e["event"] for e in events]
    assert names[0] == "meta"
    assert names.count("progress") == 3
    assert "mistake" in names
    assert names[-1] == "done"
    meta = events[0]["data"]
    assert meta["language"] == "fr"
    assert meta["page_count"] == 1
    assert meta["filename"] == "t.pdf"


async def test_run_pipeline_emits_debug_when_requested(tiny_pdf_bytes):
    fake_anon = AsyncMock()
    fake_anon.anonymize = AsyncMock(
        return_value="Voici un exemple simple avec une petite phrase."
    )
    fake_anon.deanonymize = AsyncMock(side_effect=lambda text, thread_id: text)

    with patch(
        "proofreader.api.pipeline.stream_mistakes",
        return_value=_fake_stream([]),
    ), patch(
        "proofreader.api.pipeline.AnonymizationClient", return_value=fake_anon
    ):
        emitted = [
            chunk
            async for chunk in run_pipeline(
                pdf_bytes=tiny_pdf_bytes,
                filename="t.pdf",
                debug=True,
                piighost_api_url="http://piighost",
                litellm_model="gpt-4o-mini",
                litellm_api_key="x",
                litellm_api_base=None,
            )
        ]

    events = _parse_events(emitted)
    names = [e["event"] for e in events]
    assert "debug" in names
    debug_payload = next(e["data"] for e in events if e["event"] == "debug")
    assert "markdown_raw" in debug_payload
    assert "markdown_anonymized" in debug_payload
    assert "word_stream" in debug_payload
