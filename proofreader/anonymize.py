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
        """
        async with httpx.AsyncClient(timeout=self._timeout) as http:
            try:
                response = await http.post(
                    f"{self._base_url}/v1/detect",
                    json={"text": text, "thread_id": thread_id},
                )
                response.raise_for_status()
            except httpx.HTTPError as exc:
                raise AnonymizeError(f"piighost-api /v1/detect failed: {exc}") from exc
        body = response.json()
        return [
            {
                "text": d["text"],
                "label": d["label"],
                "start_pos": d["position"]["start_pos"],
                "end_pos": d["position"]["end_pos"],
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
        start_pos, end_pos, confidence."""
        payload_detections = [
            {
                "text": d["text"],
                "label": d["label"],
                "position": {"start_pos": d["start_pos"], "end_pos": d["end_pos"]},
                "confidence": d["confidence"],
            }
            for d in detections
        ]
        async with httpx.AsyncClient(timeout=self._timeout) as http:
            try:
                response = await http.put(
                    f"{self._base_url}/v1/detect",
                    json={
                        "text": text,
                        "thread_id": thread_id,
                        "detections": payload_detections,
                    },
                )
                response.raise_for_status()
            except httpx.HTTPError as exc:
                raise AnonymizeError(
                    f"piighost-api PUT /v1/detect failed: {exc}"
                ) from exc

    async def get_labels(self) -> list[str]:
        """Return the configured label set from piighost-api."""
        async with httpx.AsyncClient(timeout=self._timeout) as http:
            try:
                response = await http.get(f"{self._base_url}/v1/config")
                response.raise_for_status()
            except httpx.HTTPError as exc:
                raise AnonymizeError(f"piighost-api /v1/config failed: {exc}") from exc
        return list(response.json().get("labels") or [])

    async def _call(self, path: str, text: str, thread_id: str, *, response_key: str) -> str:
        async with httpx.AsyncClient(timeout=self._timeout) as http:
            try:
                response = await http.post(
                    f"{self._base_url}{path}",
                    json={"text": text, "thread_id": thread_id},
                )
                response.raise_for_status()
            except httpx.HTTPError as exc:
                raise AnonymizeError(f"piighost-api {path} failed: {exc}") from exc
        body = response.json()
        return body[response_key]
