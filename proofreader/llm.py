"""LangChain + LiteLLM proofreading chain with structured output.

This module exposes two complementary LLM APIs side-by-side:

* `build_chain` / `proofread` — synchronous-ish LangChain chain used by
  the Streamlit entry point. Returns the full `ProofreadResult` at once.
* `stream_mistakes` — async generator built on Instructor + litellm
  acompletion. Yields `Mistake` instances one at a time so the FastAPI
  route can stream them via SSE.
"""

from collections.abc import AsyncIterator
from typing import Protocol

import instructor
import litellm
from langchain_core.prompts import ChatPromptTemplate
from langchain_litellm import ChatLiteLLM

from proofreader.models import Mistake, ProofreadResult


class ProofreadChain(Protocol):
    async def ainvoke(self, payload: dict) -> ProofreadResult: ...


SYSTEM_PROMPT = (
    "You are an expert proofreader. The text below is the Markdown extraction "
    "of a CV in {language}. List EVERY mistake you find. For each mistake, "
    "return: the exact substring as written (`error_text`), the corrected form "
    "(`correction`), a short explanation in {language} (max 15 words), a `type` "
    "from [orthographe, grammaire, conjugaison, accord, ponctuation], and 3-5 "
    "words preceding the error verbatim (`context_before`). Be exhaustive."
)


SYSTEM_PROMPT_STREAM = (
    "You are an expert proofreader. The text below is the Markdown extraction "
    "of a CV in {language}. For each mistake you find, emit a JSON object with "
    "fields: error_text (exact substring from the markdown), correction "
    "(suggested fix), description (short explanation in {language}, max 15 "
    "words), type (one of orthographe, grammaire, conjugaison, accord, "
    "ponctuation), context_before (3-5 words preceding the error verbatim). "
    "Be exhaustive."
)


def build_chain(*, model: str, api_key: str, api_base: str | None = None) -> ProofreadChain:
    llm = ChatLiteLLM(model=model, api_key=api_key, api_base=api_base)
    structured = llm.with_structured_output(ProofreadResult, method="json_schema")
    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", SYSTEM_PROMPT),
            ("human", "{markdown}"),
        ]
    )
    return prompt | structured


async def proofread(*, markdown: str, language: str, chain: ProofreadChain) -> ProofreadResult:
    return await chain.ainvoke({"language": language, "markdown": markdown})


async def stream_mistakes(
    *,
    markdown: str,
    language: str,
    model: str,
    api_key: str,
    api_base: str | None = None,
) -> AsyncIterator[Mistake]:
    """Stream proofreading mistakes from the LLM one at a time.

    Uses Instructor's create_iterable so the frontend sees each mistake
    appear as the model emits it, instead of waiting for the full list.
    """
    client = instructor.from_litellm(litellm.acompletion)
    response = client.chat.completions.create_iterable(
        model=model,
        api_key=api_key,
        api_base=api_base,
        response_model=Mistake,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT_STREAM.format(language=language)},
            {"role": "user", "content": markdown},
        ],
    )
    async for mistake in response:
        yield mistake
