"""Tests for the mistake locator."""
from proofreader.locator import locate_mistake
from proofreader.models import Mistake
from proofreader.pdf_render import Word


def _stream() -> list[Word]:
    """Synthetic stream for the sentence:
    'Voici un exemple avec j'avais et j'avait.'
    """
    return [
        Word(text="Voici", bbox=(0, 0, 30, 10), page_index=0),
        Word(text="un", bbox=(35, 0, 50, 10), page_index=0),
        Word(text="exemple", bbox=(55, 0, 100, 10), page_index=0),
        Word(text="avec", bbox=(105, 0, 130, 10), page_index=0),
        Word(text="j'avais", bbox=(135, 0, 180, 10), page_index=0),
        Word(text="et", bbox=(185, 0, 200, 10), page_index=0),
        Word(text="j'avait", bbox=(205, 0, 250, 10), page_index=0),
    ]


def test_locate_unique_error():
    m = Mistake(
        error_text="j'avait",
        correction="j'avais",
        description="conjugaison",
        type="conjugaison",
        context_before="j'avais et",
    )
    located = locate_mistake(m, words=_stream())
    assert located is not None
    assert located.bbox == (205, 0, 250, 10)
    assert located.page_index == 0


def test_locate_uses_context_to_pick_second_occurrence():
    stream = [
        Word(text="Au", bbox=(0, 0, 10, 10), page_index=0),
        Word(text="début", bbox=(15, 0, 40, 10), page_index=0),
        Word(text="j'avais", bbox=(45, 0, 90, 10), page_index=0),
        Word(text="raison.", bbox=(95, 0, 130, 10), page_index=0),
        Word(text="Ensuite", bbox=(135, 0, 175, 10), page_index=0),
        Word(text="j'avais", bbox=(180, 0, 225, 10), page_index=0),
    ]
    m = Mistake(
        error_text="j'avais",
        correction="j'avais",
        description="x",
        type="conjugaison",
        context_before="raison. Ensuite",
    )
    located = locate_mistake(m, words=stream)
    assert located is not None
    assert located.bbox == (180, 0, 225, 10)


def test_locate_returns_none_when_unfindable():
    m = Mistake(
        error_text="zzzzz",
        correction="zzzzz",
        description="x",
        type="orthographe",
        context_before="aaaa bbbb",
    )
    assert locate_mistake(m, words=_stream()) is None


def test_locate_multi_word_error_text():
    """Grammar errors often span multiple words, e.g. 'j'avais travailler'."""
    stream = [
        Word(text="J'avais", bbox=(0, 0, 50, 10), page_index=0),
        Word(text="travailler", bbox=(55, 0, 130, 10), page_index=0),
        Word(text="hier", bbox=(135, 0, 165, 10), page_index=0),
    ]
    m = Mistake(
        error_text="J'avais travailler",
        correction="J'ai travaillé",
        description="auxiliaire + participe",
        type="conjugaison",
        context_before="",
    )
    located = locate_mistake(m, words=stream)
    assert located is not None
    # Union bbox of the two matched words.
    assert located.bbox == (0, 0, 130, 10)


def test_locate_multi_word_with_context():
    stream = [
        Word(text="Au", bbox=(0, 0, 10, 10), page_index=0),
        Word(text="bureau", bbox=(15, 0, 60, 10), page_index=0),
        Word(text="j'avais", bbox=(65, 0, 110, 10), page_index=0),
        Word(text="travailler", bbox=(115, 0, 190, 10), page_index=0),
    ]
    m = Mistake(
        error_text="j'avais travailler",
        correction="j'ai travaillé",
        description="x",
        type="conjugaison",
        context_before="Au bureau",
    )
    located = locate_mistake(m, words=stream)
    assert located is not None
    assert located.bbox == (65, 0, 190, 10)


def test_locate_tolerates_trailing_punctuation_in_stream():
    """PyMuPDF attaches trailing punctuation to tokens; LLM context drops it."""
    stream = [
        Word(text="suivre", bbox=(0, 0, 30, 10), page_index=0),
        Word(text="métriques", bbox=(35, 0, 85, 10), page_index=0),
        Word(text="et", bbox=(90, 0, 100, 10), page_index=0),
        Word(text="la", bbox=(105, 0, 115, 10), page_index=0),
        Word(text="collecte", bbox=(120, 0, 160, 10), page_index=0),
        Word(text="des", bbox=(165, 0, 180, 10), page_index=0),
        Word(text="retours", bbox=(185, 0, 220, 10), page_index=0),
        Word(text="métiers.", bbox=(225, 0, 260, 10), page_index=0),  # trailing period
    ]
    m = Mistake(
        error_text="la collecte des retours métiers",  # no period
        correction="x",
        description="x",
        type="accord",
        context_before="suivre métriques et",
    )
    located = locate_mistake(m, words=stream)
    assert located is not None
    assert located.bbox == (105, 0, 260, 10)


