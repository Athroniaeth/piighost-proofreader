# FastAPI Backend + Frontend Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the existing Streamlit pipeline (`app.py:_run_pipeline`) as a FastAPI endpoint that streams each mistake to the React frontend via Server-Sent Events, with Instructor providing partial LLM output so the frontend renders mistakes as the model produces them.

**Architecture:** `proofreader/api/` package wraps the existing modules. The route validates the upload (413/415/422 early returns), then returns a `StreamingResponse` whose generator yields formatted SSE events from `run_pipeline(...)`. The pipeline is async-native: `extract_markdown` runs in a worker thread (JVM blocks), `anonymize`/`deanonymize` keep their existing httpx-async client, `stream_mistakes` uses Instructor's `create_iterable` over `litellm.acompletion` to yield one `Mistake` at a time, and each one is deanonymised (4 parallel httpx calls) and located before being emitted. Streamlit's `app.py` is untouched — `proofreader.llm` keeps the old `build_chain` / `proofread` exports alongside the new `stream_mistakes`. The frontend gains a `useResultStream` hook + `parseSSE` parser and extends `useAppState` with `STREAM_*` actions.

**Tech Stack:** FastAPI 0.115, uvicorn[standard], Instructor 1.6, litellm 1.50, python-multipart, anyio, httpx (already present), pytest-asyncio + respx (already present); on the frontend Vite proxy + native `fetch` + `ReadableStream` for SSE consumption.

---

## Cross-task conventions

- Backend tests live in `tests/api/`. Frontend tests live in `frontend/tests/`. Don't mix.
- All backend tasks run from `/home/secondary/PycharmProjects/piighost-proofreader/`. All frontend tasks run from `frontend/`.
- TDD where the unit is pure logic (sse formatter, parseSSE, reducers, error mapping). Integration smoke for the FastAPI route via `httpx.AsyncClient(app=app)`. Manual walkthrough at the end.
- The Streamlit `app.py` MUST keep working through every backend task. We add to `proofreader/llm.py`, we never remove from it.
- Commits per task — every task's last step is the commit. Don't batch commits.

---

## File Structure

```
piighost-proofreader/
├── pyproject.toml                                    # MODIFIED — add fastapi, uvicorn, instructor, litellm, python-multipart
├── proofreader/
│   ├── api/                                          # NEW package
│   │   ├── __init__.py                               # NEW (empty)
│   │   ├── app.py                                    # NEW — FastAPI app + lifespan + CORS
│   │   ├── routes.py                                 # NEW — POST /api/proofread, GET /api/health
│   │   ├── pipeline.py                               # NEW — run_pipeline async generator + helpers
│   │   ├── sse.py                                    # NEW — format_sse helper
│   │   └── errors.py                                 # NEW — PipelineError types + mapping
│   ├── anonymize.py                                  # UNCHANGED
│   ├── language.py                                   # UNCHANGED
│   ├── llm.py                                        # MODIFIED — add stream_mistakes (keep build_chain/proofread)
│   ├── locator.py                                    # UNCHANGED
│   ├── models.py                                     # UNCHANGED
│   ├── pdf_extraction.py                             # UNCHANGED
│   ├── pdf_render.py                                 # UNCHANGED
│   └── highlight.py                                  # UNCHANGED (Streamlit-only)
├── app.py                                            # UNCHANGED (Streamlit)
├── tests/
│   ├── api/                                          # NEW directory
│   │   ├── __init__.py                               # NEW (empty)
│   │   ├── conftest.py                               # NEW — shared async fixtures (tiny PDF bytes)
│   │   ├── test_sse.py                               # NEW
│   │   ├── test_errors.py                            # NEW
│   │   ├── test_pipeline.py                          # NEW
│   │   ├── test_routes.py                            # NEW
│   │   └── test_llm_stream.py                        # NEW
│   └── (existing tests unchanged)
└── frontend/
    ├── vite.config.ts                                # MODIFIED — proxy /api → :8001
    ├── src/
    │   ├── App.tsx                                   # MODIFIED — call useResultStream, handle ?fake simulation
    │   ├── lib/
    │   │   ├── types.ts                              # MODIFIED — drop pdf_base64, add unlocatable, ProgressStep
    │   │   └── parseSSE.ts                           # NEW
    │   ├── hooks/
    │   │   ├── useAppState.ts                        # MODIFIED — STREAM_* actions
    │   │   └── useResultStream.ts                    # NEW
    │   ├── components/
    │   │   ├── PdfPanel.tsx                          # MODIFIED — pdfBase64 → pdfBytes
    │   │   ├── ResultsState.tsx                      # MODIFIED — pass pdfBytes, mount streaming indicator
    │   │   ├── TopBar.tsx                            # MODIFIED — show "en cours…" while streaming
    │   │   └── MistakesPanel.tsx                     # MODIFIED — show progress footer while streaming
    │   └── fixtures/
    │       ├── sample-result.json                    # MODIFIED — drop pdf_base64
    │       └── sample-cv.pdf                         # NEW (binary)
    └── tests/
        ├── parseSSE.test.ts                          # NEW
        └── appState.test.ts                          # MODIFIED — cover STREAM_* actions
```

---

### Task 1: Backend scaffolding + health endpoint

**Files:**
- Modify: `pyproject.toml`
- Create: `proofreader/api/__init__.py`, `proofreader/api/app.py`, `proofreader/api/routes.py`
- Create: `tests/api/__init__.py`, `tests/api/test_routes.py`

- [ ] **Step 1: Add the backend deps to `pyproject.toml`**

Open `pyproject.toml` and replace the `dependencies` array with:

```toml
dependencies = [
    "streamlit>=1.46",
    "opendataloader-pdf>=0.5",
    "pymupdf>=1.24",
    "pillow>=10.4",
    "lingua-language-detector>=2.0",
    "httpx>=0.27",
    "langchain>=1.2",
    "langchain-litellm>=0.1",
    "pydantic>=2.7",
    "python-dotenv>=1.0",
    "fastapi>=0.115",
    "uvicorn[standard]>=0.30",
    "instructor>=1.6",
    "litellm>=1.50",
    "python-multipart>=0.0.9",
    "anyio>=4.4",
]
```

- [ ] **Step 2: Sync the deps**

```bash
uv sync --group dev
```

Expected: `uv` installs fastapi, uvicorn, instructor, litellm, python-multipart, anyio without errors.

- [ ] **Step 3: Create `proofreader/api/__init__.py`**

```python
"""FastAPI app exposing the proofreading pipeline as an SSE endpoint."""
```

- [ ] **Step 4: Create `proofreader/api/routes.py`**

