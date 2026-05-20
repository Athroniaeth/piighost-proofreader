"""Tests for language detection."""
from proofreader.language import detect_language


def test_detect_french():
    text = "Voici un exemple de texte en français avec quelques mots typiques."
    assert detect_language(text) == "fr"


def test_detect_english():
    text = "This is a clear example of an English paragraph with common words."
    assert detect_language(text) == "en"


def test_detect_fallback_on_empty():
    assert detect_language("") == "en"


def test_detect_fallback_on_garbage():
    assert detect_language("xxx zzz qqq") == "en"
