"""Language detection helper."""

from lingua import Language, LanguageDetectorBuilder

_DETECTOR = (
    LanguageDetectorBuilder.from_languages(
        Language.FRENCH,
        Language.ENGLISH,
        Language.SPANISH,
        Language.GERMAN,
        Language.ITALIAN,
        Language.PORTUGUESE,
    )
    .with_minimum_relative_distance(0.25)
    .build()
)

_ISO = {
    Language.FRENCH: "fr",
    Language.ENGLISH: "en",
    Language.SPANISH: "es",
    Language.GERMAN: "de",
    Language.ITALIAN: "it",
    Language.PORTUGUESE: "pt",
}


def detect_language(text: str, *, sample_chars: int = 1000) -> str:
    """Return the ISO-639-1 code of the detected language, or "en" as fallback."""
    snippet = text[:sample_chars].strip()
    if not snippet:
        return "en"
    detected = _DETECTOR.detect_language_of(snippet)
    if detected is None:
        return "en"
    return _ISO.get(detected, "en")
