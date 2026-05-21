"""Tests for POST /api/detect-pii."""

from unittest.mock import AsyncMock, patch

import httpx

from proofreader.api.app import app


async def test_detect_pii_returns_markdown_and_detections(tiny_pdf_bytes):
    fake_anon = AsyncMock()
    fake_anon.detect = AsyncMock(
        return_value=[
            {
                "text": "exemple",
                "label": "PERSON",
                "start_pos": 9,
                "end_pos": 16,
                "confidence": 0.9,
            }
        ]
    )

    with patch("proofreader.api.routes.AnonymizationClient", return_value=fake_anon):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://test"
        ) as client:
            files = {"file": ("t.pdf", tiny_pdf_bytes, "application/pdf")}
            response = await client.post("/api/detect-pii", files=files)

    assert response.status_code == 200
    body = response.json()
    assert "thread_id" in body
    assert body["language"] == "fr"
    assert body["page_count"] == 1
    assert isinstance(body["markdown"], str) and body["markdown"]
    assert isinstance(body["detections"], list)
    assert len(body["detections"]) >= 1
    det = body["detections"][0]
    assert det["text"] == "exemple"
    assert det["label"] == "PERSON"
    assert "page" in det and "bbox" in det


async def test_detect_pii_returns_422_on_empty_pdf(empty_pdf_bytes):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://test"
    ) as client:
        files = {"file": ("blank.pdf", empty_pdf_bytes, "application/pdf")}
        response = await client.post("/api/detect-pii", files=files)
    assert response.status_code == 422
    assert response.json()["reason"] == "no-text-layer"


async def test_detect_pii_rejects_oversized():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://test"
    ) as client:
        big = b"%PDF-1.4\n" + b"0" * (11 * 1024 * 1024)
        files = {"file": ("big.pdf", big, "application/pdf")}
        response = await client.post("/api/detect-pii", files=files)
    assert response.status_code == 413


async def test_detect_pii_rejects_non_pdf():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://test"
    ) as client:
        files = {"file": ("x.txt", b"hi", "text/plain")}
        response = await client.post("/api/detect-pii", files=files)
    assert response.status_code == 415
