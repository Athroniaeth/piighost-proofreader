"""Tests for the piighost-api HTTP client."""

import httpx
import pytest
import respx

from proofreader.anonymize import AnonymizationClient, AnonymizeError


@pytest.fixture
def client() -> AnonymizationClient:
    return AnonymizationClient(base_url="http://localhost:8000")


@respx.mock
async def test_anonymize_returns_anonymized_text(client: AnonymizationClient):
    respx.post("http://localhost:8000/v1/anonymize").mock(
        return_value=httpx.Response(
            200,
            json={"anonymized_text": "Hello <<PERSON:1>>", "entities": []},
        )
    )
    result = await client.anonymize("Hello Patrick", thread_id="t1")
    assert result == "Hello <<PERSON:1>>"


@respx.mock
async def test_deanonymize_returns_original_text(client: AnonymizationClient):
    respx.post("http://localhost:8000/v1/deanonymize").mock(
        return_value=httpx.Response(
            200,
            json={"text": "Hello Patrick", "entities": []},
        )
    )
    result = await client.deanonymize("Hello <<PERSON:1>>", thread_id="t1")
    assert result == "Hello Patrick"


@respx.mock
async def test_anonymize_raises_on_http_error(client: AnonymizationClient):
    respx.post("http://localhost:8000/v1/anonymize").mock(
        return_value=httpx.Response(500, json={"detail": "boom"})
    )
    with pytest.raises(AnonymizeError):
        await client.anonymize("Hello", thread_id="t1")
