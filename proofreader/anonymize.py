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
        return await self._call("/v1/deanonymize", text, thread_id, response_key="text")

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
