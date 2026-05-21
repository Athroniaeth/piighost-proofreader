"""Tests for SSE event formatting."""

from proofreader.api.sse import format_sse


def test_format_sse_emits_event_and_data_lines():
    out = format_sse("meta", {"language": "fr", "page_count": 1})
    assert out == b'event: meta\ndata: {"language":"fr","page_count":1}\n\n'


def test_format_sse_handles_unicode_without_escaping():
    out = format_sse("mistake", {"description": "Démonstration"})
    text = out.decode("utf-8")
    assert "Démonstration" in text
    assert text.endswith("\n\n")


def test_format_sse_with_empty_data():
    out = format_sse("done", {})
    assert out == b"event: done\ndata: {}\n\n"
