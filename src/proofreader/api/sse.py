"""Helpers for emitting Server-Sent Events."""

import json
from typing import Any


def format_sse(event_name: str, data: dict[str, Any]) -> bytes:
    """Serialize an SSE event payload as bytes.

    Compact JSON (no whitespace) keeps the on-wire size small.
    ensure_ascii=False lets unicode pass through as UTF-8 rather than
    \\uXXXX escapes — the frontend parser handles UTF-8 natively.
    """
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    return f"event: {event_name}\ndata: {payload}\n\n".encode("utf-8")