```python
"""HTTP routes for the proofreading API."""

from fastapi import APIRouter

router = APIRouter(prefix="/api")


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 5: Create `proofreader/api/app.py`**

```python
"""FastAPI application factory."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from proofreader.api.routes import router


def create_app() -> FastAPI:
    app = FastAPI(title="piighost-proofreader API", version="0.1.0")
    # CORS for the Vite dev server. Production nginx serves both origins, so the
    # browser never crosses origins there.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173"],
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )
    app.include_router(router)
    return app


app = create_app()
```

- [ ] **Step 6: Create `tests/api/__init__.py` (empty file) and `tests/api/test_routes.py`**

`tests/api/__init__.py`:
```python
```

`tests/api/test_routes.py`:
```python
"""Tests for the API routes."""

import httpx

from proofreader.api.app import app


async def test_health_returns_ok():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 7: Run the test**

```bash
uv run pytest tests/api/test_routes.py::test_health_returns_ok -xvs
```

Expected: PASS, 1 test.

- [ ] **Step 8: Smoke uvicorn**

```bash
uv run uvicorn proofreader.api.app:app --port 8001 &
sleep 2
curl -s http://localhost:8001/api/health
kill %1
```

Expected: `{"status":"ok"}` on stdout, no errors.

- [ ] **Step 9: Commit**

```bash
git add pyproject.toml uv.lock proofreader/api/ tests/api/
git commit -m "feat(api): scaffold FastAPI app with /api/health endpoint"
```

---

### Task 2: SSE formatter

**Files:**
- Create: `proofreader/api/sse.py`
- Create: `tests/api/test_sse.py`

- [ ] **Step 1: Write the failing test `tests/api/test_sse.py`**

```python
"""Tests for SSE event formatting."""

from proofreader.api.sse import format_sse


def test_format_sse_emits_event_and_data_lines():
    out = format_sse("meta", {"language": "fr", "page_count": 1})
    assert out == b'event: meta\ndata: {"language":"fr","page_count":1}\n\n'


def test_format_sse_handles_unicode_without_escaping():
    out = format_sse("mistake", {"description": "Démonstration"})
    text = out.decode("utf-8")
    assert "Démonstration" in text
    assert text.endswith("\n\n")


def test_format_sse_with_empty_data():
    out = format_sse("done", {})
    assert out == b"event: done\ndata: {}\n\n"
```

- [ ] **Step 2: Run test, verify failure**

```bash
uv run pytest tests/api/test_sse.py -xvs
```

Expected: FAIL with `ModuleNotFoundError: No module named 'proofreader.api.sse'`.

- [ ] **Step 3: Implement `proofreader/api/sse.py`**

```python
"""Helpers for emitting Server-Sent Events."""

import json
from typing import Any


def format_sse(event_name: str, data: dict[str, Any]) -> bytes:
    """Serialize an SSE event payload as bytes.

    Uses compact JSON (no whitespace) so the on-wire size stays small,
    and `ensure_ascii=False` so unicode goes through as UTF-8 instead of
    `\\uXXXX` escapes (the frontend parser handles UTF-8 natively).
    """
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    return f"event: {event_name}\ndata: {payload}\n\n".encode("utf-8")
```

- [ ] **Step 4: Run test, verify pass**

```bash
uv run pytest tests/api/test_sse.py -xvs
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add proofreader/api/sse.py tests/api/test_sse.py
git commit -m "feat(api): SSE event formatter with compact UTF-8 JSON"
```

---

### Task 3: Error types + mapping

**Files:**
- Create: `proofreader/api/errors.py`
- Create: `tests/api/test_errors.py`

- [ ] **Step 1: Write failing test `tests/api/test_errors.py`**

```python
"""Tests for the API error mapping."""

import httpx
import pytest

import litellm

from proofreader.api.errors import (
    NoTextLayerError,
    classify_exception,
)


def test_no_text_layer_error_is_an_exception():
    err = NoTextLayerError("empty extraction")
    assert isinstance(err, Exception)
    assert str(err) == "empty extraction"


def test_classify_httpx_error_returns_backend_down():
    exc = httpx.ConnectError("connection refused")
    reason, message = classify_exception(exc)
    assert reason == "backend-down"
    assert "connection" in message.lower()


def test_classify_rate_limit_error():
    exc = litellm.exceptions.RateLimitError(
        message="rate limited", llm_provider="openai", model="gpt-4o-mini"
    )
    reason, _ = classify_exception(exc)
    assert reason == "rate-limit"


def test_classify_unknown_exception_returns_internal():
    exc = ValueError("something broke")
    reason, message = classify_exception(exc)
    assert reason == "internal"
    assert "something broke" in message
```

- [ ] **Step 2: Run test, verify failure**

```bash
uv run pytest tests/api/test_errors.py -xvs
```

Expected: FAIL, module missing.

- [ ] **Step 3: Implement `proofreader/api/errors.py`**

```python
"""Domain exceptions and exception → SSE-reason mapping."""

import httpx
import litellm


class PipelineError(RuntimeError):
    """Base class for errors surfaced through the pipeline."""


class NoTextLayerError(PipelineError):
    """Raised when the PDF has no extractable text (probably a scan)."""


ErrorReason = str  # "backend-down" | "rate-limit" | "internal" | "no-text-layer"


def classify_exception(exc: BaseException) -> tuple[ErrorReason, str]:
    """Map an in-stream exception to (sse_reason, human_message).

    The mapping is intentionally narrow: only failure modes the frontend
    has a dedicated UI for return a non-internal reason.
    """
    if isinstance(exc, NoTextLayerError):
        return "no-text-layer", str(exc) or "PDF has no extractable text"
    if isinstance(exc, litellm.exceptions.RateLimitError):
        return "rate-limit", str(exc)
    if isinstance(exc, httpx.HTTPError):
        return "backend-down", str(exc) or repr(exc)
    return "internal", str(exc) or exc.__class__.__name__
```

- [ ] **Step 4: Run tests, verify pass**

```bash
uv run pytest tests/api/test_errors.py -xvs
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add proofreader/api/errors.py tests/api/test_errors.py
git commit -m "feat(api): exception types and SSE-reason classifier"
```

---

### Task 4: `llm.py` adds `stream_mistakes` (Instructor + litellm)

**Files:**
- Modify: `proofreader/llm.py`
- Create: `tests/api/test_llm_stream.py`

- [ ] **Step 1: Write the failing test `tests/api/test_llm_stream.py`**

```python
"""Tests for the streaming LLM client."""

import os
from collections.abc import AsyncIterator
from typing import Any
from unittest.mock import patch

import pytest

from proofreader.llm import stream_mistakes
from proofreader.models import Mistake


class _FakeInstructorClient:
    """Mimics instructor.from_litellm()'s client.chat.completions.create_iterable."""

    def __init__(self, mistakes: list[Mistake]) -> None:
        self._mistakes = mistakes
        self.chat = self  # so client.chat.completions resolves
        self.completions = self
        self.last_kwargs: dict[str, Any] = {}

    def create_iterable(self, **kwargs: Any) -> AsyncIterator[Mistake]:
        self.last_kwargs = kwargs

        async def gen() -> AsyncIterator[Mistake]:
            for m in self._mistakes:
                yield m

        return gen()


async def test_stream_mistakes_yields_each_mistake_from_client():
    expected = [
        Mistake(
            error_text="exempel",
            correction="example",
            description="orth",
            type="orthographe",
            context_before="this is an",
        ),
        Mistake(
            error_text="erorr",
            correction="error",
            description="typo",
            type="orthographe",
            context_before="another",
        ),
    ]
    fake = _FakeInstructorClient(expected)
    with patch("proofreader.llm.instructor.from_litellm", return_value=fake):
        collected = []
        async for m in stream_mistakes(
            markdown="text",
            language="en",
            model="gpt-4o-mini",
            api_key="dummy",
            api_base=None,
        ):
            collected.append(m)
    assert collected == expected
    assert fake.last_kwargs["model"] == "gpt-4o-mini"
    assert fake.last_kwargs["response_model"] is Mistake


@pytest.mark.skipif(
    not os.getenv("LITELLM_API_KEY"), reason="LITELLM_API_KEY not set"
)
async def test_stream_mistakes_real_llm():
    """Smoke test against a real LLM, skipped without credentials."""
    collected = []
    async for m in stream_mistakes(
        markdown="This is a smple sentance.",
        language="en",
        model=os.environ.get("LITELLM_MODEL", "gpt-4o-mini"),
        api_key=os.environ["LITELLM_API_KEY"],
        api_base=os.environ.get("LITELLM_API_BASE") or None,
    ):
        collected.append(m)
    assert len(collected) >= 1
```

- [ ] **Step 2: Run test, verify failure**

```bash
uv run pytest tests/api/test_llm_stream.py::test_stream_mistakes_yields_each_mistake_from_client -xvs
```

Expected: FAIL — `stream_mistakes` not exported from `proofreader.llm`.

- [ ] **Step 3: Modify `proofreader/llm.py` to add `stream_mistakes`**

Open `proofreader/llm.py` and append (do NOT touch the existing `SYSTEM_PROMPT`, `build_chain`, `proofread`):

```python
import instructor
import litellm

from collections.abc import AsyncIterator


SYSTEM_PROMPT_STREAM = (
    "You are an expert proofreader. The text below is the Markdown extraction "
    "of a CV in {language}. For each mistake you find, emit a JSON object with "
    "fields: error_text (exact substring from the markdown), correction "
    "(suggested fix), description (short explanation in {language}, max 15 "
    "words), type (one of orthographe, grammaire, conjugaison, accord, "
    "ponctuation), context_before (3-5 words preceding the error verbatim). "
    "Be exhaustive."
)


async def stream_mistakes(
    *,
    markdown: str,
    language: str,
    model: str,
    api_key: str,
    api_base: str | None = None,
) -> AsyncIterator[Mistake]:
    """Stream proofreading mistakes from the LLM one at a time.

    Uses Instructor's create_iterable so the frontend sees each mistake
    appear as the model emits it, instead of waiting for the full list.
    """
    client = instructor.from_litellm(litellm.acompletion)
    response = client.chat.completions.create_iterable(
        model=model,
        api_key=api_key,
        api_base=api_base,
        response_model=Mistake,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT_STREAM.format(language=language)},
            {"role": "user", "content": markdown},
        ],
    )
    async for mistake in response:
        yield mistake
```

`Mistake` is already imported at the top of `llm.py` via `from proofreader.models import ProofreadResult` — change that import line to `from proofreader.models import Mistake, ProofreadResult` so both are available.

- [ ] **Step 4: Run the test, verify pass**

```bash
uv run pytest tests/api/test_llm_stream.py::test_stream_mistakes_yields_each_mistake_from_client -xvs
```

Expected: PASS.

- [ ] **Step 5: Verify Streamlit is still importable (no regression)**

```bash
uv run python -c "from proofreader.llm import build_chain, proofread, stream_mistakes; print('OK')"
```

Expected: `OK`.

- [ ] **Step 6: Commit**

```bash
git add proofreader/llm.py tests/api/test_llm_stream.py
git commit -m "feat(llm): add async stream_mistakes via Instructor + litellm"
```

---

### Task 5: Pipeline helpers — `deanonymize_mistake` and `locate_in_any_page`

**Files:**
- Create: `proofreader/api/pipeline.py` (helpers only — full pipeline in Task 7)
- Create: `tests/api/test_pipeline.py`

- [ ] **Step 1: Write the failing test `tests/api/test_pipeline.py`**

```python
"""Tests for the async pipeline helpers."""

from pathlib import Path
from unittest.mock import AsyncMock

import fitz
import pytest

from proofreader.api.pipeline import deanonymize_mistake, locate_in_any_page
from proofreader.models import Mistake
from proofreader.pdf_render import PdfDocument


async def test_deanonymize_mistake_calls_client_for_each_string_field():
    mistake = Mistake(
        error_text="<PERSON_1>",
        correction="<PERSON_1> correct",
        description="error involving <PERSON_1>",
        type="orthographe",
        context_before="around <PERSON_1>",
    )
    client = AsyncMock()
    # Each call substitutes <PERSON_1> -> "Jean"
    client.deanonymize.side_effect = lambda text, thread_id: text.replace("<PERSON_1>", "Jean")

    out = await deanonymize_mistake(mistake, client=client, thread_id="t1")

    assert out.error_text == "Jean"
    assert out.correction == "Jean correct"
    assert out.description == "error involving Jean"
    assert out.context_before == "around Jean"
    assert client.deanonymize.await_count == 4


def test_locate_in_any_page_returns_first_match(tmp_path: Path):
    pdf_path = tmp_path / "tiny.pdf"
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 100), "Voici un exemple simple", fontsize=12)
    doc.save(pdf_path)
    doc.close()
    pdf = PdfDocument(pdf_path)
    all_words = {p: list(pdf.words(p)) for p in range(pdf.page_count)}

    mistake = Mistake(
        error_text="exemple",
        correction="exemple correct",
        description="x",
        type="orthographe",
        context_before="Voici un",
    )
    located = locate_in_any_page(mistake, all_words=all_words)
    assert located is not None
    assert located.page_index == 0
    assert located.bbox[0] > 0


