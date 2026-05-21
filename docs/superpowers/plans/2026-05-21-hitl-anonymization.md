# HITL Anonymisation Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Insert a mandatory user-review state between PDF extraction and LLM analysis. The user sees piighost-api's PII detections highlighted on the PDF, edits the list (add via text selection, remove via X, relabel via dropdown), then validates — the proofreading runs with those overrides applied.

**Architecture:** Two-step HTTP flow inspired by `piighost-chat`. `POST /api/detect-pii` extracts the Markdown, calls piighost-api detection, maps each detection's `start_pos/end_pos` to a PDF bbox via the PyMuPDF word stream, and returns JSON. The frontend gains a new `reviewing` AppState where the PDF.js text layer is enabled and the user edits the list of overrides. `POST /api/proofread` is extended with `thread_id` and `overrides` form fields, applies them via `piighost-api.override_detections()` before the existing pipeline, then streams the SSE result (contract unchanged from phase 2).

**Tech Stack:** FastAPI / piighost client / Pydantic (backend) ; React 19 + TypeScript / pdfjs-dist text layer / TailGrids Modal primitive / Vitest (frontend).

---

## Cross-task conventions

- Backend tasks run from `/home/secondary/PycharmProjects/piighost-proofreader/`. Frontend tasks run from `frontend/`.
- Streamlit `app.py` does NOT get migrated. The Streamlit code path stays on the phase 1 pipeline (`proofreader.llm.proofread` / `build_chain`) — verify after backend changes that it still imports.
- Types `Detection(text, label, position: Span, confidence)` and `Span(start_pos, end_pos)` come from the `piighost` library — we reuse them on the backend, we mirror them as plain interfaces on the frontend.
- Every task ends with a commit. No batching commits across tasks.

---

## File structure

```
piighost-proofreader/
├── proofreader/
│   ├── anonymize.py                          # MODIFIED — add detect(), override_detections(), get_labels()
│   ├── locator.py                            # MODIFIED — add find_all_substring_spans()
│   ├── api/
│   │   ├── routes.py                         # MODIFIED — add /detect-pii, /labels; /proofread takes overrides
│   │   ├── pipeline.py                       # MODIFIED — locate_detection() + extract_and_detect_pii()
│   │   └── overrides.py                      # NEW — OverrideEntry + apply_overrides()
│   └── (rest unchanged)
├── tests/
│   └── api/
│       ├── test_anonymize_client.py          # NEW — covers the 3 new client methods
│       ├── test_overrides.py                 # NEW — covers apply_overrides
│       ├── test_locator_substring_all.py     # NEW — covers find_all_substring_spans
│       ├── test_pipeline.py                  # EXTENDED — locate_detection + overrides in run_pipeline
│       └── test_routes.py                    # EXTENDED — /detect-pii, /labels, /proofread overrides
└── frontend/
    ├── src/
    │   ├── lib/
    │   │   ├── types.ts                      # MODIFIED — add Detection, PageDetection, OverrideEntry, DetectPiiResponse
    │   │   └── overrides.ts                  # NEW — applyOverrides()
    │   ├── hooks/
    │   │   ├── useAppState.ts                # MODIFIED — reviewing/loading-detect/loading-proofread states + overrides actions
    │   │   ├── useDetectPii.ts               # NEW
    │   │   ├── useResultStream.ts            # MODIFIED — accept thread_id + overrides
    │   │   └── useLabels.ts                  # NEW
    │   ├── components/
    │   │   ├── PdfPanel.tsx                  # MODIFIED — enableTextLayer + variant prop
    │   │   ├── HighlightOverlay.tsx          # MODIFIED — variant color (mistake red, detection blue)
    │   │   ├── LabelPickerModal.tsx          # NEW
    │   │   ├── DetectionCard.tsx             # NEW
    │   │   ├── DetectionsPanel.tsx           # NEW
    │   │   ├── ReviewTopBar.tsx              # NEW
    │   │   ├── ReviewState.tsx               # NEW
    │   │   └── App.tsx                       # MODIFIED — orchestrate detect → review → proofread
    │   └── fixtures/
    │       └── sample-detections.json        # NEW — ?fake=1 review fixture
    └── tests/
        ├── overrides.test.ts                 # NEW
        └── appState.test.ts                  # EXTENDED — review actions
```

---

### Task 1: `AnonymizationClient.detect()` (TDD)

**Files:**
- Modify: `proofreader/anonymize.py`
- Create: `tests/api/test_anonymize_client.py`

The piighost-api returns Entity objects whose `detections` list holds the actual Detection items with positions. We flatten on the client side.

- [ ] **Step 1: Write the failing test `tests/api/test_anonymize_client.py`**

```python
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
```

- [ ] **Step 2: Run, verify failure**

```bash
uv run pytest tests/api/test_anonymize_client.py::test_detect_returns_flat_detections -xvs
```

Expected: FAIL — `AnonymizationClient.detect` not defined.

- [ ] **Step 3: Add the method to `proofreader/anonymize.py`**

Open `proofreader/anonymize.py` and add (do NOT touch `anonymize` / `deanonymize`):

```python
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
```

- [ ] **Step 4: Run, verify pass**

```bash
uv run pytest tests/api/test_anonymize_client.py::test_detect_returns_flat_detections -xvs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add proofreader/anonymize.py tests/api/test_anonymize_client.py
git commit -m "feat(anonymize): add detect() method returning flat detection list"
```

---

### Task 2: `AnonymizationClient.override_detections()` + `.get_labels()` (TDD)

**Files:**
- Modify: `proofreader/anonymize.py`
- Modify: `tests/api/test_anonymize_client.py`

- [ ] **Step 1: Append the tests**

```python
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
    assert body["detections"][0]["position"]["start_pos"] == 5


@pytest.mark.asyncio
async def test_get_labels_returns_label_list():
    client = AnonymizationClient(base_url="http://fake")
    with respx.mock:
        respx.get("http://fake/v1/config").respond(
            json={"labels": ["PERSON", "LOCATION", "EMAIL"], "placeholder_factory": "x"}
        )
        labels = await client.get_labels()
    assert labels == ["PERSON", "LOCATION", "EMAIL"]
```

- [ ] **Step 2: Run, verify failure**

```bash
uv run pytest tests/api/test_anonymize_client.py -xvs
```

Expected: 2 new tests FAIL.

- [ ] **Step 3: Add both methods to `proofreader/anonymize.py`**

Append:

```python
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
```

- [ ] **Step 4: Run, verify pass**

```bash
uv run pytest tests/api/test_anonymize_client.py -xvs
```

Expected: 3 tests pass.

- [ ] **Step 5: Verify Streamlit imports still work**

```bash
uv run python -c "from proofreader.anonymize import AnonymizationClient; c = AnonymizationClient(base_url='x'); print('OK')"
```

Expected: `OK`.

- [ ] **Step 6: Commit**

```bash
git add proofreader/anonymize.py tests/api/test_anonymize_client.py
git commit -m "feat(anonymize): add override_detections() and get_labels()"
```

---

### Task 3: Overrides pure logic (TDD)

**Files:**
- Create: `proofreader/api/overrides.py`
- Create: `tests/api/test_overrides.py`

- [ ] **Step 1: Write the failing test `tests/api/test_overrides.py`**

```python
"""Tests for apply_overrides pure logic."""

from proofreader.api.overrides import OverrideEntry, apply_overrides


INITIAL = [
    {"text": "Pierre", "label": "PERSON", "start_pos": 0, "end_pos": 6, "confidence": 0.99},
    {"text": "Lyon", "label": "LOCATION", "start_pos": 30, "end_pos": 34, "confidence": 0.88},
]
MARKDOWN = "Pierre travaille à Lyon. Pierre est ingénieur. Et Acme corp."


def test_no_overrides_returns_initial():
    assert apply_overrides(INITIAL, [], markdown=MARKDOWN) == INITIAL


def test_add_override_finds_all_occurrences():
    out = apply_overrides(
        INITIAL,
        [OverrideEntry(text="Acme corp", label="ORG")],
        markdown=MARKDOWN,
    )
    added = [d for d in out if d["label"] == "ORG"]
    assert len(added) == 1
    assert added[0]["text"] == "Acme corp"
    assert MARKDOWN[added[0]["start_pos"]:added[0]["end_pos"]] == "Acme corp"


def test_add_override_with_multiple_occurrences():
    out = apply_overrides(
        INITIAL,
        [OverrideEntry(text="Pierre", label="PERSON_OVERRIDE")],
        markdown=MARKDOWN,
    )
    added = [d for d in out if d["label"] == "PERSON_OVERRIDE"]
    assert len(added) == 2
    assert MARKDOWN[added[0]["start_pos"]:added[0]["end_pos"]] == "Pierre"
    assert MARKDOWN[added[1]["start_pos"]:added[1]["end_pos"]] == "Pierre"


def test_remove_override_filters_matching_initial():
    out = apply_overrides(
        INITIAL,
        [OverrideEntry(text="Pierre", label="PERSON", remove=True)],
        markdown=MARKDOWN,
    )
    assert all(d["text"] != "Pierre" for d in out)
    assert any(d["text"] == "Lyon" for d in out)


def test_remove_override_with_no_match_is_noop():
    out = apply_overrides(
        INITIAL,
        [OverrideEntry(text="Nope", label="PERSON", remove=True)],
        markdown=MARKDOWN,
    )
    assert out == INITIAL


def test_relabel_via_remove_then_add():
    out = apply_overrides(
        INITIAL,
        [
            OverrideEntry(text="Pierre", label="PERSON", remove=True),
            OverrideEntry(text="Pierre", label="EMPLOYEE"),
        ],
        markdown=MARKDOWN,
    )
    assert all(d["label"] != "PERSON" or d["text"] != "Pierre" for d in out)
    employees = [d for d in out if d["label"] == "EMPLOYEE"]
    assert len(employees) == 2
```

