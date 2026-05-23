"""HTTP client for piighost-api anonymization endpoints."""

import httpx


class AnonymizeError(RuntimeError):
    """Raised when the piighost-api call fails."""


class AnonymizationClient:
    """Thin async wrapper around piighost-api's anonymize/deanonymize routes."""

    def __init__(self, *, base_url: str, timeout: float = 30.0) -> None:
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout

    async def anonymize(self, text: str, *, thread_id: str) -> str:
        return await self._call("/v1/anonymize", text, thread_id, response_key="anonymized_text")

    async def deanonymize(self, text: str, *, thread_id: str) -> str:
        # /v1/deanonymize/entities does token-based replacement on any text,
        # while /v1/deanonymize is cache-keyed on the full anonymized text
        # and 404s on substrings. We pass substrings (Mistake.error_text,
        # context_before, correction, description), so we need the entity
        # endpoint.
        return await self._call(
            "/v1/deanonymize/entities", text, thread_id, response_key="text"
        )

    async def detect(self, text: str, *, thread_id: str) -> list[dict]:
        """Run PII detection without anonymising. Returns flat list of detections.

        Each item has: text, label, start_pos, end_pos, confidence.

        piighost-api `/v1/detect` returns `start_pos`/`end_pos` flat on each
        Detection (not nested under `position`), so we forward them as-is.
        """
        body = await self._post_json("/v1/detect", {"text": text, "thread_id": thread_id})
        return [
            {
                "text": d["text"],
                "label": d["label"],
                "start_pos": d["start_pos"],
                "end_pos": d["end_pos"],
                "confidence": d["confidence"],
            }
            for entity in body.get("entities", [])
            for d in entity.get("detections", [])
        ]

    async def override_detections(
        self, text: str, detections: list[dict], *, thread_id: str
    ) -> None:
        """PUT the corrected detections to piighost-api so the next anonymize()
        respects them. ``detections`` is a list of dicts with keys text, label,
        start_pos, end_pos, confidence — sent flat (matches the GET shape)."""
        payload_detections = [
            {
                "text": d["text"],
                "label": d["label"],
                "start_pos": d["start_pos"],
                "end_pos": d["end_pos"],
                "confidence": d["confidence"],
            }
            for d in detections
        ]
        await self._put_json(
            "/v1/detect",
            {"text": text, "thread_id": thread_id, "detections": payload_detections},
        )

    async def get_labels(self) -> list[str]:
        """Return the configured label set from piighost-api."""
        body = await self._get_json("/v1/config")
        return list(body.get("labels") or [])

    async def _post_json(self, path: str, payload: dict) -> dict:
        """POST JSON, raise AnonymizeError on HTTP failure, return parsed body."""
        async with httpx.AsyncClient(timeout=self._timeout) as http:
            try:
                response = await http.post(f"{self._base_url}{path}", json=payload)
                response.raise_for_status()
            except httpx.HTTPError as exc:
                raise AnonymizeError(f"piighost-api {path} failed: {exc}") from exc
        return response.json()

    async def _put_json(self, path: str, payload: dict) -> dict:
        async with httpx.AsyncClient(timeout=self._timeout) as http:
            try:
                response = await http.put(f"{self._base_url}{path}", json=payload)
                response.raise_for_status()
            except httpx.HTTPError as exc:
                raise AnonymizeError(f"piighost-api PUT {path} failed: {exc}") from exc
        return response.json() if response.content else {}

    async def _get_json(self, path: str) -> dict:
        async with httpx.AsyncClient(timeout=self._timeout) as http:
            try:
                response = await http.get(f"{self._base_url}{path}")
                response.raise_for_status()
            except httpx.HTTPError as exc:
                raise AnonymizeError(f"piighost-api {path} failed: {exc}") from exc
        return response.json()

    async def _call(self, path: str, text: str, thread_id: str, *, response_key: str) -> str:
        body = await self._post_json(path, {"text": text, "thread_id": thread_id})
        return body[response_key]
