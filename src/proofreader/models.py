"""Pydantic schema for proofreading results."""

from typing import Literal

from pydantic import BaseModel, Field

MistakeType = Literal[
    "orthographe",
    "grammaire",
    "conjugaison",
    "accord",
    "ponctuation",
]


class Mistake(BaseModel):
    error_text: str = Field(
        description="Exact substring to highlight, copied verbatim from the Markdown."
    )
    correction: str = Field(description="Suggested correction.")
    description: str = Field(
        description="Short explanation, max 15 words, in the document's language."
    )
    type: MistakeType
    context_before: str = Field(
        description="3-5 words preceding the error, used to disambiguate occurrences."
    )


class ProofreadResult(BaseModel):
    mistakes: list[Mistake]