def test_locate_in_any_page_returns_none_when_nothing_matches(tmp_path: Path):
    pdf_path = tmp_path / "tiny.pdf"
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 100), "Hello world", fontsize=12)
    doc.save(pdf_path)
    doc.close()
    pdf = PdfDocument(pdf_path)
    all_words = {p: list(pdf.words(p)) for p in range(pdf.page_count)}

    mistake = Mistake(
        error_text="nonexistent",
        correction="x",
        description="x",
        type="orthographe",
        context_before="not in pdf",
    )
    assert locate_in_any_page(mistake, all_words=all_words) is None
```

- [ ] **Step 2: Run, verify failure**

```bash
uv run pytest tests/api/test_pipeline.py -xvs
```

Expected: FAIL, module missing.

- [ ] **Step 3: Create `proofreader/api/pipeline.py` with the two helpers**

```python
"""Async streaming pipeline for the proofreading API.

The full `run_pipeline` async generator lands in a later task. This file
starts with the small helpers it relies on so they can be tested
in isolation.
"""

import asyncio

from proofreader.anonymize import AnonymizationClient
from proofreader.locator import LocatedMistake, locate_mistake
from proofreader.models import Mistake
from proofreader.pdf_render import Word


async def deanonymize_mistake(
    mistake: Mistake, *, client: AnonymizationClient, thread_id: str
) -> Mistake:
    """Return a copy of ``mistake`` with all four text fields deanonymised.

    The four httpx round-trips run in parallel via asyncio.gather to keep
    the per-mistake latency close to a single round-trip.
    """
    error_text, correction, description, context_before = await asyncio.gather(
        client.deanonymize(mistake.error_text, thread_id=thread_id),
        client.deanonymize(mistake.correction, thread_id=thread_id),
        client.deanonymize(mistake.description, thread_id=thread_id),
        client.deanonymize(mistake.context_before, thread_id=thread_id),
    )
    return mistake.model_copy(
        update={
            "error_text": error_text,
            "correction": correction,
            "description": description,
            "context_before": context_before,
        }
    )


def locate_in_any_page(
    mistake: Mistake, *, all_words: dict[int, list[Word]]
) -> LocatedMistake | None:
    """Try every page in order and return the first match, or None."""
    for page_index in sorted(all_words):
        hit = locate_mistake(mistake, words=all_words[page_index])
        if hit is not None:
            return hit
    return None
```

- [ ] **Step 4: Run tests, verify pass**

```bash
uv run pytest tests/api/test_pipeline.py -xvs
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add proofreader/api/pipeline.py tests/api/test_pipeline.py
git commit -m "feat(api): pipeline helpers — parallel deanonymize + cross-page locate"
```

---

### Task 6: Pipeline conftest — tiny PDF fixture

**Files:**
- Create: `tests/api/conftest.py`

- [ ] **Step 1: Create `tests/api/conftest.py` with the shared fixture**

```python
"""Shared fixtures for API tests."""

from pathlib import Path

import fitz
import pytest


@pytest.fixture
def tiny_pdf_bytes() -> bytes:
    """An in-memory single-page PDF with a known sentence.

    Mirrors tests/conftest.py::tiny_pdf_path but returns the bytes
    directly so tests can POST them to the FastAPI client without
    touching disk.
    """
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text(
        (72, 100),
        "Voici un exemple simple avec une petite phrase.",
        fontsize=12,
    )
    out = doc.tobytes()
    doc.close()
    return out


@pytest.fixture
def empty_pdf_bytes(tmp_path: Path) -> bytes:
    """A PDF with no text layer (just an empty page)."""
    doc = fitz.open()
    doc.new_page()
    out = doc.tobytes()
    doc.close()
    return out
```

- [ ] **Step 2: Sanity-check the fixture loads**

```bash
uv run pytest --collect-only tests/api/conftest.py 2>&1 | head
```

Expected: no collection errors (an empty plan, but no import errors).

- [ ] **Step 3: Commit**

```bash
git add tests/api/conftest.py
git commit -m "test(api): shared tiny PDF fixtures for API tests"
```

---

### Task 7: `run_pipeline` async generator (happy path)

**Files:**
- Modify: `proofreader/api/pipeline.py`
- Modify: `tests/api/test_pipeline.py`

- [ ] **Step 1: Append a happy-path test to `tests/api/test_pipeline.py`**

Add this at the end of `tests/api/test_pipeline.py`:

```python
import json
from collections.abc import AsyncIterator
from unittest.mock import AsyncMock, patch

from proofreader.api.pipeline import run_pipeline


def _parse_events(emitted: list[bytes]) -> list[dict]:
    """Decode a list of SSE byte payloads into (event, data) dicts."""
    events = []
    for chunk in emitted:
        text = chunk.decode("utf-8").strip("\n")
        lines = text.split("\n")
        name = lines[0].removeprefix("event: ")
        payload = json.loads(lines[1].removeprefix("data: "))
        events.append({"event": name, "data": payload})
    return events


async def _fake_stream(mistakes: list[Mistake]) -> AsyncIterator[Mistake]:
    for m in mistakes:
        yield m


async def test_run_pipeline_emits_meta_progress_mistake_done(tiny_pdf_bytes):
    fake_anon = AsyncMock()
    fake_anon.anonymize = AsyncMock(return_value="Voici un exemple simple avec une petite phrase.")
    fake_anon.deanonymize = AsyncMock(side_effect=lambda text, thread_id: text)

    raw_mistakes = [
        Mistake(
            error_text="exemple",
            correction="exemple correct",
            description="Démonstration.",
            type="orthographe",
            context_before="Voici un",
        )
    ]

    with patch(
        "proofreader.api.pipeline.stream_mistakes",
        return_value=_fake_stream(raw_mistakes),
    ), patch(
        "proofreader.api.pipeline.AnonymizationClient", return_value=fake_anon
    ):
        emitted = [
            chunk
            async for chunk in run_pipeline(
                pdf_bytes=tiny_pdf_bytes,
                filename="t.pdf",
                debug=False,
                piighost_api_url="http://piighost",
                litellm_model="gpt-4o-mini",
                litellm_api_key="x",
                litellm_api_base=None,
            )
        ]

    events = _parse_events(emitted)
    names = [e["event"] for e in events]
    assert names[0] == "meta"
    assert names.count("progress") == 3
    assert "mistake" in names
    assert names[-1] == "done"
    meta = events[0]["data"]
    assert meta["language"] == "fr"
    assert meta["page_count"] == 1
    assert meta["filename"] == "t.pdf"


async def test_run_pipeline_emits_debug_when_requested(tiny_pdf_bytes):
    fake_anon = AsyncMock()
    fake_anon.anonymize = AsyncMock(return_value="Voici un exemple simple avec une petite phrase.")
    fake_anon.deanonymize = AsyncMock(side_effect=lambda text, thread_id: text)

    with patch(
        "proofreader.api.pipeline.stream_mistakes",
        return_value=_fake_stream([]),
    ), patch(
        "proofreader.api.pipeline.AnonymizationClient", return_value=fake_anon
    ):
        emitted = [
            chunk
            async for chunk in run_pipeline(
                pdf_bytes=tiny_pdf_bytes,
                filename="t.pdf",
                debug=True,
                piighost_api_url="http://piighost",
                litellm_model="gpt-4o-mini",
                litellm_api_key="x",
                litellm_api_base=None,
            )
        ]

    events = _parse_events(emitted)
    names = [e["event"] for e in events]
    assert "debug" in names
    debug_payload = next(e["data"] for e in events if e["event"] == "debug")
    assert "markdown_raw" in debug_payload
    assert "markdown_anonymized" in debug_payload
    assert "word_stream" in debug_payload
```

- [ ] **Step 2: Run, verify failure**

```bash
uv run pytest tests/api/test_pipeline.py::test_run_pipeline_emits_meta_progress_mistake_done -xvs
```

Expected: FAIL — `run_pipeline` doesn't exist.

- [ ] **Step 3: Append `run_pipeline` to `proofreader/api/pipeline.py`**

Add these imports at the top of `proofreader/api/pipeline.py`:

```python
import tempfile
import uuid
from collections.abc import AsyncIterator
from pathlib import Path

import anyio.to_thread

