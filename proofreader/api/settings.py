"""Runtime configuration loaded from environment variables."""

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    piighost_api_url: str
    litellm_model: str
    litellm_api_key: str
    litellm_api_base: str | None
    max_pdf_bytes: int


def load_settings() -> Settings:
    return Settings(
        piighost_api_url=os.environ.get("PIIGHOST_API_URL", "http://localhost:8000"),
        litellm_model=os.environ.get("LITELLM_MODEL", "gpt-4o-mini"),
        litellm_api_key=os.environ.get("LITELLM_API_KEY", ""),
        litellm_api_base=os.environ.get("LITELLM_API_BASE") or None,
        max_pdf_bytes=int(os.environ.get("MAX_PDF_BYTES", str(10 * 1024 * 1024))),
    )
