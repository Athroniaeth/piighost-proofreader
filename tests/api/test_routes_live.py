"""Live end-to-end smoke test for the FastAPI route.

Hits a real LLM and a running piighost-api. Skipped unless LITELLM_API_KEY
is set AND piighost-api is reachable at PIIGHOST_API_URL.
"""

import json
import os

import fitz
import httpx
import pytest

from proofreader.api.app import app


def _piighost_up() -> bool:
    url = os.environ.get("PIIGHOST_API_URL", "http://localhost:8000")
    try:
        return httpx.get(f"{url}/health", timeout=1.0).status_code == 200
    except Exception:
        return False


@pytest.mark.skipif(
    not os.getenv("LITELLM_API_KEY") or not _piighost_up(),
    reason="LITELLM_API_KEY missing or piighost-api unreachable",
)
async def test_live_proofread_returns_at_least_one_mistake():
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 100), "Voici un exempel avec un faute.", fontsize=14)
    pdf_bytes = doc.tobytes()
    doc.close()

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://test", timeout=60.0
    ) as client:
        files = {"file": ("live.pdf", pdf_bytes, "application/pdf")}
        response = await client.post("/api/proofread", files=files)
        assert response.status_code == 200
        events_text = response.text

    mistakes = 0
    for chunk in events_text.split("\n\n"):
        if chunk.startswith("event: mistake"):
            mistakes += 1
            data_line = chunk.splitlines()[1]
            payload = json.loads(data_line.removeprefix("data: "))
            assert "bbox" in payload
            assert "correction" in payload
    assert mistakes >= 1, "live LLM should have detected at least one mistake"
