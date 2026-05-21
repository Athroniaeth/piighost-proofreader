"""Domain exceptions and exception → SSE-reason mapping."""

import httpx
import litellm


class PipelineError(RuntimeError):
    """Base class for errors surfaced through the pipeline."""


class NoTextLayerError(PipelineError):
    """Raised when the PDF has no extractable text (probably a scan)."""


ErrorReason = str  # "backend-down" | "rate-limit" | "internal" | "no-text-layer"


def classify_exception(exc: BaseException) -> tuple[ErrorReason, str]:
    """Map an in-stream exception to (sse_reason, human_message)."""
    if isinstance(exc, NoTextLayerError):
        return "no-text-layer", str(exc) or "PDF has no extractable text"
    if isinstance(exc, litellm.exceptions.RateLimitError):
        return "rate-limit", str(exc)
    if isinstance(exc, httpx.HTTPError):
        return "backend-down", str(exc) or repr(exc)
    return "internal", str(exc) or exc.__class__.__name__
