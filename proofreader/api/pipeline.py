"""Async streaming pipeline for the proofreading API."""

import asyncio

from proofreader.anonymize import AnonymizationClient
from proofreader.locator import LocatedMistake, locate_mistake
from proofreader.models import Mistake
from proofreader.pdf_render import Word


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


def locate_in_any_page(
    mistake: Mistake, *, all_words: dict[int, list[Word]]
) -> LocatedMistake | None:
    """Try every page in order and return the first match, or None."""
    for page_index in sorted(all_words):
        hit = locate_mistake(mistake, words=all_words[page_index])
        if hit is not None:
            return hit
    return None