- [ ] **Step 2: Run, verify failure**

```bash
uv run pytest tests/api/test_overrides.py -xvs
```

Expected: 6 tests FAIL.

- [ ] **Step 3: Implement `proofreader/api/overrides.py`**

```python
"""Override logic for HITL anonymisation review.

Given the initial detections from piighost-api and a list of user
edits (add / remove / relabel), produce the final detections list to
push back via override_detections().
"""

from pydantic import BaseModel


class OverrideEntry(BaseModel):
    text: str
    label: str
    remove: bool = False


def _find_all_occurrences(needle: str, haystack: str) -> list[tuple[int, int]]:
    out: list[tuple[int, int]] = []
    start = 0
    while True:
        idx = haystack.find(needle, start)
        if idx == -1:
            return out
        out.append((idx, idx + len(needle)))
        start = idx + 1


def apply_overrides(
    initial: list[dict], overrides: list[OverrideEntry], *, markdown: str
) -> list[dict]:
    """Apply the user-edited overrides to the initial detections list.

    - Removes are matched on (text, label). All matching initial detections
      are filtered out.
    - Adds expand to one detection per occurrence of `text` found in markdown.
    """
    remove_keys = {
        (o.text, o.label) for o in overrides if o.remove
    }
    kept = [
        d for d in initial if (d["text"], d["label"]) not in remove_keys
    ]
    added: list[dict] = []
    for o in overrides:
        if o.remove:
            continue
        for start, end in _find_all_occurrences(o.text, markdown):
            added.append(
                {
                    "text": o.text,
                    "label": o.label,
                    "start_pos": start,
                    "end_pos": end,
                    "confidence": 1.0,
                }
            )
    return kept + added
```

- [ ] **Step 4: Run, verify pass**

```bash
uv run pytest tests/api/test_overrides.py -xvs
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add proofreader/api/overrides.py tests/api/test_overrides.py
git commit -m "feat(api): apply_overrides pure logic with add/remove/multi-occurrence"
```

---

### Task 4: `find_all_substring_spans` locator extension (TDD)

We need to find ALL occurrences of a text in the PyMuPDF word stream, not just the unique one as the locator already does. We add a new helper next to `_find_error_as_substring_if_unique` in `locator.py`.

**Files:**
- Modify: `proofreader/locator.py`
- Create: `tests/api/test_locator_substring_all.py`

- [ ] **Step 1: Write the failing test**

```python
"""Tests for find_all_substring_spans (locator extension)."""

from pathlib import Path

import fitz

from proofreader.locator import find_all_substring_spans
from proofreader.pdf_render import PdfDocument


def test_finds_all_occurrences_in_word_stream(tmp_path: Path):
    pdf_path = tmp_path / "tiny.pdf"
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 100), "Pierre travaille avec Pierre dupont", fontsize=12)
    doc.save(pdf_path)
    doc.close()
    pdf = PdfDocument(pdf_path)
    words = list(pdf.words(0))

    hits = find_all_substring_spans(["Pierre"], words)
    assert len(hits) == 2
    # bboxes are positive and distinct
    assert hits[0][0].bbox != hits[1][0].bbox


def test_returns_empty_when_no_match(tmp_path: Path):
    pdf_path = tmp_path / "tiny.pdf"
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 100), "Hello world", fontsize=12)
    doc.save(pdf_path)
    doc.close()
    pdf = PdfDocument(pdf_path)
    words = list(pdf.words(0))

    assert find_all_substring_spans(["nope"], words) == []
```

- [ ] **Step 2: Run, verify failure**

```bash
uv run pytest tests/api/test_locator_substring_all.py -xvs
```

Expected: FAIL — function doesn't exist.

- [ ] **Step 3: Add `find_all_substring_spans` to `proofreader/locator.py`**

Append at the end of `proofreader/locator.py`:

```python
def find_all_substring_spans(
    err_tokens: list[str], words: list[Word]
) -> list[list[Word]]:
    """Like _find_error_as_substring_if_unique, but yield every match.

    Returns a list of [Word, ...] sublists, each covering one match of
    the joined normalised err_tokens in the concatenated word stream.
    """
    if not words or not err_tokens:
        return []
    needle = " ".join(_normalize(t) for t in err_tokens).strip()
    if len(needle) < _MIN_SUBSTRING_CHARS:
        return []

    parts: list[str] = []
    offsets: list[tuple[int, int]] = []
    cursor = 0
    for w in words:
        n = _normalize(w.text)
        parts.append(n)
        offsets.append((cursor, cursor + len(n)))
        cursor += len(n) + 1
    full = " ".join(parts)

    matches: list[list[Word]] = []
    search_from = 0
    while True:
        first = full.find(needle, search_from)
        if first == -1:
            return matches
        last = first + len(needle)
        start_word: int | None = None
        end_word: int | None = None
        for i, (a, b) in enumerate(offsets):
            if start_word is None and b > first:
                start_word = i
            if a < last:
                end_word = i
        if start_word is not None and end_word is not None:
            matches.append(list(words[start_word : end_word + 1]))
        search_from = first + 1
```

- [ ] **Step 4: Run, verify pass**

```bash
uv run pytest tests/api/test_locator_substring_all.py -xvs
```

Expected: 2 tests pass.

**Step 4b** — Lower `_MIN_SUBSTRING_CHARS` if needed: the existing constant in `locator.py` is set to 5 to avoid false matches like "une" inside "commune". For HITL we apply a longer minimum on the frontend side (2 chars at selection time, but here in the locator the original 5 is fine since detections from piighost-api will typically be names / locations longer than 5 chars). Leave the constant as-is.

- [ ] **Step 5: Commit**

```bash
git add proofreader/locator.py tests/api/test_locator_substring_all.py
git commit -m "feat(locator): add find_all_substring_spans to yield every match"
```

---

### Task 5: `locate_detection` + `extract_and_detect_pii` (TDD)

These two pipeline helpers wrap the locator + client to produce the JSON the `/api/detect-pii` route returns.

**Files:**
- Modify: `proofreader/api/pipeline.py`
- Modify: `tests/api/test_pipeline.py`

- [ ] **Step 1: Append the tests to `tests/api/test_pipeline.py`**

```python
from proofreader.api.pipeline import locate_detection


def test_locate_detection_returns_one_entry_per_occurrence(tmp_path):
    pdf_path = tmp_path / "tiny.pdf"
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text(
        (72, 100), "Pierre travaille avec Pierre dupont", fontsize=12
    )
    doc.save(pdf_path)
    doc.close()
    pdf = PdfDocument(pdf_path)
    all_words = {p: list(pdf.words(p)) for p in range(pdf.page_count)}

    hits = locate_detection("Pierre", all_words=all_words)
    assert len(hits) == 2
    for h in hits:
        assert h["page"] == 0
        assert h["bbox"][2] > h["bbox"][0]
```

- [ ] **Step 2: Run, verify failure**

```bash
uv run pytest tests/api/test_pipeline.py::test_locate_detection_returns_one_entry_per_occurrence -xvs
```

Expected: FAIL — `locate_detection` not exported.

- [ ] **Step 3: Add `locate_detection` to `proofreader/api/pipeline.py`**

Update the imports at the top of `proofreader/api/pipeline.py` to include the new helper:

```python
from proofreader.locator import LocatedMistake, find_all_substring_spans, locate_mistake
```

Then append the function:

```python
def locate_detection(text: str, *, all_words: dict[int, list[Word]]) -> list[dict]:
    """Return all (page, bbox) hits for `text` across the document.

    Each hit is a dict {page, bbox} suitable for JSON serialisation.
    """
    hits: list[dict] = []
    tokens = text.split()
    for page_index in sorted(all_words):
        for match in find_all_substring_spans(tokens, all_words[page_index]):
            if not match:
                continue
            x0 = min(w.bbox[0] for w in match)
            y0 = min(w.bbox[1] for w in match)
            x1 = max(w.bbox[2] for w in match)
            y1 = max(w.bbox[3] for w in match)
            hits.append({"page": page_index, "bbox": [x0, y0, x1, y1]})
    return hits
```

- [ ] **Step 4: Run, verify pass**

```bash
uv run pytest tests/api/test_pipeline.py::test_locate_detection_returns_one_entry_per_occurrence -xvs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add proofreader/api/pipeline.py tests/api/test_pipeline.py
git commit -m "feat(api): locate_detection helper mapping text to PDF bboxes"
```

---

### Task 6: `POST /api/detect-pii` route

**Files:**
- Modify: `proofreader/api/routes.py`
- Create: `tests/api/test_detect_pii.py`

- [ ] **Step 1: Write the failing test `tests/api/test_detect_pii.py`**

```python
"""Tests for POST /api/detect-pii."""

from collections.abc import AsyncIterator
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
```

- [ ] **Step 2: Run, verify failure**

```bash
uv run pytest tests/api/test_detect_pii.py -xvs
```

