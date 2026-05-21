"""Tests for the API error mapping."""

import httpx
import litellm

from proofreader.api.errors import NoTextLayerError, classify_exception


def test_no_text_layer_error_is_an_exception():
    err = NoTextLayerError("empty extraction")
    assert isinstance(err, Exception)
    assert str(err) == "empty extraction"


def test_classify_httpx_error_returns_backend_down():
    exc = httpx.ConnectError("connection refused")
    reason, message = classify_exception(exc)
    assert reason == "backend-down"
    assert "connection" in message.lower()


def test_classify_rate_limit_error():
    exc = litellm.exceptions.RateLimitError(
        message="rate limited", llm_provider="openai", model="gpt-4o-mini"
    )
    reason, _ = classify_exception(exc)
    assert reason == "rate-limit"


def test_classify_unknown_exception_returns_internal():
    exc = ValueError("something broke")
    reason, message = classify_exception(exc)
    assert reason == "internal"
    assert "something broke" in message
