"""Locate a Mistake (error_text + context_before) inside the PyMuPDF word stream."""

from dataclasses import dataclass

from proofreader.models import Mistake
from proofreader.pdf_render import Word

_PUNCT = ".,;:!?\"'()[]{}«»"

# Minimum normalized-needle length for the substring fallback strategy.
# Anything shorter is at high risk of producing spurious matches inside
# longer words (e.g. "une" inside "commune", "une" inside "jeune").
_MIN_SUBSTRING_CHARS = 5

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

    # Strategy 4: substring of the concatenated stream. Handles LLM
    # tokenisation drift where the LLM treats "d'une" as "d'" + "une"
    # and reports "une" as a standalone word that has no equivalent
    # PyMuPDF token.
    matched = _find_error_as_substring_if_unique(err_tokens, words)
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


def _find_error_as_substring_if_unique(
    err_tokens: list[str], words: list[Word]
) -> list[Word] | None:
    """Locate err_tokens as a substring of the concatenated normalized stream.

    Strategy of last resort: when neither word-aligned strategy matches,
    project all words into a single normalized string and look for the
    error as a literal substring. The match is mapped back to the
    smallest Word range that fully covers it. Requires uniqueness in
    the stream to keep false positives low.
    """
    if not words or not err_tokens:
        return None
    needle = " ".join(_normalize(t) for t in err_tokens).strip()
    if len(needle) < _MIN_SUBSTRING_CHARS:
        return None

    parts: list[str] = []
    offsets: list[tuple[int, int]] = []
    cursor = 0
    for w in words:
        n = _normalize(w.text)
        parts.append(n)
        offsets.append((cursor, cursor + len(n)))
        cursor += len(n) + 1  # +1 for the joining space
    full = " ".join(parts)

    first = full.find(needle)
    if first == -1:
        return None
    if full.find(needle, first + 1) != -1:
        return None  # ambiguous

    last = first + len(needle)
    start_word: int | None = None
    end_word: int | None = None
    for i, (a, b) in enumerate(offsets):
        if start_word is None and b > first:
            start_word = i
        if a < last:
            end_word = i
    if start_word is None or end_word is None:
        return None
    return list(words[start_word : end_word + 1])


def _build_located(mistake: Mistake, matched: list[Word]) -> LocatedMistake:
    """Build the LocatedMistake with the union bbox of ``matched``."""
    page_index = matched[0].page_index
    x0 = min(w.bbox[0] for w in matched)
    y0 = min(w.bbox[1] for w in matched)
    x1 = max(w.bbox[2] for w in matched)
    y1 = max(w.bbox[3] for w in matched)
    return LocatedMistake(mistake=mistake, page_index=page_index, bbox=(x0, y0, x1, y1))
