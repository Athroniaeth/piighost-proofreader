"""Tests for the new AnonymizationClient methods."""

import httpx
import pytest
import respx

from proofreader.anonymize import AnonymizationClient


@pytest.mark.asyncio
async def test_detect_returns_flat_detections():
    client = AnonymizationClient(base_url="http://fake")
    payload = {
        "entities": [
            {
                "label": "PERSON",
                "detections": [
                    {"text": "Pierre", "label": "PERSON",
                     "position": {"start_pos": 0, "end_pos": 6}, "confidence": 0.99},
                    {"text": "Pierre", "label": "PERSON",
                     "position": {"start_pos": 50, "end_pos": 56}, "confidence": 0.95},
                ],
            },
            {
                "label": "LOCATION",
                "detections": [
                    {"text": "Lyon", "label": "LOCATION",
                     "position": {"start_pos": 30, "end_pos": 34}, "confidence": 0.88},
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