from proofreader.api.errors import NoTextLayerError
from proofreader.api.sse import format_sse
from proofreader.language import detect_language
from proofreader.llm import stream_mistakes
from proofreader.pdf_extraction import extract_markdown
from proofreader.pdf_render import PdfDocument
```

Then append the function:

```python
async def run_pipeline(
    *,
    pdf_bytes: bytes,
    filename: str,
    debug: bool,
    piighost_api_url: str,
    litellm_model: str,
    litellm_api_key: str,
    litellm_api_base: str | None,
) -> AsyncIterator[bytes]:
    """Drive the proofreading pipeline and yield formatted SSE events.

    Raises NoTextLayerError if the PDF has no extractable text. All other
    in-stream failures are propagated as exceptions — the route wrapper
    converts them to `event: error` payloads.
    """
    thread_id = str(uuid.uuid4())

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as fp:
        fp.write(pdf_bytes)
        pdf_path = Path(fp.name)

    markdown = await anyio.to_thread.run_sync(extract_markdown, pdf_path)
    if not markdown.strip():
        raise NoTextLayerError("PDF has no extractable text")

    language = detect_language(markdown)
    doc = PdfDocument(pdf_path)
    all_words = {p: list(doc.words(p)) for p in range(doc.page_count)}
    page_sizes = [
        {"page": p, "width_pt": doc.page_size(p)[0], "height_pt": doc.page_size(p)[1]}
        for p in range(doc.page_count)
    ]

    yield format_sse(
        "meta",
        {
            "filename": filename,
            "language": language,
            "page_count": doc.page_count,
            "page_sizes": page_sizes,
            "thread_id": thread_id,
        },
    )
    yield format_sse("progress", {"step": "extracted"})

    client = AnonymizationClient(base_url=piighost_api_url)
    anonymized = await client.anonymize(markdown, thread_id=thread_id)
    yield format_sse("progress", {"step": "anonymized"})

    yield format_sse("progress", {"step": "llm-started"})

    mistake_count = 0
    unlocatable_count = 0
    async for raw in stream_mistakes(
        markdown=anonymized,
        language=language,
        model=litellm_model,
        api_key=litellm_api_key,
        api_base=litellm_api_base,
    ):
        clean = await deanonymize_mistake(raw, client=client, thread_id=thread_id)
        located = locate_in_any_page(clean, all_words=all_words)
        if located is not None:
            mistake_count += 1
            yield format_sse(
                "mistake",
                {
                    "page": located.page_index,
                    "bbox": list(located.bbox),
                    "error_text": clean.error_text,
                    "correction": clean.correction,
                    "description": clean.description,
                    "type": clean.type,
                    "context_before": clean.context_before,
                },
            )
        else:
            unlocatable_count += 1
            yield format_sse(
                "unlocatable",
                {
                    "error_text": clean.error_text,
                    "correction": clean.correction,
                    "description": clean.description,
                    "type": clean.type,
                    "context_before": clean.context_before,
                },
            )

    if debug:
        word_stream = [
            {"page": p, "text": w.text, "bbox": list(w.bbox)}
            for p, words in all_words.items()
            for w in words
        ]
        yield format_sse(
            "debug",
            {
                "markdown_raw": markdown,
                "markdown_anonymized": anonymized,
                "word_stream": word_stream,
            },
        )

    yield format_sse(
        "done",
        {"mistake_count": mistake_count, "unlocatable_count": unlocatable_count},
    )
```

- [ ] **Step 4: Run tests, verify pass**

```bash
uv run pytest tests/api/test_pipeline.py -xvs
```

Expected: PASS, 5 tests (3 existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add proofreader/api/pipeline.py tests/api/test_pipeline.py
git commit -m "feat(api): async run_pipeline streaming meta/progress/mistake/done events"
```

---

### Task 8: Settings + route validation (413, 415, 422)

**Files:**
- Create: `proofreader/api/settings.py`
- Modify: `proofreader/api/routes.py`
- Modify: `tests/api/test_routes.py`

- [ ] **Step 1: Create `proofreader/api/settings.py`**

```python
"""Runtime configuration loaded from environment variables.

Reads from the process environment at import time. The Streamlit
entry point loads .env via python-dotenv; the FastAPI entry point does
the same in app.py.
"""

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
```

- [ ] **Step 2: Append validation tests to `tests/api/test_routes.py`**

```python
import pytest

from proofreader.api.app import app


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
```

- [ ] **Step 3: Run tests, verify failure**

```bash
uv run pytest tests/api/test_routes.py -xvs
```

Expected: FAIL — the route `/api/proofread` doesn't exist yet.

- [ ] **Step 4: Add validation logic to `proofreader/api/routes.py`**

Replace `proofreader/api/routes.py` with:

```python
"""HTTP routes for the proofreading API."""

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from proofreader.api.settings import load_settings

router = APIRouter(prefix="/api")


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/proofread")
async def proofread(file: UploadFile = File(...)) -> JSONResponse:
    settings = load_settings()
    if file.content_type != "application/pdf":
        return JSONResponse(
            status_code=415,
            content={"reason": "not-pdf", "content_type": file.content_type or ""},
        )
    pdf_bytes = await file.read()
    if len(pdf_bytes) > settings.max_pdf_bytes:
        return JSONResponse(
            status_code=413,
            content={
                "reason": "too-large",
                "size_mb": round(len(pdf_bytes) / 1024 / 1024, 2),
                "max_mb": round(settings.max_pdf_bytes / 1024 / 1024, 2),
            },
        )
    # The streaming response comes in the next task.
    raise HTTPException(status_code=501, detail="streaming wired in next task")
```

- [ ] **Step 5: Run tests, verify validation tests pass**

```bash
uv run pytest tests/api/test_routes.py -xvs
```

Expected: PASS for `test_proofread_rejects_non_pdf_mime` and `test_proofread_rejects_oversized_pdf`. `test_health_returns_ok` still passes.

- [ ] **Step 6: Commit**

```bash
git add proofreader/api/settings.py proofreader/api/routes.py tests/api/test_routes.py
git commit -m "feat(api): pre-stream validation for MIME and PDF size"
```

---

### Task 9: Wire `run_pipeline` into the route + handle `no-text-layer`

**Files:**
- Modify: `proofreader/api/routes.py`
- Modify: `tests/api/test_routes.py`

- [ ] **Step 1: Append two tests to `tests/api/test_routes.py`**

```python
from collections.abc import AsyncIterator
from unittest.mock import AsyncMock, patch

from proofreader.models import Mistake


async def _fake_pipeline_stream(events: list[bytes]) -> AsyncIterator[bytes]:
    for chunk in events:
        yield chunk


async def test_proofread_streams_sse_events_on_happy_path(tiny_pdf_bytes):
    canned = [
        b'event: meta\ndata: {"language":"fr","page_count":1,"page_sizes":[],"thread_id":"x","filename":"t.pdf"}\n\n',
        b'event: done\ndata: {"mistake_count":0,"unlocatable_count":0}\n\n',
    ]

    async def fake_run_pipeline(**_kwargs):
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

    async def boom(**_kwargs):
        raise NoTextLayerError("empty extraction")
        yield  # pragma: no cover — generator type required

    with patch("proofreader.api.routes.run_pipeline", new=boom):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            files = {"file": ("blank.pdf", empty_pdf_bytes, "application/pdf")}
            response = await client.post("/api/proofread", files=files)
    assert response.status_code == 422
    assert response.json()["reason"] == "no-text-layer"
```

- [ ] **Step 2: Run, verify failure**

```bash
uv run pytest tests/api/test_routes.py -xvs
```

Expected: FAIL — the route still raises 501.

- [ ] **Step 3: Update `proofreader/api/routes.py` to wire the pipeline**

Replace the file with:

```python
"""HTTP routes for the proofreading API."""

from fastapi import APIRouter, File, Query, UploadFile
from fastapi.responses import JSONResponse, StreamingResponse

from proofreader.api.errors import NoTextLayerError, classify_exception
from proofreader.api.pipeline import run_pipeline
from proofreader.api.settings import load_settings
from proofreader.api.sse import format_sse

router = APIRouter(prefix="/api")


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/proofread")
async def proofread(
    file: UploadFile = File(...),
    debug: int = Query(0, description="Set ?debug=1 to include the debug event"),
):
    settings = load_settings()

    if file.content_type != "application/pdf":
        return JSONResponse(
            status_code=415,
            content={"reason": "not-pdf", "content_type": file.content_type or ""},
        )
    pdf_bytes = await file.read()
    if len(pdf_bytes) > settings.max_pdf_bytes:
        return JSONResponse(
            status_code=413,
            content={
                "reason": "too-large",
                "size_mb": round(len(pdf_bytes) / 1024 / 1024, 2),
                "max_mb": round(settings.max_pdf_bytes / 1024 / 1024, 2),
            },
        )

    # We need to materialise the FIRST chunk to detect NoTextLayerError before
    # opening the stream — that error must surface as HTTP 422, not as a
    # mid-stream SSE event.
    gen = run_pipeline(
        pdf_bytes=pdf_bytes,
        filename=file.filename or "upload.pdf",
        debug=bool(debug),
        piighost_api_url=settings.piighost_api_url,
        litellm_model=settings.litellm_model,
        litellm_api_key=settings.litellm_api_key,
        litellm_api_base=settings.litellm_api_base,
    )
    try:
        first = await gen.__anext__()
    except NoTextLayerError as exc:
        return JSONResponse(
            status_code=422,
            content={"reason": "no-text-layer", "message": str(exc)},
        )
    except StopAsyncIteration:
        return JSONResponse(
            status_code=500,
            content={"reason": "internal", "message": "pipeline yielded nothing"},
        )

    async def stream():
        yield first
        try:
            async for chunk in gen:
                yield chunk
        except BaseException as exc:  # noqa: BLE001 — convert to SSE error
            reason, message = classify_exception(exc)
            yield format_sse("error", {"reason": reason, "message": message})

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
```

- [ ] **Step 4: Run tests, verify pass**

```bash
uv run pytest tests/api/test_routes.py -xvs
```

Expected: PASS for all 4 tests (`test_health_returns_ok`, `test_proofread_rejects_non_pdf_mime`, `test_proofread_rejects_oversized_pdf`, `test_proofread_streams_sse_events_on_happy_path`, `test_proofread_returns_422_when_pipeline_raises_no_text_layer`).

- [ ] **Step 5: Commit**

```bash
git add proofreader/api/routes.py tests/api/test_routes.py
git commit -m "feat(api): wire pipeline into POST /api/proofread with SSE streaming and 422"
```

---

### Task 10: Mid-stream error event coverage

**Files:**
- Modify: `tests/api/test_routes.py`

- [ ] **Step 1: Append a mid-stream-error test to `tests/api/test_routes.py`**

```python
async def test_proofread_emits_error_event_when_pipeline_fails_mid_stream(tiny_pdf_bytes):
    import httpx as _httpx

    async def explosive_pipeline(**_kwargs):
        yield b'event: meta\ndata: {"language":"fr","page_count":1,"page_sizes":[],"thread_id":"x","filename":"t.pdf"}\n\n'
        raise _httpx.ConnectError("piighost-api down")

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
```

- [ ] **Step 2: Run, verify pass**

```bash
uv run pytest tests/api/test_routes.py::test_proofread_emits_error_event_when_pipeline_fails_mid_stream -xvs
```