Expected: FAIL (route doesn't exist).

- [ ] **Step 3: Modify `proofreader/api/routes.py` — add the route**

Add the following imports at the top of `proofreader/api/routes.py`:

```python
import tempfile
import uuid
from pathlib import Path

import anyio.to_thread

from proofreader.anonymize import AnonymizationClient
from proofreader.api.errors import NoTextLayerError
from proofreader.api.pipeline import locate_detection
from proofreader.language import detect_language
from proofreader.pdf_extraction import extract_markdown
from proofreader.pdf_render import PdfDocument
```

Add the route function before the existing `/proofread` definition:

```python
@router.post("/detect-pii")
async def detect_pii(file: UploadFile = File(...)):
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

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as fp:
        fp.write(pdf_bytes)
        pdf_path = Path(fp.name)

    markdown = await anyio.to_thread.run_sync(extract_markdown, pdf_path)
    if not markdown.strip():
        return JSONResponse(
            status_code=422,
            content={"reason": "no-text-layer", "message": "PDF has no extractable text"},
        )

    language = detect_language(markdown)
    doc = PdfDocument(pdf_path)
    all_words = {p: list(doc.words(p)) for p in range(doc.page_count)}
    page_sizes = [
        {"page": p, "width_pt": doc.page_size(p)[0], "height_pt": doc.page_size(p)[1]}
        for p in range(doc.page_count)
    ]
    thread_id = str(uuid.uuid4())

    client = AnonymizationClient(base_url=settings.piighost_api_url)
    detections_raw = await client.detect(markdown, thread_id=thread_id)

    detections_out: list[dict] = []
    for d in detections_raw:
        hits = locate_detection(d["text"], all_words=all_words)
        if not hits:
            # The locator can fail to anchor a detection (rare). Emit it
            # with bbox=None so the frontend can list it without a PDF
            # highlight rather than dropping it silently.
            detections_out.append(
                {
                    "text": d["text"],
                    "label": d["label"],
                    "start_pos": d["start_pos"],
                    "end_pos": d["end_pos"],
                    "page": -1,
                    "bbox": None,
                    "confidence": d["confidence"],
                }
            )
            continue
        for h in hits:
            detections_out.append(
                {
                    "text": d["text"],
                    "label": d["label"],
                    "start_pos": d["start_pos"],
                    "end_pos": d["end_pos"],
                    "page": h["page"],
                    "bbox": h["bbox"],
                    "confidence": d["confidence"],
                }
            )

    return JSONResponse(
        {
            "thread_id": thread_id,
            "language": language,
            "page_count": doc.page_count,
            "page_sizes": page_sizes,
            "markdown": markdown,
            "detections": detections_out,
        }
    )
```

- [ ] **Step 4: Run, verify pass**

```bash
uv run pytest tests/api/test_detect_pii.py -xvs
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add proofreader/api/routes.py tests/api/test_detect_pii.py
git commit -m "feat(api): POST /api/detect-pii returning markdown + detections + bboxes"
```

---

### Task 7: `GET /api/labels` route

**Files:**
- Modify: `proofreader/api/routes.py`
- Modify: `tests/api/test_routes.py`

- [ ] **Step 1: Append test to `tests/api/test_routes.py`**

```python
async def test_labels_returns_label_list():
    fake_anon = AsyncMock()
    fake_anon.get_labels = AsyncMock(return_value=["PERSON", "EMAIL"])

    with patch("proofreader.api.routes.AnonymizationClient", return_value=fake_anon):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/labels")

    assert response.status_code == 200
    assert response.json() == {"labels": ["PERSON", "EMAIL"]}
```

- [ ] **Step 2: Run, verify failure**

```bash
uv run pytest tests/api/test_routes.py::test_labels_returns_label_list -xvs
```

Expected: FAIL — route doesn't exist.

- [ ] **Step 3: Add the route to `proofreader/api/routes.py`**

Append:

```python
@router.get("/labels")
async def labels():
    settings = load_settings()
    client = AnonymizationClient(base_url=settings.piighost_api_url)
    return {"labels": await client.get_labels()}
```

- [ ] **Step 4: Run, verify pass**

```bash
uv run pytest tests/api/test_routes.py::test_labels_returns_label_list -xvs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add proofreader/api/routes.py tests/api/test_routes.py
git commit -m "feat(api): GET /api/labels"
```

---

### Task 8: `/api/proofread` accepts `thread_id` + `overrides`

**Files:**
- Modify: `proofreader/api/routes.py`
- Modify: `proofreader/api/pipeline.py`
- Modify: `tests/api/test_routes.py`
- Modify: `tests/api/test_pipeline.py`

- [ ] **Step 1: Append the integration test to `tests/api/test_pipeline.py`**

```python
async def test_run_pipeline_applies_overrides_before_anonymize(tiny_pdf_bytes):
    """run_pipeline with overrides must call override_detections with the
    combined initial + add detections before calling anonymize()."""
    fake_anon = AsyncMock()
    fake_anon.detect = AsyncMock(
        return_value=[
            {"text": "exemple", "label": "PERSON",
             "start_pos": 9, "end_pos": 16, "confidence": 0.9},
        ]
    )
    fake_anon.anonymize = AsyncMock(
        return_value="Voici un exemple simple avec une petite phrase."
    )
    fake_anon.deanonymize = AsyncMock(side_effect=lambda text, thread_id: text)
    fake_anon.override_detections = AsyncMock()

    overrides_in = [{"text": "simple", "label": "ORG", "remove": False}]

    with patch(
        "proofreader.api.pipeline.stream_mistakes",
        return_value=_fake_stream([]),
    ), patch(
        "proofreader.api.pipeline.AnonymizationClient", return_value=fake_anon
    ):
        events = [
            chunk
            async for chunk in run_pipeline(
                pdf_bytes=tiny_pdf_bytes,
                filename="t.pdf",
                debug=False,
                thread_id="t1",
                overrides=overrides_in,
                piighost_api_url="http://piighost",
                litellm_model="gpt-4o-mini",
                litellm_api_key="x",
                litellm_api_base=None,
            )
        ]

    assert fake_anon.override_detections.await_count == 1
    args, kwargs = fake_anon.override_detections.await_args
    sent_detections = args[1] if len(args) > 1 else kwargs["detections"]
    # initial (1) + add for "simple" found once in the markdown
    assert len(sent_detections) >= 2
    assert any(d["label"] == "ORG" for d in sent_detections)
```

- [ ] **Step 2: Append the route test to `tests/api/test_routes.py`**

```python
async def test_proofread_accepts_thread_id_and_overrides_form_fields(tiny_pdf_bytes):
    canned = [
        b'event: meta\ndata: {"language":"fr","page_count":1,"page_sizes":[],"thread_id":"x","filename":"t.pdf"}\n\n',
        b'event: done\ndata: {"mistake_count":0,"unlocatable_count":0}\n\n',
    ]
    captured: dict = {}

    async def fake_run_pipeline(**kwargs) -> AsyncIterator[bytes]:
        captured.update(kwargs)
        for chunk in canned:
            yield chunk

    with patch("proofreader.api.routes.run_pipeline", new=fake_run_pipeline):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            files = {"file": ("t.pdf", tiny_pdf_bytes, "application/pdf")}
            data = {
                "thread_id": "abc-123",
                "overrides": '[{"text":"Acme","label":"ORG"}]',
            }
            response = await client.post("/api/proofread", files=files, data=data)

    assert response.status_code == 200
    assert captured["thread_id"] == "abc-123"
    assert captured["overrides"] == [{"text": "Acme", "label": "ORG"}]
```

- [ ] **Step 3: Run the new tests, verify failure**

```bash
uv run pytest tests/api/test_routes.py::test_proofread_accepts_thread_id_and_overrides_form_fields tests/api/test_pipeline.py::test_run_pipeline_applies_overrides_before_anonymize -xvs
```

Expected: both FAIL.

- [ ] **Step 4: Modify `proofreader/api/pipeline.py::run_pipeline` to accept and apply overrides**

Update the function signature and body. Locate the existing `run_pipeline` and replace it with:

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
    thread_id: str | None = None,
    overrides: list[dict] | None = None,
) -> AsyncIterator[bytes]:
    """Drive the proofreading pipeline and yield formatted SSE events."""
    from proofreader.api.overrides import OverrideEntry, apply_overrides

    if thread_id is None:
        thread_id = str(uuid.uuid4())
    overrides = overrides or []
    parsed_overrides = [
        OverrideEntry(**o) if isinstance(o, dict) else o for o in overrides
    ]

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

    # Apply user overrides: re-fetch initial detections, combine with edits,
    # push the result back via override_detections so the upcoming anonymize()
    # respects the user's choices.
    initial = await client.detect(markdown, thread_id=thread_id)
    final = apply_overrides(initial, parsed_overrides, markdown=markdown)
    await client.override_detections(markdown, final, thread_id=thread_id)

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

- [ ] **Step 5: Modify `/api/proofread` to accept form fields**

In `proofreader/api/routes.py`, update the `proofread` function. Add `Form` to the imports:

```python
from fastapi import APIRouter, File, Form, Query, UploadFile
```

Replace the `proofread` function:

```python
@router.post("/proofread")
async def proofread(
    file: UploadFile = File(...),
    thread_id: str | None = Form(None),
    overrides: str | None = Form(None),
    debug: int = Query(0, description="Set ?debug=1 to include the debug event"),
):
    import json as _json

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

    parsed_overrides: list[dict] = _json.loads(overrides) if overrides else []

    gen = run_pipeline(
        pdf_bytes=pdf_bytes,
        filename=file.filename or "upload.pdf",
        debug=bool(debug),
        piighost_api_url=settings.piighost_api_url,
        litellm_model=settings.litellm_model,
        litellm_api_key=settings.litellm_api_key,
        litellm_api_base=settings.litellm_api_base,
        thread_id=thread_id,
        overrides=parsed_overrides,
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
        except BaseException as exc:  # noqa: BLE001
            reason, message = classify_exception(exc)
            yield format_sse("error", {"reason": reason, "message": message})

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
```

