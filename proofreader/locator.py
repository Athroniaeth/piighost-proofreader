"""Locate a Mistake (error_text + context_before) inside the PyMuPDF word stream."""
from dataclasses import dataclass

from proofreader.models import Mistake
from proofreader.pdf_render import Word


@dataclass(frozen=True)
class LocatedMistake:
    mistake: Mistake
    page_index: int
    bbox: tuple[float, float, float, float]  # union bbox of all matched words


def locate_mistake(mistake: Mistake, *, words: list[Word]) -> LocatedMistake | None:
    """Return a LocatedMistake matching ``error_text`` after ``context_before``.

    ``error_text`` may span multiple whitespace-separated tokens. The
    returned bbox is the union of all matched word bboxes on the same page.

    If ``context_before`` is empty, we return the first occurrence of the
    error token sequence. If a context is given, we require it to match
    before the error. If no match is found, returns None.
    """
    ctx_tokens = mistake.context_before.split()
    err_tokens = mistake.error_text.split()
    n_ctx = len(ctx_tokens)
    n_err = len(err_tokens)
    if n_err == 0:
        return None

    for i in range(len(words) - n_ctx - n_err + 1):
        if n_ctx > 0:
            ctx_window = [w.text for w in words[i : i + n_ctx]]
            if ctx_window != ctx_tokens:
                continue
        err_start = i + n_ctx
        err_window = words[err_start : err_start + n_err]
        if [w.text for w in err_window] != err_tokens:
            continue
        return _build_located(mistake, err_window)
    return None


def _build_located(mistake: Mistake, matched: list[Word]) -> LocatedMistake:
    """Build the LocatedMistake with the union bbox of ``matched``."""
    page_index = matched[0].page_index
    x0 = min(w.bbox[0] for w in matched)
    y0 = min(w.bbox[1] for w in matched)
    x1 = max(w.bbox[2] for w in matched)
    y1 = max(w.bbox[3] for w in matched)
    return LocatedMistake(mistake=mistake, page_index=page_index, bbox=(x0, y0, x1, y1))
