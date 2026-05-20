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