- [ ] **Step 6: Update earlier `run_pipeline` tests** to mock the new `detect` / `override_detections` calls

The existing happy-path test `test_run_pipeline_emits_meta_progress_mistake_done` in `tests/api/test_pipeline.py` needs to be updated — `run_pipeline` now calls `client.detect(...)` and `client.override_detections(...)`. Open the test, find the `AsyncMock()` setup for `fake_anon`, and add:

```python
    fake_anon.detect = AsyncMock(return_value=[])
    fake_anon.override_detections = AsyncMock()
```

right after the existing `fake_anon.deanonymize = …` line. Apply the same fix to `test_run_pipeline_emits_debug_when_requested`.

- [ ] **Step 7: Run the full backend suite, verify all green**

```bash
uv run pytest tests/api/ -xvs 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add proofreader/api/routes.py proofreader/api/pipeline.py tests/api/test_pipeline.py tests/api/test_routes.py
git commit -m "feat(api): proofread accepts thread_id + overrides, pipeline applies them via override_detections"
```

---

### Task 9: Frontend types + `applyOverrides` (TDD)

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Create: `frontend/src/lib/overrides.ts`
- Create: `frontend/tests/overrides.test.ts`

- [ ] **Step 1: Add new types to `frontend/src/lib/types.ts`**

Append at the end of the file:

```typescript
export interface Detection {
  text: string;
  label: string;
  start_pos: number;
  end_pos: number;
  confidence: number;
}

export interface PageDetection extends Detection {
  page: number;
  bbox: [number, number, number, number] | null;
  manual?: boolean;
}

export interface OverrideEntry {
  text: string;
  label: string;
  remove?: boolean;
}

export interface DetectPiiResponse {
  thread_id: string;
  language: string;
  page_count: number;
  page_sizes: PageSize[];
  markdown: string;
  detections: PageDetection[];
}
```

- [ ] **Step 2: Write the failing test `frontend/tests/overrides.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { applyOverrides } from "@/lib/overrides";
import type { PageDetection, OverrideEntry } from "@/lib/types";

const INITIAL: PageDetection[] = [
  {
    text: "Pierre", label: "PERSON",
    start_pos: 0, end_pos: 6, confidence: 0.99,
    page: 0, bbox: [10, 20, 30, 40],
  },
  {
    text: "Lyon", label: "LOCATION",
    start_pos: 30, end_pos: 34, confidence: 0.88,
    page: 0, bbox: [50, 20, 70, 40],
  },
];

describe("applyOverrides", () => {
  it("returns initial when no overrides", () => {
    expect(applyOverrides(INITIAL, [])).toEqual(INITIAL);
  });

  it("keeps removed detections out of the final list", () => {
    const ovs: OverrideEntry[] = [{ text: "Pierre", label: "PERSON", remove: true }];
    const out = applyOverrides(INITIAL, ovs);
    expect(out.find((d) => d.text === "Pierre")).toBeUndefined();
    expect(out.find((d) => d.text === "Lyon")).toBeDefined();
  });

  it("adds a synthetic manual entry per add override", () => {
    const ovs: OverrideEntry[] = [{ text: "Acme", label: "ORG" }];
    const out = applyOverrides(INITIAL, ovs);
    const added = out.find((d) => d.text === "Acme");
    expect(added).toBeDefined();
    expect(added?.manual).toBe(true);
    expect(added?.bbox).toBeNull();
  });

  it("supports relabel via remove + add", () => {
    const ovs: OverrideEntry[] = [
      { text: "Lyon", label: "LOCATION", remove: true },
      { text: "Lyon", label: "CITY" },
    ];
    const out = applyOverrides(INITIAL, ovs);
    const lyons = out.filter((d) => d.text === "Lyon");
    expect(lyons.length).toBe(1);
    expect(lyons[0].label).toBe("CITY");
    expect(lyons[0].manual).toBe(true);
  });

  it("a remove with no match is a no-op", () => {
    const ovs: OverrideEntry[] = [{ text: "Nope", label: "PERSON", remove: true }];
    expect(applyOverrides(INITIAL, ovs)).toEqual(INITIAL);
  });
});
```

- [ ] **Step 3: Run, verify failure**

```bash
cd frontend && npx vitest run tests/overrides.test.ts
```

Expected: 5 FAIL (`overrides` module not found).

- [ ] **Step 4: Implement `frontend/src/lib/overrides.ts`**

```typescript
import type { OverrideEntry, PageDetection } from "./types";

export function applyOverrides(
  initial: PageDetection[],
  overrides: OverrideEntry[]
): PageDetection[] {
  const removeKeys = new Set(
    overrides.filter((o) => o.remove).map((o) => `${o.text}|${o.label}`)
  );
  const kept = initial.filter(
    (d) => !removeKeys.has(`${d.text}|${d.label}`)
  );
  const added: PageDetection[] = overrides
    .filter((o) => !o.remove)
    .map((o) => ({
      text: o.text,
      label: o.label,
      start_pos: -1,
      end_pos: -1,
      confidence: 1.0,
      page: -1,
      bbox: null,
      manual: true,
    }));
  return [...kept, ...added];
}
```

- [ ] **Step 5: Run, verify pass**

```bash
npx vitest run tests/overrides.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 6: Commit**

```bash
cd /home/secondary/PycharmProjects/piighost-proofreader
git add frontend/src/lib/types.ts frontend/src/lib/overrides.ts frontend/tests/overrides.test.ts
git commit -m "feat(frontend): Detection/OverrideEntry types + applyOverrides pure logic"
```

---

### Task 10: Extend `useAppState` for review flow (TDD)

**Files:**
- Modify: `frontend/src/hooks/useAppState.ts`
- Modify: `frontend/tests/appState.test.ts`

- [ ] **Step 1: Append the failing tests to `frontend/tests/appState.test.ts`**

```typescript
import type { DetectPiiResponse } from "@/lib/types";

const FILE = new File([new Uint8Array(0)], "cv.pdf", { type: "application/pdf" });
const DETECT_RESPONSE: DetectPiiResponse = {
  thread_id: "uuid-x",
  language: "fr",
  page_count: 1,
  page_sizes: [{ page: 0, width_pt: 595, height_pt: 842 }],
  markdown: "Pierre travaille à Lyon.",
  detections: [
    {
      text: "Pierre", label: "PERSON",
      start_pos: 0, end_pos: 6, confidence: 0.99,
      page: 0, bbox: [10, 20, 30, 40],
    },
  ],
};

