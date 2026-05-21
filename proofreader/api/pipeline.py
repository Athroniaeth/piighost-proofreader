"""Async streaming pipeline for the proofreading API."""

import asyncio
import tempfile
import uuid
from collections.abc import AsyncIterator
from pathlib import Path

import anyio.to_thread

from proofreader.anonymize import AnonymizationClient
from proofreader.api.errors import NoTextLayerError
from proofreader.api.sse import format_sse
from proofreader.language import detect_language
from proofreader.llm import stream_mistakes
from proofreader.locator import LocatedMistake, find_all_substring_spans, locate_mistake
from proofreader.models import Mistake
from proofreader.pdf_extraction import extract_markdown
from proofreader.pdf_render import PdfDocument, Word


async def deanonymize_mistake(
    mistake: Mistake, *, client: AnonymizationClient, thread_id: str
) -> Mistake:
    """Return a copy of ``mistake`` with all four text fields deanonymised.

    The four httpx round-trips run in parallel via asyncio.gather to keep
    the per-mistake latency close to a single round-trip.
    """
    error_text, correction, description, context_before = await asyncio.gather(
        client.deanonymize(mistake.error_text, thread_id=thread_id),
        client.deanonymize(mistake.correction, thread_id=thread_id),
        client.deanonymize(mistake.description, thread_id=thread_id),
        client.deanonymize(mistake.context_before, thread_id=thread_id),
    )
    return mistake.model_copy(
        update={
            "error_text": error_text,
            "correction": correction,
            "description": description,
            "context_before": context_before,
        }
    )


def locate_detection(text: str, *, all_words: dict[int, list[Word]]) -> list[dict]:
    """Return all (page, bbox) hits for `text` across the document.

    Each hit is a dict {page, bbox} suitable for JSON serialisation.
    """
    hits: list[dict] = []
    tokens = text.split()
    for page_index in sorted(all_words):
        for match in find_all_substring_spans(tokens, all_words[page_index]):
            if not match:
                continue
            x0 = min(w.bbox[0] for w in match)
            y0 = min(w.bbox[1] for w in match)
            x1 = max(w.bbox[2] for w in match)
            y1 = max(w.bbox[3] for w in match)
            hits.append({"page": page_index, "bbox": [x0, y0, x1, y1]})
    return hits


def locate_in_any_page(
    mistake: Mistake, *, all_words: dict[int, list[Word]]
) -> LocatedMistake | None:
    """Try every page in order and return the first match, or None."""
    for page_index in sorted(all_words):
        hit = locate_mistake(mistake, words=all_words[page_index])
        if hit is not None:
            return hit
    return None


async def run_pipeline(
    *,
    pdf_bytes: bytes,
    filename: str,
    debug: bool,
    piighost_api_url: str,
    litellm_model: str,
    litellm_api_key: str,
    litellm_api_base: str | None,
) -> AsyncIterator[bytes]:
    """Drive the proofreading pipeline and yield formatted SSE events.

    Raises NoTextLayerError if the PDF has no extractable text. All other
    in-stream failures are propagated as exceptions — the route wrapper
    converts them to `event: error` payloads.
    """
    thread_id = str(uuid.uuid4())

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as fp:
        fp.write(pdf_bytes)
        pdf_path = Path(fp.name)

    markdown = await anyio.to_thread.run_sync(extract_markdown, pdf_path)
    if not markdown.strip():
        raise NoTextLayerError("PDF has no extractable text")

    language = detect_language(markdown)
    doc = PdfDocument(pdf_path)
    all_words = {p: list(doc.words(p)) for p in range(doc.page_count)}
    page_sizes = [
        {"page": p, "width_pt": doc.page_size(p)[0], "height_pt": doc.page_size(p)[1]}
        for p in range(doc.page_count)
    ]

    yield format_sse(
        "meta",
        {
            "filename": filename,
            "language": language,
            "page_count": doc.page_count,
            "page_sizes": page_sizes,
            "thread_id": thread_id,
        },
    )
    yield format_sse("progress", {"step": "extracted"})

    client = AnonymizationClient(base_url=piighost_api_url)
    anonymized = await client.anonymize(markdown, thread_id=thread_id)
    yield format_sse("progress", {"step": "anonymized"})

    yield format_sse("progress", {"step": "llm-started"})

    mistake_count = 0
    unlocatable_count = 0
    async for raw in stream_mistakes(
        markdown=anonymized,
        language=language,
        model=litellm_model,
        api_key=litellm_api_key,
        api_base=litellm_api_base,
    ):
        clean = await deanonymize_mistake(raw, client=client, thread_id=thread_id)
        located = locate_in_any_page(clean, all_words=all_words)
        if located is not None:
            mistake_count += 1
            yield format_sse(
                "mistake",
                {
                    "page": located.page_index,
                    "bbox": list(located.bbox),
                    "error_text": clean.error_text,
                    "correction": clean.correction,
                    "description": clean.description,
                    "type": clean.type,
                    "context_before": clean.context_before,
                },
            )
        else:
            unlocatable_count += 1
            yield format_sse(
                "unlocatable",
                {
                    "error_text": clean.error_text,
                    "correction": clean.correction,
                    "description": clean.description,
                    "type": clean.type,
                    "context_before": clean.context_before,
                },
            )

    if debug:
        word_stream = [
            {"page": p, "text": w.text, "bbox": list(w.bbox)}
            for p, words in all_words.items()
            for w in words
        ]
        yield format_sse(
            "debug",
            {
                "markdown_raw": markdown,
                "markdown_anonymized": anonymized,
                "word_stream": word_stream,
            },
        )

    yield format_sse(
        "done",
        {"mistake_count": mistake_count, "unlocatable_count": unlocatable_count},
    )
