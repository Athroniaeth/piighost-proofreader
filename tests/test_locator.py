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
    assert located.word.text == "j'avait"
    assert located.word.bbox == (205, 0, 250, 10)


def test_locate_uses_context_to_pick_second_occurrence():
    # Stream where "j'avais" appears twice; only the 2nd is the error.
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
        correction="j'avais",  # not relevant for the test
        description="x",
        type="conjugaison",
        context_before="raison. Ensuite",
    )
    located = locate_mistake(m, words=stream)
    assert located.word.bbox == (180, 0, 225, 10)


def test_locate_returns_none_when_unfindable():
    m = Mistake(
        error_text="zzzzz",
        correction="zzzzz",
        description="x",
        type="orthographe",
        context_before="aaaa bbbb",
    )
    assert locate_mistake(m, words=_stream()) is None
