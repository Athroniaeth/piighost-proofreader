"""Tests for the LLM proofreading runner."""
import os

import pytest

from proofreader.llm import proofread, build_chain
from proofreader.models import Mistake, ProofreadResult


class _FakeChain:
    def __init__(self, result: ProofreadResult) -> None:
        self._result = result

    async def ainvoke(self, _payload: dict) -> ProofreadResult:
        return self._result


async def test_proofread_returns_mistakes_from_chain():
    expected = ProofreadResult(
        mistakes=[
            Mistake(
                error_text="exempel",
                correction="example",
                description="ortho",
                type="orthographe",
                context_before="this is an",
            )
        ]
    )
    fake = _FakeChain(expected)
    result = await proofread(
        markdown="this is an exempel",
        language="en",
        chain=fake,
    )
    assert result == expected


@pytest.mark.skipif(
    not os.getenv("LITELLM_API_KEY"),
    reason="LITELLM_API_KEY not set, skipping live LLM call",
)
async def test_build_chain_runs_against_real_llm():
    chain = build_chain(
        model=os.environ.get("LITELLM_MODEL", "gpt-4o-mini"),
        api_key=os.environ["LITELLM_API_KEY"],
    )
    result = await proofread(
        markdown="This is a smple sentance.",
        language="en",
        chain=chain,
    )
    assert isinstance(result, ProofreadResult)
