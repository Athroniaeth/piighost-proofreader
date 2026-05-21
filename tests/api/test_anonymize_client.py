"""Tests for the new AnonymizationClient methods."""

import httpx
import pytest
import respx

from proofreader.anonymize import AnonymizationClient


@pytest.mark.asyncio
async def test_detect_returns_flat_detections():
    client = AnonymizationClient(base_url="http://fake")
    # Mirrors the real piighost-api /v1/detect shape: start_pos/end_pos are
    # flat on each Detection, not nested under `position`.
    payload = {
        "entities": [
            {
                "label": "PERSON",
                "detections": [
                    {"text": "Pierre", "label": "PERSON",
                     "start_pos": 0, "end_pos": 6, "confidence": 0.99},
                    {"text": "Pierre", "label": "PERSON",
                     "start_pos": 50, "end_pos": 56, "confidence": 0.95},
                ],
            },
            {
                "label": "LOCATION",
                "detections": [
                    {"text": "Lyon", "label": "LOCATION",
                     "start_pos": 30, "end_pos": 34, "confidence": 0.88},
                ],
            },
        ]
    }
    with respx.mock:
        respx.post("http://fake/v1/detect").respond(json=payload)
        out = await client.detect("Pierre lives in Lyon. Pierre.", thread_id="t1")

    assert len(out) == 3
    assert out[0]["text"] == "Pierre"
    assert out[0]["start_pos"] == 0
    assert out[2]["label"] == "LOCATION"


@pytest.mark.asyncio
async def test_override_detections_sends_put_with_detections_array():
    client = AnonymizationClient(base_url="http://fake")
    detections = [
        {"text": "Acme", "label": "ORG", "start_pos": 5, "end_pos": 9, "confidence": 1.0},
        {"text": "John", "label": "PERSON", "start_pos": 20, "end_pos": 24, "confidence": 1.0},
    ]
    captured: dict = {}

    def capture(request):
        captured["json"] = request.read()
        return httpx.Response(200, json={})

    with respx.mock:
        respx.put("http://fake/v1/detect").mock(side_effect=capture)
        await client.override_detections("hi Acme and John", detections, thread_id="t1")

    import json as _json
    body = _json.loads(captured["json"])
    assert body["text"] == "hi Acme and John"
    assert body["thread_id"] == "t1"
    assert len(body["detections"]) == 2
    assert body["detections"][0]["text"] == "Acme"
    assert body["detections"][0]["start_pos"] == 5
    assert body["detections"][0]["end_pos"] == 9


@pytest.mark.asyncio
async def test_get_labels_returns_label_list():
    client = AnonymizationClient(base_url="http://fake")
    with respx.mock:
        respx.get("http://fake/v1/config").respond(
            json={"labels": ["PERSON", "LOCATION", "EMAIL"], "placeholder_factory": "x"}
        )
        labels = await client.get_labels()
    assert labels == ["PERSON", "LOCATION", "EMAIL"]
