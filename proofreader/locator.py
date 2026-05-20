"""Locate a Mistake (error_text + context_before) inside the PyMuPDF word stream."""

from dataclasses import dataclass

from proofreader.models import Mistake
from proofreader.pdf_render import Word


@dataclass(frozen=True)
class LocatedMistake:
    mistake: Mistake
    word: Word


def locate_mistake(mistake: Mistake, *, words: list[Word]) -> LocatedMistake | None:
    """Return the first Word matching ``mistake.error_text`` after ``context_before``.

    Matching is exact on whole words. If ``context_before`` is empty,
    we return the first occurrence of ``error_text``. If a context is
    given, we require the context to match before the error. If no
    match is found, returns None.
    """
    ctx_tokens = mistake.context_before.split()
    n_ctx = len(ctx_tokens)
    error = mistake.error_text
    if n_ctx == 0:
        for w in words:
            if w.text == error:
                return LocatedMistake(mistake=mistake, word=w)
        return None
    for i in range(len(words) - n_ctx):
        window = [w.text for w in words[i : i + n_ctx]]
        if window == ctx_tokens and i + n_ctx < len(words) and words[i + n_ctx].text == error:
            return LocatedMistake(mistake=mistake, word=words[i + n_ctx])
    return None