describe("appReducer — review flow", () => {
  it("UPLOAD_STARTED from empty → loading-detect", () => {
    expect(
      appReducer({ kind: "empty" }, { type: "UPLOAD_STARTED", filename: "cv.pdf" })
    ).toEqual({ kind: "loading-detect", filename: "cv.pdf" });
  });

  it("DETECT_LOADED from loading-detect → reviewing", () => {
    const start = appReducer(
      { kind: "empty" },
      { type: "UPLOAD_STARTED", filename: "cv.pdf" }
    );
    const next = appReducer(start, {
      type: "DETECT_LOADED",
      payload: DETECT_RESPONSE,
      file: FILE,
      pdfBytes: PDF_BYTES,
    });
    expect(next.kind).toBe("reviewing");
    if (next.kind !== "reviewing") return;
    expect(next.markdown).toContain("Pierre");
    expect(next.detections.length).toBe(1);
    expect(next.pendingOverrides).toEqual([]);
  });

  it("OVERRIDE_ADD from reviewing → appends to pendingOverrides", () => {
    const start = appReducer(
      appReducer({ kind: "empty" }, { type: "UPLOAD_STARTED", filename: "cv.pdf" }),
      { type: "DETECT_LOADED", payload: DETECT_RESPONSE, file: FILE, pdfBytes: PDF_BYTES }
    );
    const next = appReducer(start, {
      type: "OVERRIDE_ADD",
      text: "Acme",
      label: "ORG",
    });
    if (next.kind !== "reviewing") throw new Error("expected reviewing");
    expect(next.pendingOverrides).toEqual([
      { text: "Acme", label: "ORG" },
    ]);
  });

  it("OVERRIDE_REMOVE_DETECTION encodes a remove entry", () => {
    const start = appReducer(
      appReducer({ kind: "empty" }, { type: "UPLOAD_STARTED", filename: "cv.pdf" }),
      { type: "DETECT_LOADED", payload: DETECT_RESPONSE, file: FILE, pdfBytes: PDF_BYTES }
    );
    const next = appReducer(start, {
      type: "OVERRIDE_REMOVE_DETECTION",
      detection: DETECT_RESPONSE.detections[0],
    });
    if (next.kind !== "reviewing") throw new Error("expected reviewing");
    expect(next.pendingOverrides).toEqual([
      { text: "Pierre", label: "PERSON", remove: true },
    ]);
  });

  it("REVIEW_SUBMIT from reviewing → loading-proofread", () => {
    const start = appReducer(
      appReducer({ kind: "empty" }, { type: "UPLOAD_STARTED", filename: "cv.pdf" }),
      { type: "DETECT_LOADED", payload: DETECT_RESPONSE, file: FILE, pdfBytes: PDF_BYTES }
    );
    const next = appReducer(start, { type: "REVIEW_SUBMIT" });
    expect(next.kind).toBe("loading-proofread");
    if (next.kind !== "loading-proofread") return;
    expect(next.filename).toBe("cv.pdf");
    expect(next.file).toBe(FILE);
    expect(next.thread_id).toBe("uuid-x");
  });
});
```

- [ ] **Step 2: Run, verify failure**

```bash
cd frontend && npx vitest run tests/appState.test.ts
```

Expected: 5 new tests FAIL.

- [ ] **Step 3: Update `frontend/src/hooks/useAppState.ts`**

Replace the file entirely:

```typescript
import { useReducer } from "react";
import type {
  DetectPiiResponse,
  LocatedMistake,
  Mistake,
  OverrideEntry,
  PageDetection,
  PageSize,
  ProgressStep,
  ProofreadResult,
} from "@/lib/types";

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
  | { kind: "loading-detect"; filename: string }
  | {
      kind: "reviewing";
      filename: string;
      file: File;
      pdfBytes: Uint8Array;
      thread_id: string;
      language: string;
      page_count: number;
      page_sizes: PageSize[];
      markdown: string;
      detections: PageDetection[];
      pendingOverrides: OverrideEntry[];
    }
  | {
      kind: "loading-proofread";
      filename: string;
      file: File;
      thread_id: string;
      overrides: OverrideEntry[];
    }
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
  | { type: "DETECT_LOADED"; payload: DetectPiiResponse; file: File; pdfBytes: Uint8Array }
  | { type: "OVERRIDE_ADD"; text: string; label: string }
  | { type: "OVERRIDE_REMOVE_DETECTION"; detection: PageDetection }
  | { type: "OVERRIDE_RELABEL"; detection: PageDetection; newLabel: string }
  | { type: "REVIEW_SUBMIT" }
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
      return { kind: "loading-detect", filename: action.filename };

    case "DETECT_LOADED": {
      const p = action.payload;
      return {
        kind: "reviewing",
        filename: state.kind === "loading-detect" ? state.filename : p.detections[0]?.text ?? "cv.pdf",
        file: action.file,
        pdfBytes: action.pdfBytes,
        thread_id: p.thread_id,
        language: p.language,
        page_count: p.page_count,
        page_sizes: p.page_sizes,
        markdown: p.markdown,
        detections: p.detections,
        pendingOverrides: [],
      };
    }

    case "OVERRIDE_ADD":
      if (state.kind !== "reviewing") return state;
      return {
        ...state,
        pendingOverrides: [
          ...state.pendingOverrides,
          { text: action.text, label: action.label },
        ],
      };

    case "OVERRIDE_REMOVE_DETECTION":
      if (state.kind !== "reviewing") return state;
      return {
        ...state,
        pendingOverrides: [
          ...state.pendingOverrides,
          { text: action.detection.text, label: action.detection.label, remove: true },
        ],
      };

    case "OVERRIDE_RELABEL":
      if (state.kind !== "reviewing") return state;
      return {
        ...state,
        pendingOverrides: [
          ...state.pendingOverrides,
          { text: action.detection.text, label: action.detection.label, remove: true },
          { text: action.detection.text, label: action.newLabel },
        ],
      };

    case "REVIEW_SUBMIT":
      if (state.kind !== "reviewing") return state;
      return {
        kind: "loading-proofread",
        filename: state.filename,
        file: state.file,
        thread_id: state.thread_id,
        overrides: state.pendingOverrides,
      };

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

- [ ] **Step 4: Run, verify pass**

```bash
npx vitest run tests/appState.test.ts
```

Expected: all tests pass (15 total — 10 from phase 2 + 5 new).

- [ ] **Step 5: Commit**

```bash
cd /home/secondary/PycharmProjects/piighost-proofreader
git add frontend/src/hooks/useAppState.ts frontend/tests/appState.test.ts
git commit -m "feat(frontend): extend appState with reviewing/loading-detect/loading-proofread states"
```

---

### Task 11: `useDetectPii` + `useLabels` hooks

**Files:**
- Create: `frontend/src/hooks/useDetectPii.ts`
- Create: `frontend/src/hooks/useLabels.ts`

- [ ] **Step 1: Create `frontend/src/hooks/useDetectPii.ts`**

```typescript
import { useCallback } from "react";
import type { AppAction, ErrorReason } from "./useAppState";
import type { DetectPiiResponse } from "@/lib/types";

export function useDetectPii(dispatch: (action: AppAction) => void) {
  return useCallback(
    async (file: File) => {
      dispatch({ type: "UPLOAD_STARTED", filename: file.name });
      const pdfBytes = new Uint8Array(await file.arrayBuffer());
      const formData = new FormData();
      formData.append("file", file);
      let response: Response;
      try {
        response = await fetch("/api/detect-pii", {
          method: "POST",
          body: formData,
        });
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
        const reason: ErrorReason = (body.reason as ErrorReason) ?? "internal";
        dispatch({
          type: "ERROR",
          reason,
          details: { sizeMb: body.size_mb, message: body.message },
        });
        return;
      }
      const data: DetectPiiResponse = await response.json();
      dispatch({ type: "DETECT_LOADED", payload: data, file, pdfBytes });
    },
    [dispatch]
  );
}
```

- [ ] **Step 2: Create `frontend/src/hooks/useLabels.ts`**

```typescript
import { useEffect, useRef, useState } from "react";

interface State {
  labels: string[];
  loading: boolean;
}

export function useLabels(): State {
  const [state, setState] = useState<State>({ labels: [], loading: true });
  const fetched = useRef(false);
  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    (async () => {
      try {
        const r = await fetch("/api/labels");
        if (!r.ok) {
          setState({ labels: [], loading: false });
          return;
        }
        const body = await r.json();
        setState({ labels: body.labels ?? [], loading: false });
      } catch {
        setState({ labels: [], loading: false });
      }
    })();
  }, []);
  return state;
}
```

- [ ] **Step 3: Verify TS compiles**

```bash
cd frontend && npm run build 2>&1 | tail -5
```

Expected: build succeeds (the hooks aren't used yet so no consumer breakage).

- [ ] **Step 4: Commit**

```bash
cd /home/secondary/PycharmProjects/piighost-proofreader
git add frontend/src/hooks/useDetectPii.ts frontend/src/hooks/useLabels.ts
git commit -m "feat(frontend): useDetectPii and useLabels hooks"
```

---

### Task 12: Modify `useResultStream` to take `thread_id` + `overrides`

**Files:**
- Modify: `frontend/src/hooks/useResultStream.ts`

- [ ] **Step 1: Replace `frontend/src/hooks/useResultStream.ts`**

```typescript
import { useCallback } from "react";
import { parseSSE } from "@/lib/parseSSE";
import type { AppAction, ErrorReason } from "./useAppState";
import type { LocatedMistake, Mistake, OverrideEntry } from "@/lib/types";

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
    async (
      file: File,
      thread_id: string,
      overrides: OverrideEntry[],
      debug: boolean
    ) => {
      const pdfBytes = new Uint8Array(await file.arrayBuffer());
      const formData = new FormData();
      formData.append("file", file);
      formData.append("thread_id", thread_id);
      formData.append("overrides", JSON.stringify(overrides));
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
        const reason: ErrorReason = (body.reason as ErrorReason) ?? "internal";
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
            dispatch({ type: "STREAM_MISTAKE", mistake: event.data as LocatedMistake });
            break;
          case "unlocatable":
            dispatch({ type: "STREAM_UNLOCATABLE", mistake: event.data as Mistake });
            break;
          case "debug":
            dispatch({ type: "STREAM_DEBUG", debug: event.data as DebugData });
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

- [ ] **Step 2: Commit**

```bash
git add frontend/src/hooks/useResultStream.ts
git commit -m "feat(frontend): useResultStream now takes thread_id + overrides"
```

---

### Task 13: Extend `PdfPanel` with text-layer support + variant

**Files:**
- Modify: `frontend/src/lib/pdf.ts`
- Modify: `frontend/src/components/PdfPanel.tsx`
- Modify: `frontend/src/components/HighlightOverlay.tsx`

PDF.js exposes a native text layer via `pdfjsLib.renderTextLayer()`. We render it as a sibling of the canvas, positioned absolutely on top, with `pointer-events: auto` and `user-select: text`. The overlay highlights stay on top of the text layer, with `pointer-events: none`.

- [ ] **Step 1: Update `frontend/src/lib/pdf.ts` to capture the text content per page**

Replace `RenderedPage` and `renderAllPages`:

```typescript
import * as pdfjsLib from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

export interface RenderedPage {
  pageIndex: number;
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  scale: number;
  page: import("pdfjs-dist").PDFPageProxy;
  viewport: import("pdfjs-dist").PageViewport;
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function renderAllPages(
  bytes: Uint8Array,
  scale = 1.25
): Promise<RenderedPage[]> {
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(bytes) });
  const pdf = await loadingTask.promise;
  const out: RenderedPage[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvasContext: ctx, viewport }).promise;
    out.push({
      pageIndex: i - 1,
      canvas,
      width: viewport.width,
      height: viewport.height,
      scale,
      page,
      viewport,
    });
  }
  return out;
}
```

- [ ] **Step 2: Modify `frontend/src/components/HighlightOverlay.tsx` to accept a `variant`**

```tsx
import { useEffect, useRef } from "react";
import type { LocatedMistake, PageDetection } from "@/lib/types";