Expected: PASS. The route already catches `BaseException` in the streaming generator (Task 9), so no implementation change needed — this test guards the contract.

- [ ] **Step 3: Run the full test suite to confirm nothing else regressed**

```bash
uv run pytest -x
```

Expected: all tests pass, including the pre-existing Streamlit/locator/llm tests.

- [ ] **Step 4: Commit**

```bash
git add tests/api/test_routes.py
git commit -m "test(api): cover mid-stream error event for backend-down"
```

---

### Task 11: End-to-end live smoke (skipped without LITELLM_API_KEY)

**Files:**
- Create: `tests/api/test_routes_live.py`

- [ ] **Step 1: Write the live smoke test**

```python
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
    async with httpx.AsyncClient(transport=transport, base_url="http://test", timeout=60.0) as client:
        files = {"file": ("live.pdf", pdf_bytes, "application/pdf")}
        response = await client.post("/api/proofread", files=files)
        assert response.status_code == 200
        events_text = response.text

    # Crude SSE parse: split on blank lines, look for any `event: mistake`.
    mistakes = 0
    for chunk in events_text.split("\n\n"):
        if chunk.startswith("event: mistake"):
            mistakes += 1
            data_line = chunk.splitlines()[1]
            payload = json.loads(data_line.removeprefix("data: "))
            assert "bbox" in payload
            assert "correction" in payload
    assert mistakes >= 1, "live LLM should have detected at least one mistake"
```

- [ ] **Step 2: Run the suite, confirm the live test is skipped on CI/local without keys**

```bash
uv run pytest tests/api/test_routes_live.py -v
```

Expected: 1 test, status `SKIPPED` (unless you have the keys set).

- [ ] **Step 3: Commit**

```bash
git add tests/api/test_routes_live.py
git commit -m "test(api): end-to-end live smoke (skipped without credentials)"
```

---

### Task 12: Frontend types + `parseSSE` parser (TDD)

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Create: `frontend/src/lib/parseSSE.ts`
- Create: `frontend/tests/parseSSE.test.ts`

- [ ] **Step 1: Modify `frontend/src/lib/types.ts`**

Replace the file with:

```typescript
// Mirror of proofreader/models.py — keep field names byte-identical.

export type MistakeType =
  | "orthographe"
  | "grammaire"
  | "conjugaison"
  | "accord"
  | "ponctuation";

export interface Mistake {
  error_text: string;
  correction: string;
  description: string;
  type: MistakeType;
  context_before: string;
}

export interface LocatedMistake extends Mistake {
  page: number;
  bbox: [number, number, number, number]; // (x0, y0, x1, y1) in PDF points
}

export interface PageSize {
  page: number;
  width_pt: number;
  height_pt: number;
}

export type ProgressStep = "extracted" | "anonymized" | "llm-started" | "done";

export interface ProofreadResult {
  language: string;
  filename: string;
  page_count: number;
  page_sizes: PageSize[];
  mistakes: LocatedMistake[];
  unlocatable: Mistake[];
  markdown_raw?: string;
  markdown_anonymized?: string;
  thread_id?: string;
  word_stream?: { page: number; text: string; bbox: [number, number, number, number] }[];
}
```

`pdf_base64` is gone — the frontend uses the uploaded `File` bytes directly.

- [ ] **Step 2: Write the failing parser test `frontend/tests/parseSSE.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { parseSSE } from "@/lib/parseSSE";

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
}

async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const v of it) out.push(v);
  return out;
}

describe("parseSSE", () => {
  it("yields one event per `\\n\\n`-separated chunk", async () => {
    const stream = streamFromChunks([
      'event: meta\ndata: {"language":"fr"}\n\n',
      'event: done\ndata: {}\n\n',
    ]);
    const events = await collect(parseSSE(stream));
    expect(events).toEqual([
      { name: "meta", data: { language: "fr" } },
      { name: "done", data: {} },
    ]);
  });

  it("handles events split across chunks", async () => {
    const stream = streamFromChunks([
      'event: mist',
      'ake\ndata: {"error_te',
      'xt":"x"}\n\nevent: done\ndata: {}\n\n',
    ]);
    const events = await collect(parseSSE(stream));
    expect(events).toEqual([
      { name: "mistake", data: { error_text: "x" } },
      { name: "done", data: {} },
    ]);
  });

  it("flushes the buffer when the stream ends without trailing \\n\\n", async () => {
    const stream = streamFromChunks(['event: done\ndata: {}']);
    const events = await collect(parseSSE(stream));
    expect(events).toEqual([{ name: "done", data: {} }]);
  });

  it("preserves UTF-8 in data payloads", async () => {
    const stream = streamFromChunks(['event: m\ndata: {"d":"Démonstration"}\n\n']);
    const events = await collect(parseSSE(stream));
    expect(events[0].data.d).toBe("Démonstration");
  });
});
```

- [ ] **Step 3: Run, verify failure**

```bash
cd frontend && npx vitest run tests/parseSSE.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 4: Implement `frontend/src/lib/parseSSE.ts`**

```typescript
export interface SSEEvent {
  name: string;
  data: unknown;
}

/**
 * Consume a fetch ReadableStream of SSE bytes and yield one parsed event
 * per `\n\n`-separated chunk. Tolerates events split across multiple
 * reads (buffered until a separator is seen) and flushes a final
 * unterminated event when the stream closes.
 */
export async function* parseSSE(
  body: ReadableStream<Uint8Array>
): AsyncIterable<SSEEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      const trimmed = buffer.trim();
      if (trimmed.length > 0) {
        const ev = parseChunk(trimmed);
        if (ev) yield ev;
      }
      return;
    }
    buffer += decoder.decode(value, { stream: true });
    let sepIndex: number;
    while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, sepIndex);
      buffer = buffer.slice(sepIndex + 2);
      const ev = parseChunk(chunk);
      if (ev) yield ev;
    }
  }
}

