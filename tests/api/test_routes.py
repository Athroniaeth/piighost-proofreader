"""Tests for the API routes."""

import httpx

from proofreader.api.app import app


async def test_health_returns_ok():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_proofread_rejects_non_pdf_mime():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        files = {"file": ("note.txt", b"plain text", "text/plain")}
        response = await client.post("/api/proofread", files=files)
    assert response.status_code == 415
    assert response.json()["reason"] == "not-pdf"


async def test_proofread_rejects_oversized_pdf():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        big = b"%PDF-1.4\n" + b"0" * (11 * 1024 * 1024)
        files = {"file": ("big.pdf", big, "application/pdf")}
        response = await client.post("/api/proofread", files=files)
    assert response.status_code == 413
    body = response.json()
    assert body["reason"] == "too-large"
    assert body["size_mb"] > 10


from collections.abc import AsyncIterator
from unittest.mock import AsyncMock, patch


async def test_proofread_streams_sse_events_on_happy_path(tiny_pdf_bytes):
    canned = [
        b'event: meta\ndata: {"language":"fr","page_count":1,"page_sizes":[],"thread_id":"x","filename":"t.pdf"}\n\n',
        b'event: done\ndata: {"mistake_count":0,"unlocatable_count":0}\n\n',
    ]

    async def fake_run_pipeline(**_kwargs) -> AsyncIterator[bytes]:
        for chunk in canned:
            yield chunk

    with patch("proofreader.api.routes.run_pipeline", new=fake_run_pipeline):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            files = {"file": ("t.pdf", tiny_pdf_bytes, "application/pdf")}
            response = await client.post("/api/proofread", files=files)
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    body = response.content
    assert b"event: meta" in body
    assert b"event: done" in body


async def test_proofread_returns_422_when_pipeline_raises_no_text_layer(empty_pdf_bytes):
    from proofreader.api.errors import NoTextLayerError

    async def boom(**_kwargs) -> AsyncIterator[bytes]:
        raise NoTextLayerError("empty extraction")
        yield  # pragma: no cover

    with patch("proofreader.api.routes.run_pipeline", new=boom):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            files = {"file": ("blank.pdf", empty_pdf_bytes, "application/pdf")}
            response = await client.post("/api/proofread", files=files)
    assert response.status_code == 422
    assert response.json()["reason"] == "no-text-layer"


async def test_proofread_emits_error_event_when_pipeline_fails_mid_stream(tiny_pdf_bytes):
    async def explosive_pipeline(**_kwargs) -> AsyncIterator[bytes]:
        yield b'event: meta\ndata: {"language":"fr","page_count":1,"page_sizes":[],"thread_id":"x","filename":"t.pdf"}\n\n'
        raise httpx.ConnectError("piighost-api down")

    with patch("proofreader.api.routes.run_pipeline", new=explosive_pipeline):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            files = {"file": ("t.pdf", tiny_pdf_bytes, "application/pdf")}
            response = await client.post("/api/proofread", files=files)
    assert response.status_code == 200
    body = response.content
    assert b"event: meta" in body
    assert b"event: error" in body
    assert b'"reason":"backend-down"' in body


async def test_labels_returns_label_list():
    fake_anon = AsyncMock()
    fake_anon.get_labels = AsyncMock(return_value=["PERSON", "EMAIL"])

    with patch("proofreader.api.routes.AnonymizationClient", return_value=fake_anon):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/labels")

    assert response.status_code == 200
    assert response.json() == {"labels": ["PERSON", "EMAIL"]}
