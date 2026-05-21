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