export type OverlayVariant = "mistake" | "detection";

interface Spec {
  page: number;
  bbox: [number, number, number, number];
  active?: boolean;
}

interface Props {
  items: Spec[];
  pageIndex: number;
  pageWidthPt: number;
  pageHeightPt: number;
  variant: OverlayVariant;
  activeIndex: number | null;
}

const COLORS: Record<OverlayVariant, { default: string; active: string; outline: string }> = {
  mistake: {
    default: "rgba(235, 30, 30, 0.35)",
    active: "rgba(255, 230, 0, 0.55)",
    outline: "#f59e0b",
  },
  detection: {
    default: "rgba(59, 130, 246, 0.35)", // blue-500
    active: "rgba(255, 230, 0, 0.55)",
    outline: "#f59e0b",
  },
};

export default function HighlightOverlay({
  items,
  pageIndex,
  pageWidthPt,
  pageHeightPt,
  variant,
  activeIndex,
}: Props) {
  const activeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeIndex]);

  const colors = COLORS[variant];

  return (
    <div className="absolute inset-0 pointer-events-none">
      {items.map((item, idx) => {
        if (item.page !== pageIndex) return null;
        const [x0, y0, x1, y1] = item.bbox;
        const isActive = idx === activeIndex;
        return (
          <div
            key={idx}
            ref={isActive ? activeRef : null}
            className="absolute rounded-sm transition-colors"
            style={{
              left: `${(x0 / pageWidthPt) * 100}%`,
              top: `${(y0 / pageHeightPt) * 100}%`,
              width: `${((x1 - x0) / pageWidthPt) * 100}%`,
              height: `${((y1 - y0) / pageHeightPt) * 100}%`,
              backgroundColor: isActive ? colors.active : colors.default,
              outline: isActive ? `2px solid ${colors.outline}` : "none",
            }}
          />
        );
      })}
    </div>
  );
}
```

NOTE: The legacy `mistakes/enabled/activeIndex` props were collapsed into a generic `items` array. We update `PdfPanel.tsx` next to map both mistakes and detections to this shape.

- [ ] **Step 3: Modify `frontend/src/components/PdfPanel.tsx` to support text layer + variant**

```tsx
import { useEffect, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { base64ToBytes, renderAllPages, type RenderedPage } from "@/lib/pdf";
import HighlightOverlay, { type OverlayVariant } from "./HighlightOverlay";
import type { LocatedMistake, PageDetection } from "@/lib/types";

type Item =
  | { kind: "mistake"; m: LocatedMistake; enabled: boolean }
  | { kind: "detection"; d: PageDetection };

interface Props {
  pdfBytes: Uint8Array;
  pageSizes: { page: number; width_pt: number; height_pt: number }[];
  variant: OverlayVariant;
  items: Item[];
  activeIndex: number | null;
  enableTextLayer?: boolean;
  onTextSelection?: (text: string) => void;
}

export default function PdfPanel({
  pdfBytes,
  pageSizes,
  variant,
  items,
  activeIndex,
  enableTextLayer = false,
  onTextSelection,
}: Props) {
  const [pages, setPages] = useState<RenderedPage[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rendered = await renderAllPages(pdfBytes, 2);
      if (cancelled) return;
      setPages(rendered);
    })();
    return () => { cancelled = true; };
  }, [pdfBytes]);

  // Text-layer mouseup → text selection callback
  useEffect(() => {
    if (!enableTextLayer || !onTextSelection) return;
    const handler = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;
      const text = sel.toString().replace(/\s+/g, " ").trim();
      if (text.length < 2) return;
      onTextSelection(text);
      sel.removeAllRanges();
    };
    document.addEventListener("mouseup", handler);
    return () => document.removeEventListener("mouseup", handler);
  }, [enableTextLayer, onTextSelection]);

  // Project items to plain {page, bbox} specs for HighlightOverlay
  const overlaySpecs = items
    .map((it) => {
      if (it.kind === "mistake") {
        if (!it.enabled) return null;
        return { page: it.m.page, bbox: it.m.bbox };
      }
      if (it.d.bbox == null) return null;
      return { page: it.d.page, bbox: it.d.bbox };
    })
    .filter((s): s is { page: number; bbox: [number, number, number, number] } => s !== null);

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
            {enableTextLayer && (
              <TextLayer page={p} />
            )}
            <HighlightOverlay
              items={overlaySpecs}
              pageIndex={p.pageIndex}
              pageWidthPt={pageWidthPt}
              pageHeightPt={pageHeightPt}
              variant={variant}
              activeIndex={activeIndex}
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

function TextLayer({ page }: { page: RenderedPage }) {
  return (
    <div
      ref={(container) => {
        if (!container) return;
        if (container.dataset.rendered === "1") return;
        container.innerHTML = "";
        page.page
          .getTextContent()
          .then((textContent) => {
            pdfjsLib.renderTextLayer({
              textContent,
              container,
              viewport: page.viewport,
              textDivs: [],
            } as never);
            container.dataset.rendered = "1";
          })
          .catch(() => { /* swallow */ });
      }}
      className="absolute inset-0 opacity-100"
      style={{
        // Important: the layer occupies the same coords as the canvas
        // so getSelection() over it returns the right text. We make it
        // text-selectable but visually transparent on top of the canvas.
        color: "transparent",
        userSelect: "text",
        pointerEvents: "auto",
      }}
    />
  );
}
```

- [ ] **Step 4: Update ResultsState.tsx to pass the new PdfPanel API**

ResultsState currently passes `mistakes`, `enabled`, `activeIndex` directly. Now it must construct `items` and pass `variant="mistake"`.

Open `frontend/src/components/ResultsState.tsx` and find the `<PdfPanel ... />` invocation. Replace it with:

```tsx
            <PdfPanel
              pdfBytes={pdfBytes}
              pageSizes={data.page_sizes}
              variant="mistake"
              items={data.mistakes.map((m, i) => ({
                kind: "mistake" as const,
                m,
                enabled: mistakesState.enabled[i] ?? true,
              }))}
              activeIndex={mistakesState.activeIndex}
            />
```

- [ ] **Step 5: Build to verify no regression**

```bash
cd frontend && npm run build 2>&1 | tail -8
```

Expected: build succeeds.

- [ ] **Step 6: Manual smoke (results state still works)**

```bash
npm run dev  # if not already running
```

Open `http://localhost:5173/?fake=1` → should still see the results state with mistakes highlighted in red as before. Then refresh, this time the text layer is NOT enabled (no review state yet).

- [ ] **Step 7: Commit**

```bash
cd /home/secondary/PycharmProjects/piighost-proofreader
git add frontend/src/lib/pdf.ts frontend/src/components/PdfPanel.tsx frontend/src/components/HighlightOverlay.tsx frontend/src/components/ResultsState.tsx
git commit -m "feat(frontend): PdfPanel supports enableTextLayer + variant (mistake/detection)"
```

---

### Task 14: `LabelPickerModal`, `DetectionCard`, `DetectionsPanel`, `ReviewTopBar`

**Files:**
- Create: `frontend/src/components/LabelPickerModal.tsx`
- Create: `frontend/src/components/DetectionCard.tsx`
- Create: `frontend/src/components/DetectionsPanel.tsx`
- Create: `frontend/src/components/ReviewTopBar.tsx`

- [ ] **Step 1: Create `frontend/src/components/LabelPickerModal.tsx`**

```tsx
import { useEffect, useState } from "react";
import { Button } from "@/components/tailgrids/core/button";

interface Props {
  open: boolean;
  text: string;
  labels: string[];
  onPick: (label: string) => void;
  onClose: () => void;
}

export default function LabelPickerModal({
  open, text, labels, onPick, onClose,
}: Props) {
  const [selected, setSelected] = useState<string>("");

  useEffect(() => {
    if (open) setSelected("");
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground-100/50"
      onClick={onClose}
    >
      <div
        className="bg-background-50 rounded-xl p-6 w-full max-w-md mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold mb-2">Anonymiser comme&nbsp;:</h3>
        <p className="bg-background-soft-50 rounded p-2 text-sm mb-4 break-words">
          {text}
        </p>
        <div className="max-h-48 overflow-y-auto mb-4 space-y-1">
          {labels.map((label) => (
            <label
              key={label}
              className="flex items-center gap-2 px-2 py-1 rounded hover:bg-background-soft-50 cursor-pointer"
            >
              <input
                type="radio"
                name="label"
                value={label}
                checked={selected === label}
                onChange={() => setSelected(label)}
              />
              <span className="text-sm">{label}</span>
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="primary" appearance="outline" size="sm" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="primary"
            appearance="fill"
            size="sm"
            onClick={() => selected && onPick(selected)}
            disabled={!selected}
          >
            Ajouter
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `frontend/src/components/DetectionCard.tsx`**

```tsx
import { useState } from "react";
import type { PageDetection } from "@/lib/types";

interface Props {
  detection: PageDetection;
  active: boolean;
  labels: string[];
  onActivate: () => void;
  onRemove: () => void;
  onRelabel: (newLabel: string) => void;
}

