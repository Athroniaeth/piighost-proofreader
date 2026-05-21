"""Tests for the streaming LLM client."""

import os
from collections.abc import AsyncIterator
from typing import Any
from unittest.mock import patch

import pytest

from proofreader.llm import stream_mistakes
from proofreader.models import Mistake


class _FakeInstructorClient:
    """Mimics instructor.from_litellm()'s client.chat.completions.create_iterable."""

    def __init__(self, mistakes: list[Mistake]) -> None:
        self._mistakes = mistakes
        self.chat = self
        self.completions = self
        self.last_kwargs: dict[str, Any] = {}

    def create_iterable(self, **kwargs: Any) -> AsyncIterator[Mistake]:
        self.last_kwargs = kwargs

        async def gen() -> AsyncIterator[Mistake]:
            for m in self._mistakes:
                yield m

        return gen()


async def test_stream_mistakes_yields_each_mistake_from_client():
    expected = [
        Mistake(
            error_text="exempel",
            correction="example",
            description="orth",
            type="orthographe",
            context_before="this is an",
        ),
        Mistake(
            error_text="erorr",
            correction="error",
            description="typo",
            type="orthographe",
            context_before="another",
        ),
    ]
    fake = _FakeInstructorClient(expected)
    with patch("proofreader.llm.instructor.from_litellm", return_value=fake):
        collected = []
        async for m in stream_mistakes(
            markdown="text",
            language="en",
            model="gpt-4o-mini",
            api_key="dummy",
            api_base=None,
        ):
            collected.append(m)
    assert collected == expected
    assert fake.last_kwargs["model"] == "gpt-4o-mini"
    assert fake.last_kwargs["response_model"] is Mistake


@pytest.mark.skipif(
    not os.getenv("LITELLM_API_KEY"), reason="LITELLM_API_KEY not set"
)
async def test_stream_mistakes_real_llm():
    """Smoke test against a real LLM, skipped without credentials."""
    collected = []
    async for m in stream_mistakes(
        markdown="This is a smple sentance.",
        language="en",
        model=os.environ.get("LITELLM_MODEL", "gpt-4o-mini"),
        api_key=os.environ["LITELLM_API_KEY"],
        api_base=os.environ.get("LITELLM_API_BASE") or None,
    ):
        collected.append(m)
    assert len(collected) >= 1
