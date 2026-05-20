"""LangChain + LiteLLM proofreading chain with structured output."""

from typing import Protocol

from langchain_core.prompts import ChatPromptTemplate
from langchain_litellm import ChatLiteLLM

from proofreader.models import ProofreadResult


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