def test_locate_falls_back_to_unique_error_when_context_is_wrong():
    """LLM may anchor on a word from another column; if the error is unique, use it."""
    stream = [
        Word(text="Malt", bbox=(0, 0, 30, 10), page_index=0),  # sidebar landmark
        Word(text="Création", bbox=(100, 0, 150, 10), page_index=0),
        Word(text="d'API", bbox=(155, 0, 180, 10), page_index=0),
        Word(text="consommé", bbox=(185, 0, 235, 10), page_index=0),
    ]
    m = Mistake(
        error_text="Création d'API consommé",
        correction="x",
        description="x",
        type="accord",
        context_before="Malt",  # wrong: stream has many words between Malt and the error
    )
    located = locate_mistake(m, words=stream)
    assert located is not None
    # Strategy 3 falls back on the unique occurrence ignoring the context.
    assert located.bbox == (100, 0, 235, 10)


def test_locate_tolerates_case_in_long_sentence():
    """The LLM may capitalize the first word of a sentence-long error."""
    stream = [
        Word(text="Création", bbox=(0, 0, 50, 10), page_index=0),
        Word(text="et", bbox=(55, 0, 75, 10), page_index=0),
        Word(text="industrialisation", bbox=(80, 0, 160, 10), page_index=0),
        Word(text="d'une", bbox=(165, 0, 195, 10), page_index=0),  # lowercase d
        Word(text="pipeline.", bbox=(200, 0, 260, 10), page_index=0),
    ]
    m = Mistake(
        error_text="D'une pipeline",  # capital D, the LLM echoed with sentence case
        correction="d'un pipeline",
        description="x",
        type="accord",
        context_before="",
    )
    located = locate_mistake(m, words=stream)
    assert located is not None
    assert located.bbox == (165, 0, 260, 10)


def test_locate_tolerates_curly_vs_straight_apostrophe():
    """LLM may normalize ' to ’ when echoing, but the PDF kept the ASCII form."""
    stream = [
        Word(text="Développement", bbox=(0, 0, 70, 10), page_index=0),
        Word(text="d'automatisation", bbox=(75, 0, 175, 10), page_index=0),  # ASCII apostrophe
        Word(text="SAP", bbox=(180, 0, 205, 10), page_index=0),
    ]
    m = Mistake(
        error_text="d’automatisation SAP",  # curly apostrophe from the LLM
        correction="d’automatisation SAP",
        description="x",
        type="orthographe",
        context_before="Développement",
    )
    located = locate_mistake(m, words=stream)
    assert located is not None
    assert located.bbox == (75, 0, 205, 10)


def test_locate_substring_handles_subword_match():
    """LLM may report 'une pipeline' even though PyMuPDF tokenises d'une as one word."""
    stream = [
        Word(text="industrialisation", bbox=(0, 0, 80, 10), page_index=0),
        Word(text="d'une", bbox=(85, 0, 115, 10), page_index=0),
        Word(text="pipeline", bbox=(120, 0, 165, 10), page_index=0),
        Word(text="d'OCR,", bbox=(170, 0, 200, 10), page_index=0),
    ]
    m = Mistake(
        error_text="une pipeline",
        correction="un pipeline",
        description="x",
        type="accord",
        context_before="industrialisation d'une pipeline d'OCR, dans",
    )
    located = locate_mistake(m, words=stream)
    assert located is not None
    # Union bbox covers "d'une" + "pipeline" because the LLM's "une" is
    # only a suffix of the PyMuPDF token "d'une".
    assert located.bbox == (85, 0, 165, 10)


def test_locate_substring_skips_short_needles():
    """Short error_text (<5 chars normalized) must NOT trigger substring fallback."""
    stream = [
        Word(text="commune", bbox=(0, 0, 30, 10), page_index=0),  # contains "une"
        Word(text="autre", bbox=(35, 0, 60, 10), page_index=0),
    ]
    m = Mistake(
        error_text="une",
        correction="un",
        description="x",
        type="accord",
        context_before="xyz",
    )
    assert locate_mistake(m, words=stream) is None


def test_locate_returns_none_when_error_repeats_and_context_mismatches():
    """Strategy 3 only fires for unique error_text; otherwise None."""
    stream = [
        Word(text="alpha", bbox=(0, 0, 30, 10), page_index=0),
        Word(text="repeated", bbox=(35, 0, 75, 10), page_index=0),
        Word(text="beta", bbox=(80, 0, 110, 10), page_index=0),
        Word(text="repeated", bbox=(115, 0, 155, 10), page_index=0),
    ]
    m = Mistake(
        error_text="repeated",
        correction="x",
        description="x",
        type="orthographe",
        context_before="gamma",  # not in stream at all
    )
    assert locate_mistake(m, words=stream) is None