export default function DetectionCard({
  detection, active, labels, onActivate, onRemove, onRelabel,
}: Props) {
  const [labelMenuOpen, setLabelMenuOpen] = useState(false);
  const ring = active
    ? "border border-amber-200 bg-amber-50"
    : "border border-base-100 bg-background-50";
  const manualBadge = detection.manual ? (
    <span className="text-[10px] italic text-text-200 ml-2">manuel</span>
  ) : null;

  return (
    <div
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("[data-action]")) return;
        onActivate();
      }}
      className={`flex items-start gap-3 p-3 rounded-lg mb-2 cursor-pointer transition-colors ${ring}`}
    >
      <div className="flex-1 text-xs min-w-0">
        <div className="break-words leading-snug font-semibold">
          {detection.text}{manualBadge}
        </div>
        <div className="relative inline-block mt-1">
          <button
            type="button"
            data-action
            onClick={(e) => {
              e.stopPropagation();
              setLabelMenuOpen((v) => !v);
            }}
            className="text-[10px] uppercase italic text-text-200 hover:text-text-50 px-1 py-0.5 rounded hover:bg-background-soft-50"
          >
            {detection.label} ▾
          </button>
          {labelMenuOpen && (
            <div
              data-action
              className="absolute z-10 bg-background-50 border border-base-100 rounded-md shadow-md mt-1 max-h-40 overflow-y-auto min-w-32"
            >
              {labels
                .filter((l) => l !== detection.label)
                .map((l) => (
                  <button
                    key={l}
                    type="button"
                    data-action
                    className="block w-full text-left px-3 py-1 text-xs hover:bg-background-soft-50"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRelabel(l);
                      setLabelMenuOpen(false);
                    }}
                  >
                    {l}
                  </button>
                ))}
            </div>
          )}
        </div>
      </div>
      <button
        type="button"
        data-action
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="text-text-200 hover:text-button-error-background text-sm leading-none p-1"
        title="Retirer cette détection"
      >
        ✕
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Create `frontend/src/components/DetectionsPanel.tsx`**

```tsx
import type { PageDetection } from "@/lib/types";
import DetectionCard from "./DetectionCard";

interface Props {
  detections: PageDetection[];
  labels: string[];
  activeIndex: number | null;
  onActivate: (i: number) => void;
  onRemove: (d: PageDetection) => void;
  onRelabel: (d: PageDetection, newLabel: string) => void;
}

export default function DetectionsPanel({
  detections, labels, activeIndex, onActivate, onRemove, onRelabel,
}: Props) {
  if (detections.length === 0) {
    return (
      <div className="h-full flex items-center justify-center px-8">
        <div className="text-center max-w-[260px]">
          <div className="text-3xl mb-3">🛡️</div>
          <div className="text-lg font-semibold mb-2">Aucune entité détectée</div>
          <div className="text-base text-text-100 leading-relaxed">
            piighost-api n'a rien repéré.
            Tu peux sélectionner du texte sur le PDF pour l'anonymiser à la main.
          </div>
        </div>
      </div>
    );
  }
  return (
    <div>
      <p className="text-[11px] text-text-200 italic mb-3">
        Cliquez sur une carte pour la mettre en évidence sur le PDF. Croix pour
        retirer, label pour re-catégoriser.
      </p>
      {detections.map((d, i) => (
        <DetectionCard
          key={i}
          detection={d}
          active={activeIndex === i}
          labels={labels}
          onActivate={() => onActivate(i)}
          onRemove={() => onRemove(d)}
          onRelabel={(l) => onRelabel(d, l)}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Create `frontend/src/components/ReviewTopBar.tsx`**

```tsx
import { Badge } from "@/components/tailgrids/core/badge";
import { Button } from "@/components/tailgrids/core/button";

interface Props {
  filename: string;
  count: number;
  onCancel: () => void;
  onValidate: () => void;
}

