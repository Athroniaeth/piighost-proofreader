"""Locate a Mistake (error_text + context_before) inside the PyMuPDF word stream."""

from dataclasses import dataclass

from proofreader.models import Mistake
from proofreader.pdf_render import Word

_PUNCT = ".,;:!?\"'()[]{}«»"

# Map typographic quotes to their ASCII equivalents so LLM-normalized
# strings ("d’automatisation") match PyMuPDF tokens that preserve the
# original character ("d'automatisation") and vice versa.
_QUOTE_MAP = str.maketrans(
    {
        "’": "'",
        "‘": "'",
        "“": '"',
        "”": '"',
    }
)


@dataclass(frozen=True)
class LocatedMistake:
    mistake: Mistake
    page_index: int
    bbox: tuple[float, float, float, float]  # union bbox of all matched words


def locate_mistake(mistake: Mistake, *, words: list[Word]) -> LocatedMistake | None:
    """Find the page region matching the mistake.

    Three strategies, tried in order:

    1. Strict whole-word match of ``context_before`` followed by ``error_text``.
    2. Same but punctuation-tolerant (trailing/leading punctuation stripped
       on both the LLM tokens and the PyMuPDF tokens before comparison).
    3. If ``error_text`` appears exactly once anywhere in the stream
       (punctuation-tolerant), return that single occurrence regardless of
       context. Catches LLM context drift across multi-column layouts.

    Returns ``None`` if no strategy finds a match.
    """
    err_tokens = mistake.error_text.split()
    if not err_tokens:
        return None
    ctx_tokens = mistake.context_before.split()

    # Strategy 1: strict.
    matched = _match_window(ctx_tokens, err_tokens, words, normalize=False)
    if matched is not None:
        return _build_located(mistake, matched)

    # Strategy 2: punctuation-tolerant.
    matched = _match_window(ctx_tokens, err_tokens, words, normalize=True)
    if matched is not None:
        return _build_located(mistake, matched)

    # Strategy 3: error-only unique match, punctuation-tolerant.
    matched = _find_error_alone_if_unique(err_tokens, words)
    if matched is not None:
        return _build_located(mistake, matched)

    return None


def _normalize(token: str) -> str:
    """Casefold, map typographic quotes to ASCII, strip surrounding punctuation.

    Three independent forms of LLM/PDF drift are absorbed in one pass:
    case (the LLM may capitalize the first word of a sentence-long
    error_text), curly-vs-straight apostrophes (the LLM may emit ’ when
    the PDF has ' or vice versa), and trailing punctuation that PyMuPDF
    attaches to tokens.
    """
    return token.translate(_QUOTE_MAP).casefold().strip(_PUNCT)


def _match_window(
    ctx_tokens: list[str],
    err_tokens: list[str],
    words: list[Word],
    *,
    normalize: bool,
) -> list[Word] | None:
    """Sliding-window match of context+error. Returns the matched error words or None."""
    n_ctx = len(ctx_tokens)
    n_err = len(err_tokens)
    if normalize:
        ctx_cmp = [_normalize(t) for t in ctx_tokens]
        err_cmp = [_normalize(t) for t in err_tokens]
        words_cmp = [_normalize(w.text) for w in words]
    else:
        ctx_cmp = ctx_tokens
        err_cmp = err_tokens
        words_cmp = [w.text for w in words]
    for i in range(len(words) - n_ctx - n_err + 1):
        if n_ctx > 0 and words_cmp[i : i + n_ctx] != ctx_cmp:
            continue
        err_start = i + n_ctx
        if words_cmp[err_start : err_start + n_err] != err_cmp:
            continue
        return list(words[err_start : err_start + n_err])
    return None


def _find_error_alone_if_unique(
    err_tokens: list[str], words: list[Word]
) -> list[Word] | None:
    """Return the unique occurrence of err_tokens, or None if zero / multiple."""
    n_err = len(err_tokens)
    err_cmp = [_normalize(t) for t in err_tokens]
    words_cmp = [_normalize(w.text) for w in words]
    match: list[Word] | None = None
    for i in range(len(words) - n_err + 1):
        if words_cmp[i : i + n_err] == err_cmp:
            if match is not None:
                return None  # second occurrence, ambiguous
            match = list(words[i : i + n_err])
    return match


def _build_located(mistake: Mistake, matched: list[Word]) -> LocatedMistake:
    """Build the LocatedMistake with the union bbox of ``matched``."""
    page_index = matched[0].page_index
    x0 = min(w.bbox[0] for w in matched)
    y0 = min(w.bbox[1] for w in matched)
    x1 = max(w.bbox[2] for w in matched)
    y1 = max(w.bbox[3] for w in matched)
    return LocatedMistake(mistake=mistake, page_index=page_index, bbox=(x0, y0, x1, y1))