function parseChunk(chunk: string): SSEEvent | null {
  let name = "message";
  let dataPart = "";
  for (const line of chunk.split("\n")) {
    if (line.startsWith("event:")) name = line.slice(6).trim();
    else if (line.startsWith("data:")) dataPart += line.slice(5).trim();
  }
  if (!dataPart) return { name, data: {} };
  try {
    return { name, data: JSON.parse(dataPart) };
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Run tests, verify pass**

```bash
npx vitest run tests/parseSSE.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 6: Build to confirm no TS regression elsewhere**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
cd /home/secondary/PycharmProjects/piighost-proofreader
git add frontend/src/lib/types.ts frontend/src/lib/parseSSE.ts frontend/tests/parseSSE.test.ts
git commit -m "feat(frontend): SSE stream parser + drop pdf_base64 from types"
```

---

### Task 13: `useAppState` reducer extension (TDD)

**Files:**
- Modify: `frontend/src/hooks/useAppState.ts`
- Modify: `frontend/tests/appState.test.ts`

- [ ] **Step 1: Replace `frontend/tests/appState.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { appReducer, initialAppState, type AppState } from "@/hooks/useAppState";
import type { LocatedMistake, Mistake } from "@/lib/types";

const META = {
  filename: "cv.pdf",
  language: "fr",
  page_count: 1,
  page_sizes: [{ page: 0, width_pt: 595, height_pt: 842 }],
  thread_id: "uuid-x",
};
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"
const SAMPLE_MISTAKE: LocatedMistake = {
  error_text: "x",
  correction: "y",
  description: "d",
  type: "orthographe",
  context_before: "c",
  page: 0,
  bbox: [10, 20, 30, 40],
};
const SAMPLE_UNLOCATABLE: Mistake = {
  error_text: "u",
  correction: "v",
  description: "e",
  type: "grammaire",
  context_before: "c",
};

describe("appReducer", () => {
  it("starts empty", () => {
    expect(initialAppState).toEqual({ kind: "empty" });
  });

  it("UPLOAD_STARTED transitions empty → loading", () => {
    expect(appReducer({ kind: "empty" }, { type: "UPLOAD_STARTED", filename: "cv.pdf" })).toEqual({
      kind: "loading",
      filename: "cv.pdf",
    });
  });

  it("STREAM_META from loading transitions to results with empty lists and streaming=true", () => {
    const start: AppState = { kind: "loading", filename: "cv.pdf" };
    const next = appReducer(start, { type: "STREAM_META", meta: META, pdfBytes: PDF_BYTES });
    expect(next.kind).toBe("results");
    if (next.kind !== "results") return;
    expect(next.streaming).toBe(true);
    expect(next.progress).toBe("extracted");
    expect(next.data.mistakes).toEqual([]);
    expect(next.data.unlocatable).toEqual([]);
    expect(next.pdfBytes).toBe(PDF_BYTES);
  });

  it("STREAM_PROGRESS updates progress without leaving results", () => {
    const start = appReducer(
      { kind: "loading", filename: "cv.pdf" },
      { type: "STREAM_META", meta: META, pdfBytes: PDF_BYTES }
    );
    const next = appReducer(start, { type: "STREAM_PROGRESS", step: "anonymized" });
    expect(next.kind).toBe("results");
    if (next.kind !== "results") return;
    expect(next.progress).toBe("anonymized");
  });

  it("STREAM_MISTAKE appends to data.mistakes", () => {
    const after_meta = appReducer(
      { kind: "loading", filename: "cv.pdf" },
      { type: "STREAM_META", meta: META, pdfBytes: PDF_BYTES }
    );
    const next = appReducer(after_meta, { type: "STREAM_MISTAKE", mistake: SAMPLE_MISTAKE });
    expect(next.kind).toBe("results");
    if (next.kind !== "results") return;
    expect(next.data.mistakes).toEqual([SAMPLE_MISTAKE]);
  });

  it("STREAM_UNLOCATABLE appends to data.unlocatable", () => {
    const after_meta = appReducer(
      { kind: "loading", filename: "cv.pdf" },
      { type: "STREAM_META", meta: META, pdfBytes: PDF_BYTES }
    );
    const next = appReducer(after_meta, {
      type: "STREAM_UNLOCATABLE",
      mistake: SAMPLE_UNLOCATABLE,
    });
    expect(next.kind).toBe("results");
    if (next.kind !== "results") return;
    expect(next.data.unlocatable).toEqual([SAMPLE_UNLOCATABLE]);
  });

  it("STREAM_DEBUG merges debug fields into data", () => {
    const after_meta = appReducer(
      { kind: "loading", filename: "cv.pdf" },
      { type: "STREAM_META", meta: META, pdfBytes: PDF_BYTES }
    );
    const next = appReducer(after_meta, {
      type: "STREAM_DEBUG",
      debug: {
        markdown_raw: "raw",
        markdown_anonymized: "anon",
        word_stream: [{ page: 0, text: "Voici", bbox: [10, 20, 30, 40] }],
      },
    });
    expect(next.kind).toBe("results");
    if (next.kind !== "results") return;
    expect(next.data.markdown_raw).toBe("raw");
    expect(next.data.markdown_anonymized).toBe("anon");
    expect(next.data.word_stream).toHaveLength(1);
  });

  it("STREAM_DONE flips streaming to false and progress to done", () => {
    const after_meta = appReducer(
      { kind: "loading", filename: "cv.pdf" },
      { type: "STREAM_META", meta: META, pdfBytes: PDF_BYTES }
    );
    const next = appReducer(after_meta, {
      type: "STREAM_DONE",
      counts: { mistake_count: 1, unlocatable_count: 0 },
    });
    expect(next.kind).toBe("results");
    if (next.kind !== "results") return;
    expect(next.streaming).toBe(false);
    expect(next.progress).toBe("done");
  });

  it("ERROR from any state transitions to error", () => {
    expect(
      appReducer({ kind: "loading", filename: "x" }, {
        type: "ERROR",
        reason: "backend-down",
      })
    ).toEqual({ kind: "error", reason: "backend-down", details: undefined });
  });

  it("RESET returns to empty", () => {
    expect(appReducer({ kind: "error", reason: "not-pdf" }, { type: "RESET" })).toEqual({
      kind: "empty",
    });
  });
});
```

- [ ] **Step 2: Run tests, verify failure**

```bash
cd frontend && npx vitest run tests/appState.test.ts
```

Expected: FAIL — the new actions don't exist.

- [ ] **Step 3: Replace `frontend/src/hooks/useAppState.ts`**

```typescript
import { useReducer } from "react";
import type { LocatedMistake, Mistake, PageSize, ProgressStep, ProofreadResult } from "@/lib/types";

export type ErrorReason =
  | "too-large"
  | "not-pdf"
  | "no-text-layer"
  | "backend-down"
  | "rate-limit"
  | "internal";

export interface ErrorDetails {
  sizeMb?: number;
  retryInSec?: number;
  message?: string;
}

export interface MetaPayload {
  filename: string;
  language: string;
  page_count: number;
  page_sizes: PageSize[];
  thread_id: string;
}

export interface DebugPayload {
  markdown_raw: string;
  markdown_anonymized: string;
  word_stream: { page: number; text: string; bbox: [number, number, number, number] }[];
}

export type AppState =
  | { kind: "empty" }
  | { kind: "loading"; filename: string }
  | {
      kind: "results";
      data: ProofreadResult;
      pdfBytes: Uint8Array;
      streaming: boolean;
      progress: ProgressStep;
    }
  | { kind: "error"; reason: ErrorReason; details?: ErrorDetails };

export type AppAction =
  | { type: "UPLOAD_STARTED"; filename: string }
  | { type: "STREAM_META"; meta: MetaPayload; pdfBytes: Uint8Array }
  | { type: "STREAM_PROGRESS"; step: ProgressStep }
  | { type: "STREAM_MISTAKE"; mistake: LocatedMistake }
  | { type: "STREAM_UNLOCATABLE"; mistake: Mistake }
  | { type: "STREAM_DEBUG"; debug: DebugPayload }
  | { type: "STREAM_DONE"; counts: { mistake_count: number; unlocatable_count: number } }
  | { type: "ERROR"; reason: ErrorReason; details?: ErrorDetails }
  | { type: "RESET" };

export const initialAppState: AppState = { kind: "empty" };

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "UPLOAD_STARTED":
      return { kind: "loading", filename: action.filename };
    case "STREAM_META": {
      const data: ProofreadResult = {
        ...action.meta,
        mistakes: [],
        unlocatable: [],
      };
      return {
        kind: "results",
        data,
        pdfBytes: action.pdfBytes,
        streaming: true,
        progress: "extracted",
      };
    }
    case "STREAM_PROGRESS":
      if (state.kind !== "results") return state;
      return { ...state, progress: action.step };
    case "STREAM_MISTAKE":
      if (state.kind !== "results") return state;
      return {
        ...state,
        data: { ...state.data, mistakes: [...state.data.mistakes, action.mistake] },
      };
    case "STREAM_UNLOCATABLE":
      if (state.kind !== "results") return state;
      return {
        ...state,
        data: { ...state.data, unlocatable: [...state.data.unlocatable, action.mistake] },
      };
    case "STREAM_DEBUG":
      if (state.kind !== "results") return state;
      return { ...state, data: { ...state.data, ...action.debug } };
    case "STREAM_DONE":
      if (state.kind !== "results") return state;
      return { ...state, streaming: false, progress: "done" };
    case "ERROR":
      return { kind: "error", reason: action.reason, details: action.details };
    case "RESET":
      return { kind: "empty" };
  }
}

export function useAppState() {
  return useReducer(appReducer, initialAppState);
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
npx vitest run tests/appState.test.ts
```

Expected: PASS, all 10 tests.

- [ ] **Step 5: Commit**

```bash
cd /home/secondary/PycharmProjects/piighost-proofreader
git add frontend/src/hooks/useAppState.ts frontend/tests/appState.test.ts
git commit -m "feat(frontend): extend appState reducer with STREAM_* actions for SSE streaming"
```

---

### Task 14: `useResultStream` hook + Vite proxy + `PdfPanel` signature change

**Files:**
- Create: `frontend/src/hooks/useResultStream.ts`
- Modify: `frontend/vite.config.ts`
- Modify: `frontend/src/components/PdfPanel.tsx`

- [ ] **Step 1: Add the dev proxy to `frontend/vite.config.ts`**

Replace the `server` block:

```typescript
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:8001" },
  },
```

- [ ] **Step 2: Modify `frontend/src/components/PdfPanel.tsx`**

Replace the file with:

```tsx
import { useEffect, useState } from "react";
import { renderAllPages, type RenderedPage } from "@/lib/pdf";
import HighlightOverlay from "./HighlightOverlay";
import type { LocatedMistake } from "@/lib/types";

interface Props {
  pdfBytes: Uint8Array;
  pageSizes: { page: number; width_pt: number; height_pt: number }[];
  mistakes: LocatedMistake[];
  enabled: boolean[];
  activeIndex: number | null;
}

export default function PdfPanel({
  pdfBytes,
  pageSizes,
  mistakes,
  enabled,
  activeIndex,
}: Props) {
  const [pages, setPages] = useState<RenderedPage[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rendered = await renderAllPages(pdfBytes, 2);
      if (cancelled) return;
      setPages(rendered);
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfBytes]);

  return (
    <div className="space-y-4">
      {pages.map((p) => {
        const sizePt = pageSizes.find((s) => s.page === p.pageIndex);
        const pageWidthPt = sizePt?.width_pt ?? p.width / p.scale;
        const pageHeightPt = sizePt?.height_pt ?? p.height / p.scale;
        return (
          <div
            key={p.pageIndex}
            className="pdf-page relative mx-auto w-full"
            style={{ aspectRatio: `${pageWidthPt} / ${pageHeightPt}` }}
          >
            <div
              className="absolute inset-0"
              ref={(el) => {
                if (!el) return;
                if (el.firstChild !== p.canvas) {
                  p.canvas.style.width = "100%";
                  p.canvas.style.height = "100%";
                  p.canvas.style.display = "block";
                  el.replaceChildren(p.canvas);
                }
              }}
            />
            <HighlightOverlay
              mistakes={mistakes}
              enabled={enabled}
              activeIndex={activeIndex}
              pageIndex={p.pageIndex}
              pageWidthPt={pageWidthPt}
              pageHeightPt={pageHeightPt}
            />
          </div>
        );
      })}
      {pages.length === 0 && (
        <p className="text-xs text-text-200">Chargement du PDF…</p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create `frontend/src/hooks/useResultStream.ts`**

```typescript
import { useCallback } from "react";
import { parseSSE } from "@/lib/parseSSE";
import type { AppAction, ErrorReason } from "./useAppState";
import type { LocatedMistake, Mistake } from "@/lib/types";

interface MetaData {
  filename: string;
  language: string;
  page_count: number;
  page_sizes: { page: number; width_pt: number; height_pt: number }[];
  thread_id: string;
}

interface DebugData {
  markdown_raw: string;
  markdown_anonymized: string;
  word_stream: { page: number; text: string; bbox: [number, number, number, number] }[];
}

export function useResultStream(dispatch: (action: AppAction) => void) {
  return useCallback(
    async (file: File, debug: boolean) => {
      dispatch({ type: "UPLOAD_STARTED", filename: file.name });
      const pdfBytes = new Uint8Array(await file.arrayBuffer());
      const formData = new FormData();
      formData.append("file", file);
      const url = `/api/proofread${debug ? "?debug=1" : ""}`;

      let response: Response;
      try {
        response = await fetch(url, { method: "POST", body: formData });
      } catch (e) {
        dispatch({
          type: "ERROR",
          reason: "backend-down",
          details: { message: String(e) },
        });
        return;
      }
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const reason: ErrorReason =
          (body.reason as ErrorReason) ?? "internal";
        dispatch({
          type: "ERROR",
          reason,
          details: { sizeMb: body.size_mb, message: body.message },
        });
        return;
      }
      if (!response.body) {
        dispatch({ type: "ERROR", reason: "internal" });
        return;
      }
      for await (const event of parseSSE(response.body)) {
        switch (event.name) {
          case "meta":
            dispatch({
              type: "STREAM_META",
              meta: event.data as MetaData,
              pdfBytes,
            });
            break;
          case "progress":
            dispatch({
              type: "STREAM_PROGRESS",
              step: (event.data as { step: never }).step,
            });
            break;
          case "mistake":
            dispatch({
              type: "STREAM_MISTAKE",
              mistake: event.data as LocatedMistake,
            });
            break;
          case "unlocatable":
            dispatch({
              type: "STREAM_UNLOCATABLE",
              mistake: event.data as Mistake,
            });
            break;
          case "debug":
            dispatch({
              type: "STREAM_DEBUG",
              debug: event.data as DebugData,
            });
            break;
          case "done":
            dispatch({
              type: "STREAM_DONE",
              counts: event.data as { mistake_count: number; unlocatable_count: number },
            });
            break;
          case "error": {
            const d = event.data as { reason: ErrorReason; message?: string };
            dispatch({
              type: "ERROR",
              reason: d.reason ?? "internal",
              details: { message: d.message },
            });
            return;
          }
        }
      }
    },
    [dispatch]
  );
}
```

- [ ] **Step 4: Confirm TS compiles**

```bash
cd frontend && npm run build
```

Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
cd /home/secondary/PycharmProjects/piighost-proofreader
git add frontend/vite.config.ts frontend/src/components/PdfPanel.tsx frontend/src/hooks/useResultStream.ts
git commit -m "feat(frontend): useResultStream hook + Vite /api proxy + PdfPanel pdfBytes"
```

---

### Task 15: `App.tsx` wired to `useResultStream`, fixture stripped of `pdf_base64`

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/fixtures/sample-result.json`
- Modify: `frontend/src/components/ResultsState.tsx`
- Create: `frontend/src/fixtures/sample-cv.pdf` (binary, copy from existing PDF)

- [ ] **Step 1: Generate the binary fixture PDF**

Run from `piighost-proofreader/`:

```bash
uv run python -c "
import fitz
doc = fitz.open()
page = doc.new_page()
page.insert_text((72, 100), 'Voici un exemple simple avec mot mot dans une phrase.', fontsize=14)
page.insert_text((72, 130), 'Une faute ortho ici et une autre la.', fontsize=14)
doc.save('frontend/src/fixtures/sample-cv.pdf')
print('written:', __import__('os').path.getsize('frontend/src/fixtures/sample-cv.pdf'), 'bytes')
"
```

Expected: `written: 1429 bytes` (approx).

- [ ] **Step 2: Update `frontend/src/fixtures/sample-result.json`**

Open the file, remove the `pdf_base64` field, and add an empty `unlocatable` array so it matches the new `ProofreadResult` shape. The final structure:

```json
{
  "language": "fr",
  "filename": "fake-cv.pdf",
  "page_count": 1,
  "page_sizes": [{ "page": 0, "width_pt": 595.0, "height_pt": 842.0 }],
  "mistakes": [ ... existing 5 mistakes ... ],
  "unlocatable": [],
  "markdown_raw": "Voici un exemple simple avec mot mot dans une phrase.\nUne faute ortho ici et une autre la.",
  "markdown_anonymized": "Voici un exemple simple avec mot mot dans une phrase.\nUne faute ortho ici et une autre la.",
  "thread_id": "fake-thread-0001"
}
```

Keep the 5 existing mistakes verbatim. Just drop the `pdf_base64` key and add `"unlocatable": []`.

- [ ] **Step 3: Update `frontend/src/components/ResultsState.tsx` to pass `pdfBytes`**

Replace the file with:

```tsx
import { useEffect } from "react";
import type { ProofreadResult } from "@/lib/types";
import { useMistakesStore } from "@/hooks/useMistakesStore";
import { useDebugMode } from "@/hooks/useDebugMode";
import TopBar from "./TopBar";
import PdfPanel from "./PdfPanel";
import MistakesPanel from "./MistakesPanel";
import DebugPanel from "./DebugPanel";

interface Props {
  data: ProofreadResult;
  pdfBytes: Uint8Array;
  streaming: boolean;
  progress: "extracted" | "anonymized" | "llm-started" | "done";
  onReset: () => void;
}

export default function ResultsState({ data, pdfBytes, streaming, progress, onReset }: Props) {
  const [mistakesState, dispatch] = useMistakesStore(data.mistakes.length);
  const debug = useDebugMode();

  useEffect(() => {
    dispatch({ type: "RESET", count: data.mistakes.length });
  }, [data.mistakes.length, dispatch]);

  return (
    <>
      <div className="max-w-6xl mx-auto px-4 sm:px-8 lg:px-12 py-6 lg:py-10">
        <TopBar
          filename={data.filename}
          mistakeCount={data.mistakes.length}
          streaming={streaming}
          onReset={onReset}
        />
        <div className="flex flex-col lg:flex-row gap-6 lg:h-[calc(100vh-200px)]">
          <div className="flex-1 overflow-y-auto bg-background-50 border border-base-100 rounded-xl p-6 min-h-[60vh] lg:min-h-0">
            <PdfPanel
              pdfBytes={pdfBytes}
              pageSizes={data.page_sizes}
              mistakes={data.mistakes}
              enabled={mistakesState.enabled}
              activeIndex={mistakesState.activeIndex}
            />
          </div>
          <div className="flex-1 overflow-y-auto bg-background-50 border border-base-100 rounded-xl p-5 min-h-[40vh] lg:min-h-0">
            <MistakesPanel
              mistakes={data.mistakes}
              state={mistakesState}
              dispatch={dispatch}
              streaming={streaming}
              progress={progress}
            />
          </div>
        </div>
      </div>

      {debug.visible && <DebugPanel data={data} />}

      <button
        type="button"
        onClick={debug.toggle}
        title="Toggle debug panel"
        className="fixed bottom-4 right-4 px-3 py-1.5 text-xs rounded-md bg-foreground-100 text-white-100 opacity-30 hover:opacity-100 transition-opacity"
      >
        Debug
      </button>
    </>
  );
}
```

- [ ] **Step 4: Replace `frontend/src/App.tsx`**

```tsx
import { useEffect } from "react";
import { useAppState } from "@/hooks/useAppState";
import { fakeMode } from "@/hooks/useDebugMode";
import { useResultStream } from "@/hooks/useResultStream";
import EmptyState from "@/components/EmptyState";
import LoadingState from "@/components/LoadingState";
import ErrorState from "@/components/ErrorState";
import ResultsState from "@/components/ResultsState";
import sampleResult from "@/fixtures/sample-result.json";
import samplePdfUrl from "@/fixtures/sample-cv.pdf?url";
import type { LocatedMistake, ProofreadResult } from "@/lib/types";

async function simulateStream(
  dispatch: (action: import("@/hooks/useAppState").AppAction) => void,
  empty: boolean
) {
  const res = sampleResult as Omit<ProofreadResult, "mistakes" | "unlocatable"> & {
    mistakes: LocatedMistake[];
  };
  const pdfResponse = await fetch(samplePdfUrl);
  const pdfBytes = new Uint8Array(await pdfResponse.arrayBuffer());
  dispatch({ type: "UPLOAD_STARTED", filename: res.filename });
  dispatch({
    type: "STREAM_META",
    meta: {
      filename: res.filename,
      language: res.language,
      page_count: res.page_count,
      page_sizes: res.page_sizes,
      thread_id: res.thread_id ?? "fake",
    },
    pdfBytes,
  });
  dispatch({ type: "STREAM_PROGRESS", step: "extracted" });
  await new Promise((r) => setTimeout(r, 100));
  dispatch({ type: "STREAM_PROGRESS", step: "anonymized" });
  await new Promise((r) => setTimeout(r, 100));
  dispatch({ type: "STREAM_PROGRESS", step: "llm-started" });
  const mistakes = empty ? [] : res.mistakes;
  for (const m of mistakes) {
    await new Promise((r) => setTimeout(r, 150));
    dispatch({ type: "STREAM_MISTAKE", mistake: m });
  }
  dispatch({
    type: "STREAM_DONE",
    counts: { mistake_count: mistakes.length, unlocatable_count: 0 },
  });
}

export default function App() {
  const [state, dispatch] = useAppState();
  const startStream = useResultStream(dispatch);

  // ?fake=1 / ?fake=empty
  useEffect(() => {
    if (state.kind !== "empty") return;
    const mode = fakeMode();
    if (mode === "off") return;
    simulateStream(dispatch, mode === "empty");
  }, [state.kind, dispatch]);

  switch (state.kind) {
    case "empty":
      return (
        <EmptyState
          onFile={(file) => startStream(file, false)}
          onReject={(r) => {
            if (r.reason === "too-large") {
              dispatch({
                type: "ERROR",
                reason: "too-large",
                details: { sizeMb: r.sizeMb },
              });
            } else {
              dispatch({ type: "ERROR", reason: "not-pdf" });
            }
          }}
        />
      );
    case "loading":
      return <LoadingState />;
    case "error":
      return (
        <ErrorState
          reason={state.reason}
          details={state.details}
          onReset={() => dispatch({ type: "RESET" })}
        />
      );
    case "results":
      return (
        <ResultsState
          data={state.data}
          pdfBytes={state.pdfBytes}
          streaming={state.streaming}
          progress={state.progress}
          onReset={() => dispatch({ type: "RESET" })}
        />
      );
  }
}
```

- [ ] **Step 5: Run the build**

```bash
cd frontend && npm run build
```

Expected: build succeeds. If TS complains about `?url` import for `sample-cv.pdf`, it's because `vite/client` types weren't picked up — they are in `tsconfig.json` already. Should pass.

- [ ] **Step 6: Commit**

```bash
cd /home/secondary/PycharmProjects/piighost-proofreader
git add frontend/src/App.tsx frontend/src/components/ResultsState.tsx frontend/src/fixtures/sample-result.json frontend/src/fixtures/sample-cv.pdf
git commit -m "feat(frontend): wire useResultStream + simulate stream in ?fake mode"
```

---

### Task 16: Streaming UI — TopBar + MistakesPanel progress indicator

**Files:**
- Modify: `frontend/src/components/TopBar.tsx`
- Modify: `frontend/src/components/MistakesPanel.tsx`

- [ ] **Step 1: Replace `frontend/src/components/TopBar.tsx`**

```tsx
import { Badge } from "@/components/tailgrids/core/badge";
import { Button } from "@/components/tailgrids/core/button";

interface Props {
  filename: string;
  mistakeCount: number;
  streaming: boolean;
  onReset: () => void;
}

export default function TopBar({ filename, mistakeCount, streaming, onReset }: Props) {
  let badge;
  if (streaming) {
    badge = (
      <Badge color="primary" size="sm">
        {mistakeCount} fautes · en cours…
      </Badge>
    );
  } else if (mistakeCount === 0) {
    badge = (
      <Badge color="success" size="sm">aucune faute</Badge>
    );
  } else {
    badge = (
      <Badge color="primary" size="sm">{mistakeCount} fautes</Badge>
    );
  }
  return (
    <div className="flex items-center justify-between bg-background-50 border border-base-100 rounded-xl px-5 py-3 mb-5">
      <div className="flex items-center gap-3">
        <span className="font-semibold">{filename}</span>
        {badge}
      </div>
      <Button variant="primary" appearance="outline" size="sm" onClick={onReset}>
        ↻ Nouveau PDF
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Modify `frontend/src/components/MistakesPanel.tsx`**

Replace the file with:

```tsx
import type { LocatedMistake, ProgressStep } from "@/lib/types";
import type { MistakesState, MistakesAction } from "@/hooks/useMistakesStore";
import MistakeCard from "./MistakeCard";
import { Checkbox } from "@/components/tailgrids/core/checkbox";

interface Props {
  mistakes: LocatedMistake[];
  state: MistakesState;
  dispatch: (action: MistakesAction) => void;
  streaming: boolean;
  progress: ProgressStep;
}

const PROGRESS_LABEL: Record<ProgressStep, string> = {
  extracted: "Anonymisation…",
  anonymized: "Génération des fautes…",
  "llm-started": "Génération des fautes…",
  done: "",
};

export default function MistakesPanel({ mistakes, state, dispatch, streaming, progress }: Props) {
  if (mistakes.length === 0 && !streaming) {
    return (
      <div className="h-full flex items-center justify-center px-8">
        <div className="text-center max-w-[240px]">
          <div className="text-3xl mb-3">✅</div>
          <div className="text-lg font-semibold mb-2">Aucune faute détectée</div>
          <div className="text-base text-text-100 leading-relaxed">
            Le LLM a analysé votre CV et n'a rien trouvé à corriger.
          </div>
        </div>
      </div>
    );
  }

  const visible = state.enabled.filter(Boolean).length;
  const allChecked = mistakes.length > 0 && visible === mistakes.length;

  return (
    <div>
      <div className="flex items-center gap-3 mb-1 pb-3 border-b border-base-100">
        <Checkbox
          checked={allChecked}
          onChange={() => dispatch({ type: "SET_ALL", enabled: !allChecked })}
        />
        <span className="text-xs text-text-100">Tout cocher / décocher</span>
        <span className="text-xs text-text-100 ml-auto">
          {visible} / {mistakes.length} visibles
        </span>
      </div>
      <p className="text-[11px] text-text-200 italic mb-3">
        Cliquez sur une faute pour la mettre en évidence sur le PDF.
      </p>
      {mistakes.map((m, i) => (
        <MistakeCard
          key={i}
          mistake={m}
          enabled={state.enabled[i]}
          active={state.activeIndex === i}
          onToggle={() => dispatch({ type: "TOGGLE", index: i })}
          onActivate={() => dispatch({ type: "SET_ACTIVE", index: i })}
        />
      ))}
      {streaming && (
        <div className="flex items-center gap-2 mt-3 p-2 rounded-md bg-background-soft-50 text-xs text-text-100">
          <span className="inline-block w-3 h-3 border-2 border-base-100 border-t-foreground-100 rounded-full animate-spin" />
          {PROGRESS_LABEL[progress]}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Build to confirm no TS error**

```bash
cd frontend && npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
cd /home/secondary/PycharmProjects/piighost-proofreader
git add frontend/src/components/TopBar.tsx frontend/src/components/MistakesPanel.tsx
git commit -m "feat(frontend): streaming progress indicator in TopBar + MistakesPanel"
```

---

### Task 17: End-to-end manual walkthrough

**Files:**
- None (manual validation).

- [ ] **Step 1: Start piighost-api (sibling), then the FastAPI backend, then the Vite dev server in three terminals**

Terminal 1 (piighost-api):
```bash
cd ~/PycharmProjects/piighost-api
uv run uvicorn piighost_api.app:app --port 8000
```

Terminal 2 (FastAPI backend):
```bash
cd ~/PycharmProjects/piighost-proofreader
uv run uvicorn proofreader.api.app:app --reload --port 8001
```

Terminal 3 (Vite frontend):
```bash
cd ~/PycharmProjects/piighost-proofreader/frontend
npm run dev
```

- [ ] **Step 2: Run the test suites both sides**

```bash
cd ~/PycharmProjects/piighost-proofreader
uv run pytest -x                          # backend
cd frontend && npm test                   # frontend (Vitest)
```

Expected: 22 backend tests pass (4 existing api + new ones + pre-existing), 22 frontend tests pass (existing 18 + parseSSE 4 + extended appState).

- [ ] **Step 3: Walk through each acceptance criterion from the spec**

Open `http://localhost:5173/`. Tick each box only after observed behavior matches.

- [ ] `?fake=1` keeps working without the backend (try with backend stopped briefly): mistakes appear one by one with ~150ms gap.
- [ ] `?fake=empty` shows the "Aucune faute détectée" empty state.
- [ ] Upload a valid PDF (< 10 Mo, with text) via the real backend: loader appears briefly, then `meta` event flips to results state, top bar shows "0 fautes · en cours…", mistakes append one by one as the LLM produces them.
- [ ] When the stream finishes, the top bar badge drops "· en cours…" and the spinner in MistakesPanel disappears.
- [ ] Highlights line up on the right words of the PDF (the real backend uses PyMuPDF coordinates).
- [ ] Toggle / active interactions still work during AND after streaming.
- [ ] Upload a PDF > 10 Mo: HTTP 413 → red ErrorState "Fichier trop volumineux".
- [ ] Upload a non-PDF file via curl (the UI rejects client-side, but bypass it): HTTP 415 → red ErrorState "Format non supporté".
- [ ] Upload an empty PDF (one blank page): HTTP 422 → red ErrorState "PDF non lisible".
- [ ] Stop piighost-api during a long pipeline → `event: error reason: "backend-down"` arrives → ErrorState "Service indisponible".
- [ ] `?debug=1` panel populates with the streamed `debug` event content.
- [ ] Streamlit `app.py` still runs: `uv run streamlit run app.py` → upload a PDF → results display (no regression on the legacy flow).

- [ ] **Step 4: Final commit if any tweaks were needed during validation**

```bash
git status
# if dirty
git add -p
git commit -m "chore(api): post-acceptance tweaks"
```

---

## Self-review pass (writing-plans skill checklist)

**Spec coverage** — every requirement in `2026-05-21-fastapi-backend-design.md` mapped:

- Architecture nginx + FastAPI + piighost-api ports → Task 1, 8, 17 (deploy plumbing actual nginx config out of scope for plan, phase 3)
- Contrat API endpoints → Tasks 1 (health), 8 (validation), 9 (proofread streaming)
- SSE event catalogue → Task 7 (run_pipeline emits each event type), Task 14 (frontend consumes each event type), Task 15 (?fake replays each event type)
- HTTP error codes 413/415/422 → Task 8 (413/415), Task 9 (422)
- Mid-stream SSE error event → Task 10
- Backend file structure → Tasks 1, 2, 3, 5, 7, 8
- `proofreader/llm.py` keeps Streamlit support + adds stream_mistakes → Task 4
- Async-native pipeline (anyio.to_thread, asyncio.gather, Instructor create_iterable) → Tasks 5 (helpers), 7 (orchestration), 4 (Instructor)
- Frontend types update + useAppState extension → Tasks 12, 13
- Frontend useResultStream + parseSSE → Tasks 12, 14
- Frontend Vite proxy → Task 14
- PdfPanel pdfBase64 → pdfBytes → Task 14
- ?fake mode simulated stream → Task 15
- Streaming UI (TopBar + MistakesPanel) → Task 16
- Validation walkthrough → Task 17
- Streamlit `app.py` still works → Task 4 (Streamlit imports verified), Task 17 (manual smoke at end)

**Placeholder scan** — no TBD / TODO / "implement later". Every code block is final content; every command is exact.

**Type consistency** — `Mistake`/`LocatedMistake`/`ProofreadResult`/`ProgressStep`/`AppState`/`AppAction` are defined once and reused. `format_sse(event_name, data)` signature is consistent between definition (Task 2) and call sites (Task 7). `run_pipeline` signature with named kwargs is the same in Task 7 (definition), Task 9 (route consumer), and Tasks 7/9 test patches.