export default function ReviewTopBar({
  filename, count, onCancel, onValidate,
}: Props) {
  return (
    <div className="flex items-center justify-between bg-background-50 border border-base-100 rounded-xl px-5 py-3 mb-5">
      <div className="flex items-center gap-3">
        <span className="font-semibold">{filename}</span>
        <Badge color="primary" size="sm">{count} entités à anonymiser</Badge>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="primary" appearance="outline" size="sm" onClick={onCancel}>
          Annuler
        </Button>
        <Button variant="primary" appearance="fill" size="sm" onClick={onValidate}>
          Valider et analyser
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Confirm TS compiles**

```bash
cd frontend && npm run build 2>&1 | tail -5
```

Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
cd /home/secondary/PycharmProjects/piighost-proofreader
git add frontend/src/components/LabelPickerModal.tsx frontend/src/components/DetectionCard.tsx frontend/src/components/DetectionsPanel.tsx frontend/src/components/ReviewTopBar.tsx
git commit -m "feat(frontend): review UI primitives (LabelPickerModal + DetectionCard + DetectionsPanel + ReviewTopBar)"
```

---

### Task 15: `ReviewState` component

**Files:**
- Create: `frontend/src/components/ReviewState.tsx`

- [ ] **Step 1: Create `frontend/src/components/ReviewState.tsx`**

```tsx
import { useMemo, useState } from "react";
import { applyOverrides } from "@/lib/overrides";
import { useLabels } from "@/hooks/useLabels";
import type { AppAction } from "@/hooks/useAppState";
import type { PageDetection, PageSize } from "@/lib/types";
import PdfPanel from "./PdfPanel";
import DetectionsPanel from "./DetectionsPanel";
import LabelPickerModal from "./LabelPickerModal";
import ReviewTopBar from "./ReviewTopBar";

interface Props {
  filename: string;
  pdfBytes: Uint8Array;
  page_sizes: PageSize[];
  detections: PageDetection[];
  pendingOverrides: import("@/lib/types").OverrideEntry[];
  dispatch: (action: AppAction) => void;
}

export default function ReviewState({
  filename, pdfBytes, page_sizes, detections, pendingOverrides, dispatch,
}: Props) {
  const labelsState = useLabels();
  const finalDetections = useMemo(
    () => applyOverrides(detections, pendingOverrides),
    [detections, pendingOverrides]
  );
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [pickerText, setPickerText] = useState<string>("");

  return (
    <div className="min-h-screen flex flex-col max-w-6xl mx-auto px-4 sm:px-8 lg:px-12 py-6 lg:py-10">
      <ReviewTopBar
        filename={filename}
        count={finalDetections.length}
        onCancel={() => dispatch({ type: "RESET" })}
        onValidate={() => dispatch({ type: "REVIEW_SUBMIT" })}
      />
      <div className="lg:flex-1 flex flex-col lg:flex-row gap-6 lg:min-h-0">
        <div className="flex-1 overflow-y-auto bg-background-50 border border-base-100 rounded-xl p-6 min-h-[60vh] lg:min-h-0">
          <PdfPanel
            pdfBytes={pdfBytes}
            pageSizes={page_sizes}
            variant="detection"
            enableTextLayer
            onTextSelection={(t) => setPickerText(t)}
            items={finalDetections.map((d) => ({ kind: "detection" as const, d }))}
            activeIndex={activeIndex}
          />
        </div>
        <div className="flex-1 overflow-y-auto bg-background-50 border border-base-100 rounded-xl p-5 min-h-[40vh] lg:min-h-0">
          <DetectionsPanel
            detections={finalDetections}
            labels={labelsState.labels}
            activeIndex={activeIndex}
            onActivate={(i) => setActiveIndex(i === activeIndex ? null : i)}
            onRemove={(d) =>
              dispatch({ type: "OVERRIDE_REMOVE_DETECTION", detection: d })
            }
            onRelabel={(d, newLabel) =>
              dispatch({ type: "OVERRIDE_RELABEL", detection: d, newLabel })
            }
          />
        </div>
      </div>
      <LabelPickerModal
        open={pickerText.length > 0}
        text={pickerText}
        labels={labelsState.labels}
        onPick={(label) => {
          dispatch({ type: "OVERRIDE_ADD", text: pickerText, label });
          setPickerText("");
        }}
        onClose={() => setPickerText("")}
      />
    </div>
  );
}
```

- [ ] **Step 2: Build**

```bash
cd frontend && npm run build 2>&1 | tail -5
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
cd /home/secondary/PycharmProjects/piighost-proofreader
git add frontend/src/components/ReviewState.tsx
git commit -m "feat(frontend): ReviewState orchestrates PDF text selection + detections list"
```

---

### Task 16: Wire `App.tsx` for the detect → review → proofread flow

**Files:**
- Modify: `frontend/src/App.tsx`
- Create: `frontend/src/fixtures/sample-detections.json`

- [ ] **Step 1: Generate the fake detections fixture using the existing sample PDF**

Run from `piighost-proofreader/`:

```bash
uv run python -c "
import fitz, json
doc = fitz.open('frontend/src/fixtures/sample-cv.pdf')
page = doc.load_page(0)
words = [(x0, y0, x1, y1, t) for x0, y0, x1, y1, t, *_ in page.get_text('words')]

def find_word(needle, after=0):
    for i, w in enumerate(words[after:], start=after):
        if w[4].startswith(needle):
            return i, w
    return None, None

# We pick a couple of words from the sample as fake 'detections'
_, w1 = find_word('exemple')
_, w2 = find_word('phrase')
detections = [
    {'text': w1[4], 'label': 'PERSON', 'start_pos': 9, 'end_pos': 16, 'confidence': 0.98,
     'page': 0, 'bbox': [w1[0], w1[1], w1[2], w1[3]]},
    {'text': w2[4], 'label': 'LOCATION', 'start_pos': 30, 'end_pos': 36, 'confidence': 0.90,
     'page': 0, 'bbox': [w2[0], w2[1], w2[2], w2[3]]},
]
out = {
    'thread_id': 'fake-thread-review',
    'language': 'fr',
    'page_count': 1,
    'page_sizes': [{'page': 0, 'width_pt': page.rect.width, 'height_pt': page.rect.height}],
    'markdown': 'Voici un exemple simple avec mot mot dans une phrase.\nUne faute ortho ici et une autre la.',
    'detections': detections,
}
with open('frontend/src/fixtures/sample-detections.json', 'w') as f:
    json.dump(out, f, ensure_ascii=False, indent=2)
print('written', len(detections), 'detections')
"
```

Expected: `written 2 detections`.

- [ ] **Step 2: Replace `frontend/src/App.tsx`**

```tsx
import { useEffect } from "react";
import { useAppState, type AppAction } from "@/hooks/useAppState";
import { fakeMode, isDebugAvailable } from "@/hooks/useDebugMode";
import { useDetectPii } from "@/hooks/useDetectPii";
import { useResultStream } from "@/hooks/useResultStream";
import EmptyState from "@/components/EmptyState";
import LoadingState from "@/components/LoadingState";
import ErrorState from "@/components/ErrorState";
import ResultsState from "@/components/ResultsState";
import ReviewState from "@/components/ReviewState";
import sampleResult from "@/fixtures/sample-result.json";
import sampleDetections from "@/fixtures/sample-detections.json";
import samplePdfUrl from "@/fixtures/sample-cv.pdf?url";
import type { DetectPiiResponse, LocatedMistake, ProofreadResult } from "@/lib/types";

async function simulateDetect(dispatch: (a: AppAction) => void) {
  const fakeFile = new File([new Uint8Array(0)], "fake-cv.pdf", { type: "application/pdf" });
  const pdfResponse = await fetch(samplePdfUrl);
  const pdfBytes = new Uint8Array(await pdfResponse.arrayBuffer());
  dispatch({ type: "UPLOAD_STARTED", filename: "fake-cv.pdf" });
  await new Promise((r) => setTimeout(r, 200));
  dispatch({
    type: "DETECT_LOADED",
    payload: sampleDetections as DetectPiiResponse,
    file: fakeFile,
    pdfBytes,
  });
}

async function simulateStreamAfterSubmit(
  dispatch: (a: AppAction) => void,
  empty: boolean
) {
  const res = sampleResult as Omit<ProofreadResult, "unlocatable"> & {
    mistakes: LocatedMistake[];
  };
  const pdfResponse = await fetch(samplePdfUrl);
  const pdfBytes = new Uint8Array(await pdfResponse.arrayBuffer());
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
  const startDetect = useDetectPii(dispatch);
  const startStream = useResultStream(dispatch);
  const fake = fakeMode();

  // ?fake=1 / ?fake=empty: simulate detect step on entry
  useEffect(() => {
    if (state.kind === "empty" && fake !== "off") {
      simulateDetect(dispatch);
    }
  }, [state.kind, fake, dispatch]);

  // After REVIEW_SUBMIT → loading-proofread → kick off the real stream
  // (or the simulated one in ?fake mode)
  useEffect(() => {
    if (state.kind !== "loading-proofread") return;
    if (fake !== "off") {
      simulateStreamAfterSubmit(dispatch, fake === "empty");
    } else {
      startStream(state.file, state.thread_id, state.overrides, isDebugAvailable());
    }
  }, [state.kind, fake, dispatch, startStream]);

  switch (state.kind) {
    case "empty":
      return (
        <EmptyState
          onFile={(file) => startDetect(file)}
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
    case "loading-detect":
      return <LoadingState />;
    case "reviewing":
      return (
        <ReviewState
          filename={state.filename}
          pdfBytes={state.pdfBytes}
          page_sizes={state.page_sizes}
          detections={state.detections}
          pendingOverrides={state.pendingOverrides}
          dispatch={dispatch}
        />
      );
    case "loading-proofread":
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

- [ ] **Step 3: Build**

```bash
cd frontend && npm run build 2>&1 | tail -8
```

Expected: build succeeds.

- [ ] **Step 4: Manual smoke — `?fake=1`**

```bash
npm run dev   # if not already running
```

Open `http://localhost:5173/?fake=1`. Expected sequence:
1. Empty state flashes briefly.
2. Loader for ~200 ms.
3. Review state appears with the PDF on the left + 2 blue highlights + 2 cards on the right.
4. Click "Annuler" → back to empty.
5. Reload, this time click "Valider et analyser" → loader → results state with 5 mistakes streaming in (red highlights, list on right).
6. Try the X on a detection card before submit → card disappears, blue highlight disappears.
7. Try selecting some text on the PDF → modal opens with the label radio list (might be empty if `/api/labels` doesn't return without backend — that's expected in pure ?fake mode).

- [ ] **Step 5: Commit**

```bash
cd /home/secondary/PycharmProjects/piighost-proofreader
git add frontend/src/App.tsx frontend/src/fixtures/sample-detections.json
git commit -m "feat(frontend): App.tsx wires detect → review → proofread flow + ?fake simulation"
```

---

### Task 17: End-to-end walkthrough with real backend

**Files:** None (manual validation).

- [ ] **Step 1: Make sure the three services are running**

```bash
# Terminal 1
cd ~/PycharmProjects/piighost-api && uv run piighost-api serve pipeline:pipeline --port 8000
# Terminal 2
cd ~/PycharmProjects/piighost-proofreader && uv run uvicorn proofreader.api.app:app --reload --port 8001
# Terminal 3
cd ~/PycharmProjects/piighost-proofreader/frontend && npm run dev
```

- [ ] **Step 2: Run the full backend suite**

```bash
cd ~/PycharmProjects/piighost-proofreader && uv run pytest tests/api/ -xvs 2>&1 | tail -15
```

Expected: all green.

- [ ] **Step 3: Run the full frontend suite**

```bash
cd frontend && npm test
```

Expected: 23+ tests pass (existing 18 + new appState review tests + overrides tests).

- [ ] **Step 4: Walk through each acceptance criterion from the spec**

Open `http://localhost:5173/` (without `?fake=1`). Upload a real CV PDF. Tick each box only after observing the behavior in the browser.

- [ ] Loader brief (~3 s) for detect-pii.
- [ ] Review state appears with blue highlights on the PDF for detected PIIs (names, locations, emails).
- [ ] Detections panel on the right lists each entity with its label.
- [ ] Click a card → it activates (amber background) and the corresponding blue highlight becomes yellow.
- [ ] Click the X on a card → card disappears, highlight disappears.
- [ ] Click the label badge inside a card → dropdown opens with other labels → pick one → label updates, card flagged as "manuel".
- [ ] Select some text on the PDF (e.g. a phone number that wasn't detected) → modal opens with the selected text + radio list of labels.
- [ ] Pick a label + click "Ajouter" → new "manuel" card appears in the list. No PDF highlight yet (expected per spec — only after submit).
- [ ] Click "Valider et analyser" → loader → results state, with red highlights for mistakes. The previously anonymised entities are NOT highlighted any more.
- [ ] In `?debug=1` mode, the debug panel shows the markdown anonymised — verify that the user-added text appears replaced by a `<LABEL_N>` placeholder.
- [ ] Click "Nouveau PDF" → back to empty state, can re-upload.
- [ ] `?fake=1` still works end-to-end.

- [ ] **Step 5: Final commit if any tweaks were needed during walkthrough**

```bash
git status
# if dirty:
git add -p
git commit -m "chore: post-acceptance HITL tweaks"
```

---

## Self-review pass (writing-plans skill checklist)

**Spec coverage:**

- 2-step API (detect-pii → proofread) → Tasks 6, 7, 8
- Mapping PDF→markdown via `markdown.find()` → Task 3 (apply_overrides)
- Detection bboxes via locator → Tasks 4, 5
- Add/Remove/Relabel actions → Task 10 (reducer) + Task 14 (UI) + Task 15 (wiring)
- PDF.js text layer + selection → Task 13 (PdfPanel) + Task 15 (ReviewState wiring)
- LabelPickerModal → Task 14
- `GET /api/labels` + `useLabels()` → Tasks 7, 11
- Streamlit untouched verified → Task 2 step 5
- `?fake=1` extended for review simulation → Task 16
- Tests : 6 backend (anonymize_client × 3, overrides, locator, pipeline, detect-pii route, labels route, proofread overrides), frontend (overrides × 5, appState review × 5) — Tasks 1, 2, 3, 4, 5, 6, 7, 8, 9, 10

**Placeholder scan:** no TBD / TODO / "implement later". Every code block is final content; every command is exact.

**Type consistency:**

- `OverrideEntry { text, label, remove? }` defined identically backend (Pydantic, Task 3) and frontend (interface, Task 9).
- `PageDetection` (frontend) and the JSON returned by `/api/detect-pii` (backend, Task 6) share the same field names: `text, label, start_pos, end_pos, confidence, page, bbox`.
- The reducer actions (`UPLOAD_STARTED`, `DETECT_LOADED`, `OVERRIDE_ADD`, `OVERRIDE_REMOVE_DETECTION`, `OVERRIDE_RELABEL`, `REVIEW_SUBMIT`) are consistent between Task 10 (definition) and their consumers (Tasks 11–16).
- `PdfPanel` new signature (`variant`, `items`, `enableTextLayer`, `onTextSelection`) consistent between Task 13 (definition) and consumers (`ResultsState` updated in Task 13 step 4, `ReviewState` in Task 15).
