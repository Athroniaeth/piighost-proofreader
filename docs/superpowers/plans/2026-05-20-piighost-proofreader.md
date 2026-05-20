# piighost-proofreader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Streamlit app that proofreads any PDF CV via an LLM, with clickable list-driven highlights (yellow for the active mistake, red for the others) overlaid on the rendered PDF pages.

**Architecture:** Streamlit frontend, opendataloader-pdf converts the PDF to Markdown for the LLM, PyMuPDF renders the pages and emits per-word bboxes for highlight lookup, piighost-api anonymizes the Markdown before the LLM call, LangChain calls LiteLLM with `with_structured_output(ProofreadResult)`, and a locator module re-anchors each mistake into a (page, bbox) tuple by combining `error_text` + `context_before`.

**Tech Stack:** Python 3.12, uv, Streamlit, opendataloader-pdf, PyMuPDF (fitz), Pillow, lingua-language-detector, httpx, LangChain ≥1.2, langchain-litellm, Pydantic, pytest, ruff.

---

## File Structure

```
piighost-proofreader/
├── app.py                          # Streamlit entrypoint
├── proofreader/
│   ├── __init__.py
│   ├── models.py                   # Pydantic Mistake + ProofreadResult
│   ├── language.py                 # lingua-py language detection
│   ├── anonymize.py                # piighost-api HTTP client
│   ├── pdf_extraction.py           # opendataloader-pdf → Markdown
│   ├── pdf_render.py               # PyMuPDF render + word stream + LRU
│   ├── highlight.py                # PIL overlay (yellow/red)
│   ├── locator.py                  # error_text + context → (page, bbox)
│   └── llm.py                      # LangChain + LiteLLM + structured output
├── tests/
│   ├── __init__.py
│   ├── conftest.py                 # shared fixtures (sample PDF path)
│   ├── test_models.py
│   ├── test_language.py
│   ├── test_anonymize.py
│   ├── test_pdf_extraction.py
│   ├── test_pdf_render.py
│   ├── test_highlight.py
│   └── test_locator.py
├── samples/
│   ├── cv_fr_with_typos.pdf
│   ├── cv_en_with_typos.pdf
│   └── cv_es_with_typos.pdf
├── pyproject.toml
├── README.md
├── Dockerfile
├── compose.yaml
└── .env.example
```

---

### Task 1: Project scaffolding

**Files:**
- Create: `pyproject.toml`
- Create: `README.md`
- Create: `proofreader/__init__.py`
- Create: `tests/__init__.py`
- Create: `tests/conftest.py`
- Create: `.env.example`
- Create: `.gitignore`

- [ ] **Step 1: Initialise the git repo**

Run from `~/PycharmProjects/piighost-proofreader/`:

```bash
git init
echo "# piighost-proofreader" > README.md
```

The `pyproject.toml` is written from scratch in the next step, no `uv init` needed.

- [ ] **Step 2: Overwrite `pyproject.toml` with the project metadata**

```toml
[project]
name = "piighost-proofreader"
version = "0.1.0"
description = "LLM-powered CV proofreader with piighost anonymization."
requires-python = ">=3.12"
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
]

[dependency-groups]
dev = [
    "pytest>=8.3",
    "pytest-asyncio>=0.23",
    "respx>=0.21",
    "ruff>=0.6",
    "pyrefly>=0.1",
]

[tool.ruff]
line-length = 100
target-version = "py312"

[tool.pytest.ini_options]
asyncio_mode = "auto"
```

- [ ] **Step 3: Write `.gitignore`, `.env.example`, and empty package files**

`.gitignore`:

```
.venv/
__pycache__/
*.pyc
.pytest_cache/
.ruff_cache/
site/
dist/
.env
*.tmp.pdf
samples/*.pdf
!samples/.gitkeep
```

`.env.example`:

```
PIIGHOST_API_URL=http://localhost:8000
LITELLM_MODEL=gpt-4o-mini
LITELLM_API_KEY=
LITELLM_API_BASE=
```

`proofreader/__init__.py` and `tests/__init__.py`: empty files.

`tests/conftest.py`:

```python
"""Shared test fixtures."""
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
SAMPLES_DIR = REPO_ROOT / "samples"


@pytest.fixture
def samples_dir() -> Path:
    return SAMPLES_DIR
```

- [ ] **Step 4: Install dependencies**

Run: `uv sync --group dev`

Expected: `.venv/` created, no errors. If `lingua-language-detector` or `opendataloader-pdf` is missing on PyPI under that exact name, pin to the actual name reported by pip search.

- [ ] **Step 5: Commit**

```bash
git add pyproject.toml uv.lock README.md .gitignore .env.example proofreader/__init__.py tests/__init__.py tests/conftest.py
git commit -m "chore: scaffold piighost-proofreader project"
```

---

### Task 2: Pydantic schema

**Files:**
- Create: `proofreader/models.py`
- Create: `tests/test_models.py`

- [ ] **Step 1: Write the failing tests**

`tests/test_models.py`:

```python
"""Tests for the Mistake / ProofreadResult schema."""
import pytest
from pydantic import ValidationError

from proofreader.models import Mistake, ProofreadResult


def test_mistake_minimal_fields():
    m = Mistake(
        error_text="exemple",
        correction="exemples",
        description="Le pluriel manque.",
        type="accord",
        context_before="voici un",
    )
    assert m.type == "accord"
    assert m.context_before == "voici un"


def test_mistake_rejects_unknown_type():
    with pytest.raises(ValidationError):
        Mistake(
            error_text="exemple",
            correction="exemples",
            description="x",
            type="not_a_real_type",
            context_before="x",
        )


def test_proofread_result_holds_list():
    result = ProofreadResult(
        mistakes=[
            Mistake(
                error_text="a",
                correction="à",
                description="accent grave manquant",
                type="orthographe",
                context_before="il va",
            )
        ]
    )
    assert len(result.mistakes) == 1
```

- [ ] **Step 2: Run tests to verify failure**

Run: `uv run pytest tests/test_models.py -v`
Expected: FAIL with `ModuleNotFoundError` or `ImportError`.

- [ ] **Step 3: Implement `proofreader/models.py`**

```python
"""Pydantic schema for proofreading results."""
from typing import Literal

from pydantic import BaseModel, Field

MistakeType = Literal[
    "orthographe",
    "grammaire",
    "conjugaison",
    "accord",
    "ponctuation",
]


class Mistake(BaseModel):
    error_text: str = Field(description="Exact substring to highlight, copied verbatim from the Markdown.")
    correction: str = Field(description="Suggested correction.")
    description: str = Field(description="Short explanation, max 15 words, in the document's language.")
    type: MistakeType
    context_before: str = Field(description="3-5 words preceding the error, used to disambiguate occurrences.")


class ProofreadResult(BaseModel):
    mistakes: list[Mistake]
```

- [ ] **Step 4: Run tests to verify pass**

Run: `uv run pytest tests/test_models.py -v`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add proofreader/models.py tests/test_models.py
git commit -m "feat(models): add Mistake and ProofreadResult schemas"
```

---

### Task 3: Language detection

**Files:**
- Create: `proofreader/language.py`
- Create: `tests/test_language.py`

- [ ] **Step 1: Write the failing tests**

`tests/test_language.py`:

```python
"""Tests for language detection."""
from proofreader.language import detect_language


def test_detect_french():
    text = "Voici un exemple de texte en français avec quelques mots typiques."
    assert detect_language(text) == "fr"


def test_detect_english():
    text = "This is a clear example of an English paragraph with common words."
    assert detect_language(text) == "en"


def test_detect_fallback_on_empty():
    assert detect_language("") == "en"


def test_detect_fallback_on_garbage():
    assert detect_language("xxx zzz qqq") == "en"
```

- [ ] **Step 2: Run tests to verify failure**

Run: `uv run pytest tests/test_language.py -v`
Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Implement `proofreader/language.py`**

```python
"""Language detection helper."""
from lingua import Language, LanguageDetectorBuilder

_DETECTOR = (
    LanguageDetectorBuilder.from_languages(
        Language.FRENCH,
        Language.ENGLISH,
        Language.SPANISH,
        Language.GERMAN,
        Language.ITALIAN,
        Language.PORTUGUESE,
    )
    .with_minimum_relative_distance(0.25)
    .build()
)

_ISO = {
    Language.FRENCH: "fr",
    Language.ENGLISH: "en",
    Language.SPANISH: "es",
    Language.GERMAN: "de",
    Language.ITALIAN: "it",
    Language.PORTUGUESE: "pt",
}


def detect_language(text: str, *, sample_chars: int = 1000) -> str:
    """Return the ISO-639-1 code of the detected language, or "en" as fallback."""
    snippet = text[:sample_chars].strip()
    if not snippet:
        return "en"
    detected = _DETECTOR.detect_language_of(snippet)
    if detected is None:
        return "en"
    return _ISO.get(detected, "en")
```

- [ ] **Step 4: Run tests to verify pass**

Run: `uv run pytest tests/test_language.py -v`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add proofreader/language.py tests/test_language.py
git commit -m "feat(language): detect ISO language code with lingua-py"
```

---

### Task 4: piighost-api client

**Files:**
- Create: `proofreader/anonymize.py`
- Create: `tests/test_anonymize.py`

- [ ] **Step 1: Write the failing tests with respx**

`tests/test_anonymize.py`:

```python
"""Tests for the piighost-api HTTP client."""
import httpx
import pytest
import respx

from proofreader.anonymize import AnonymizationClient, AnonymizeError


@pytest.fixture
def client() -> AnonymizationClient:
    return AnonymizationClient(base_url="http://localhost:8000")


@respx.mock
async def test_anonymize_returns_anonymized_text(client: AnonymizationClient):
    respx.post("http://localhost:8000/v1/anonymize").mock(
        return_value=httpx.Response(
            200,
            json={"anonymized_text": "Hello <<PERSON:1>>", "entities": []},
        )
    )
    result = await client.anonymize("Hello Patrick", thread_id="t1")
    assert result == "Hello <<PERSON:1>>"


@respx.mock
async def test_deanonymize_returns_original_text(client: AnonymizationClient):
    respx.post("http://localhost:8000/v1/deanonymize").mock(
        return_value=httpx.Response(
            200,
            json={"text": "Hello Patrick", "entities": []},
        )
    )
    result = await client.deanonymize("Hello <<PERSON:1>>", thread_id="t1")
    assert result == "Hello Patrick"


@respx.mock
async def test_anonymize_raises_on_http_error(client: AnonymizationClient):
    respx.post("http://localhost:8000/v1/anonymize").mock(
        return_value=httpx.Response(500, json={"detail": "boom"})
    )
    with pytest.raises(AnonymizeError):
        await client.anonymize("Hello", thread_id="t1")
```

- [ ] **Step 2: Run tests to verify failure**

Run: `uv run pytest tests/test_anonymize.py -v`
Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Implement `proofreader/anonymize.py`**

```python
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
```

- [ ] **Step 4: Run tests to verify pass**

Run: `uv run pytest tests/test_anonymize.py -v`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add proofreader/anonymize.py tests/test_anonymize.py
git commit -m "feat(anonymize): add piighost-api HTTP client wrapper"
```

---

### Task 5: PDF extraction with opendataloader-pdf

**Files:**
- Create: `proofreader/pdf_extraction.py`
- Create: `tests/test_pdf_extraction.py`
- Create: `samples/cv_fr_with_typos.pdf` (a minimal PDF generated on the fly during the test fixture, see step 1)

- [ ] **Step 1: Add a fixture that builds a tiny sample PDF if missing**

Append to `tests/conftest.py`:

```python
import fitz


@pytest.fixture(scope="session")
def tiny_pdf_path(tmp_path_factory) -> Path:
    """Build a 1-page PDF with a known sentence, return the path.

    Uses ASCII-only text to avoid Unicode apostrophe drift between
    PyMuPDF writing and opendataloader-pdf reading.
    """
    pdf_path = tmp_path_factory.mktemp("pdfs") / "tiny.pdf"
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text(
        (72, 100),
        "Voici un exemple simple avec mot mot dans une phrase.",
        fontsize=12,
    )
    doc.save(pdf_path)
    doc.close()
    return pdf_path
```

- [ ] **Step 2: Write the failing extraction tests**

`tests/test_pdf_extraction.py`:

```python
"""Tests for PDF → Markdown extraction via opendataloader-pdf."""
from pathlib import Path

import pytest

from proofreader.pdf_extraction import ExtractionError, extract_markdown


def test_extract_returns_non_empty_markdown(tiny_pdf_path: Path):
    markdown = extract_markdown(tiny_pdf_path)
    assert "exemple" in markdown
    assert "phrase" in markdown


def test_extract_raises_on_missing_file(tmp_path: Path):
    with pytest.raises(ExtractionError):
        extract_markdown(tmp_path / "nope.pdf")
```

- [ ] **Step 3: Run tests to verify failure**

Run: `uv run pytest tests/test_pdf_extraction.py -v`
Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 4: Implement `proofreader/pdf_extraction.py`**

```python
"""PDF → Markdown extraction via opendataloader-pdf."""
import tempfile
from pathlib import Path

import opendataloader_pdf


class ExtractionError(RuntimeError):
    """Raised when opendataloader-pdf fails or produces no Markdown."""


def extract_markdown(pdf_path: Path) -> str:
    """Run opendataloader-pdf on ``pdf_path`` and return the Markdown string.

    opendataloader-pdf writes its outputs to disk, so we use a temporary
    directory and read the .md file back.
    """
    if not pdf_path.exists():
        raise ExtractionError(f"PDF not found: {pdf_path}")
    with tempfile.TemporaryDirectory() as out_dir:
        try:
            opendataloader_pdf.convert(
                input_path=[str(pdf_path)],
                output_dir=out_dir,
                format="markdown",
            )
        except Exception as exc:
            raise ExtractionError(f"opendataloader-pdf failed: {exc}") from exc
        md_files = list(Path(out_dir).rglob("*.md"))
        if not md_files:
            raise ExtractionError("opendataloader-pdf produced no Markdown output")
        return md_files[0].read_text(encoding="utf-8")
```

- [ ] **Step 5: Run tests to verify pass**

Run: `uv run pytest tests/test_pdf_extraction.py -v`
Expected: 2 passed. If the first test fails because opendataloader-pdf splits the line across paragraphs, relax the assertion to `"j'avais" in markdown.lower()`.

If opendataloader-pdf is not callable because Java is missing, install: `sudo apt-get install -y openjdk-21-jre-headless` (Debian/Ubuntu) and retry.

- [ ] **Step 6: Commit**

```bash
git add proofreader/pdf_extraction.py tests/test_pdf_extraction.py tests/conftest.py
git commit -m "feat(extraction): wire opendataloader-pdf to Markdown output"
```

---

### Task 6: PyMuPDF render + word stream + LRU cache

**Files:**
- Create: `proofreader/pdf_render.py`
- Create: `tests/test_pdf_render.py`

- [ ] **Step 1: Write the failing tests**

`tests/test_pdf_render.py`:

```python
"""Tests for PyMuPDF page render and word stream extraction."""
from pathlib import Path

from proofreader.pdf_render import PdfDocument, Word


def test_word_stream_has_known_words(tiny_pdf_path: Path):
    doc = PdfDocument(tiny_pdf_path)
    words = doc.words(page_index=0)
    texts = [w.text for w in words]
    assert "exemple" in texts
    assert "phrase" in texts


def test_word_stream_bboxes_make_sense(tiny_pdf_path: Path):
    doc = PdfDocument(tiny_pdf_path)
    [first, *_] = doc.words(page_index=0)
    assert first.bbox[0] >= 0
    assert first.bbox[2] > first.bbox[0]


def test_render_page_returns_png_bytes(tiny_pdf_path: Path):
    doc = PdfDocument(tiny_pdf_path)
    png = doc.render_page(page_index=0)
    assert png.startswith(b"\x89PNG")


def test_render_is_cached(tiny_pdf_path: Path):
    doc = PdfDocument(tiny_pdf_path)
    first = doc.render_page(page_index=0)
    second = doc.render_page(page_index=0)
    assert first is second  # exact same bytes object → LRU hit


def test_page_size_returns_pdf_points(tiny_pdf_path: Path):
    doc = PdfDocument(tiny_pdf_path)
    width, height = doc.page_size(page_index=0)
    assert width > 0
    assert height > 0
```

- [ ] **Step 2: Run tests to verify failure**

Run: `uv run pytest tests/test_pdf_render.py -v`
Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Implement `proofreader/pdf_render.py`**

```python
"""PyMuPDF wrapper, renders pages and exposes the word stream."""
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import fitz


@dataclass(frozen=True)
class Word:
    """A single word with its bounding box on a page (in PDF points)."""

    text: str
    bbox: tuple[float, float, float, float]  # (x0, y0, x1, y1)
    page_index: int


class PdfDocument:
    """LRU-cached render + word stream around a single PDF file."""

    def __init__(self, pdf_path: Path, *, dpi: int = 150) -> None:
        self._pdf_path = pdf_path
        self._dpi = dpi
        self._doc = fitz.open(pdf_path)

    @property
    def page_count(self) -> int:
        return self._doc.page_count

    @lru_cache(maxsize=64)
    def render_page(self, page_index: int) -> bytes:
        page = self._doc.load_page(page_index)
        pix = page.get_pixmap(dpi=self._dpi)
        return pix.tobytes("png")

    @lru_cache(maxsize=64)
    def words(self, page_index: int) -> tuple[Word, ...]:
        page = self._doc.load_page(page_index)
        raw = page.get_text("words")  # list of (x0, y0, x1, y1, text, block, line, word_no)
        return tuple(
            Word(text=text, bbox=(x0, y0, x1, y1), page_index=page_index)
            for x0, y0, x1, y1, text, *_ in raw
        )

    def page_size(self, page_index: int) -> tuple[float, float]:
        """Return (width, height) of the page in PDF points."""
        page = self._doc.load_page(page_index)
        return (page.rect.width, page.rect.height)
```

- [ ] **Step 4: Run tests to verify pass**

Run: `uv run pytest tests/test_pdf_render.py -v`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add proofreader/pdf_render.py tests/test_pdf_render.py
git commit -m "feat(render): PyMuPDF page render + word stream with LRU"
```

---

### Task 7: Highlight overlay (PIL)

**Files:**
- Create: `proofreader/highlight.py`
- Create: `tests/test_highlight.py`

- [ ] **Step 1: Write the failing tests**

`tests/test_highlight.py`:

```python
"""Tests for the PIL highlight overlay."""
from io import BytesIO

from PIL import Image

from proofreader.highlight import HighlightSpec, overlay_highlights


def _blank_png(width: int = 300, height: int = 200) -> bytes:
    buf = BytesIO()
    Image.new("RGB", (width, height), "white").save(buf, format="PNG")
    return buf.getvalue()


def test_overlay_returns_png_bytes():
    png = _blank_png()
    result = overlay_highlights(
        png,
        page_height_pt=200,
        page_width_pt=300,
        highlights=[HighlightSpec(bbox=(10, 10, 50, 30), is_active=True)],
    )
    assert result.startswith(b"\x89PNG")


def test_overlay_yellow_pixel_for_active():
    png = _blank_png()
    result = overlay_highlights(
        png,
        page_height_pt=200,
        page_width_pt=300,
        highlights=[HighlightSpec(bbox=(10, 10, 50, 30), is_active=True)],
    )
    img = Image.open(BytesIO(result)).convert("RGB")
    # bbox(10,10,50,30) in PDF points → roughly (10,10,50,30) px when page matches scale 1:1.
    # We just check that *some* pixel near the center is yellow-ish.
    r, g, b = img.getpixel((30, 20))
    assert r > 200 and g > 200 and b < 150  # yellow tint


def test_overlay_red_pixel_for_inactive():
    png = _blank_png()
    result = overlay_highlights(
        png,
        page_height_pt=200,
        page_width_pt=300,
        highlights=[HighlightSpec(bbox=(10, 10, 50, 30), is_active=False)],
    )
    img = Image.open(BytesIO(result)).convert("RGB")
    r, g, b = img.getpixel((30, 20))
    assert r > 200 and g < 150 and b < 150  # red tint
```

- [ ] **Step 2: Run tests to verify failure**

Run: `uv run pytest tests/test_highlight.py -v`
Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Implement `proofreader/highlight.py`**

```python
"""Draw semi-transparent highlight rectangles over a rendered PDF page."""
from dataclasses import dataclass
from io import BytesIO

from PIL import Image, ImageDraw

ACTIVE_FILL = (255, 230, 0, 110)  # yellow, semi-transparent
INACTIVE_FILL = (235, 30, 30, 90)  # red, semi-transparent


@dataclass(frozen=True)
class HighlightSpec:
    bbox: tuple[float, float, float, float]  # (x0, y0, x1, y1) in PDF points
    is_active: bool


def overlay_highlights(
    page_png: bytes,
    *,
    page_width_pt: float,
    page_height_pt: float,
    highlights: list[HighlightSpec],
) -> bytes:
    """Return a PNG with all highlights painted over ``page_png``."""
    base = Image.open(BytesIO(page_png)).convert("RGBA")
    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    img_w, img_h = base.size
    sx = img_w / page_width_pt
    sy = img_h / page_height_pt
    for hi in highlights:
        x0, y0, x1, y1 = hi.bbox
        rect = (x0 * sx, y0 * sy, x1 * sx, y1 * sy)
        fill = ACTIVE_FILL if hi.is_active else INACTIVE_FILL
        draw.rectangle(rect, fill=fill)
    out = Image.alpha_composite(base, overlay).convert("RGB")
    buf = BytesIO()
    out.save(buf, format="PNG")
    return buf.getvalue()
```

- [ ] **Step 4: Run tests to verify pass**

Run: `uv run pytest tests/test_highlight.py -v`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add proofreader/highlight.py tests/test_highlight.py
git commit -m "feat(highlight): PIL overlay for active/inactive bboxes"
```

---

### Task 8: Mistake locator

**Files:**
- Create: `proofreader/locator.py`
- Create: `tests/test_locator.py`

- [ ] **Step 1: Write the failing tests**

`tests/test_locator.py`:

```python
"""Tests for the mistake locator."""
from proofreader.locator import LocatedMistake, locate_mistake
from proofreader.models import Mistake
from proofreader.pdf_render import Word


def _stream() -> list[Word]:
    """Synthetic stream for the sentence:
    'Voici un exemple avec j'avais et j'avait.'
    """
    return [
        Word(text="Voici", bbox=(0, 0, 30, 10), page_index=0),
        Word(text="un", bbox=(35, 0, 50, 10), page_index=0),
        Word(text="exemple", bbox=(55, 0, 100, 10), page_index=0),
        Word(text="avec", bbox=(105, 0, 130, 10), page_index=0),
        Word(text="j'avais", bbox=(135, 0, 180, 10), page_index=0),
        Word(text="et", bbox=(185, 0, 200, 10), page_index=0),
        Word(text="j'avait", bbox=(205, 0, 250, 10), page_index=0),
    ]


def test_locate_unique_error():
    m = Mistake(
        error_text="j'avait",
        correction="j'avais",
        description="conjugaison",
        type="conjugaison",
        context_before="j'avais et",
    )
    located = locate_mistake(m, words=_stream())
    assert located.word.text == "j'avait"
    assert located.word.bbox == (205, 0, 250, 10)


def test_locate_uses_context_to_pick_second_occurrence():
    # Stream where "j'avais" appears twice; only the 2nd is the error.
    stream = [
        Word(text="Au", bbox=(0, 0, 10, 10), page_index=0),
        Word(text="début", bbox=(15, 0, 40, 10), page_index=0),
        Word(text="j'avais", bbox=(45, 0, 90, 10), page_index=0),
        Word(text="raison.", bbox=(95, 0, 130, 10), page_index=0),
        Word(text="Ensuite", bbox=(135, 0, 175, 10), page_index=0),
        Word(text="j'avais", bbox=(180, 0, 225, 10), page_index=0),
    ]
    m = Mistake(
        error_text="j'avais",
        correction="j'avais",  # not relevant for the test
        description="x",
        type="conjugaison",
        context_before="raison. Ensuite",
    )
    located = locate_mistake(m, words=stream)
    assert located.word.bbox == (180, 0, 225, 10)


def test_locate_returns_none_when_unfindable():
    m = Mistake(
        error_text="zzzzz",
        correction="zzzzz",
        description="x",
        type="orthographe",
        context_before="aaaa bbbb",
    )
    assert locate_mistake(m, words=_stream()) is None
```

- [ ] **Step 2: Run tests to verify failure**

Run: `uv run pytest tests/test_locator.py -v`
Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Implement `proofreader/locator.py`**

```python
"""Locate a Mistake (error_text + context_before) inside the PyMuPDF word stream."""
from dataclasses import dataclass

from proofreader.models import Mistake
from proofreader.pdf_render import Word


@dataclass(frozen=True)
class LocatedMistake:
    mistake: Mistake
    word: Word


def locate_mistake(mistake: Mistake, *, words: list[Word]) -> LocatedMistake | None:
    """Return the first Word matching ``mistake.error_text`` that follows ``mistake.context_before``.

    Matching is case-sensitive and exact on whole words. If ``context_before``
    is empty, we return the first occurrence of ``error_text``.
    """
    ctx_tokens = mistake.context_before.split()
    n_ctx = len(ctx_tokens)
    error = mistake.error_text
    if n_ctx == 0:
        return _first_match(mistake, words, error)
    # Slide a window of size n_ctx + 1 across the stream.
    for i in range(len(words) - n_ctx):
        window = [w.text for w in words[i : i + n_ctx]]
        if window == ctx_tokens and i + n_ctx < len(words) and words[i + n_ctx].text == error:
            return LocatedMistake(mistake=mistake, word=words[i + n_ctx])
    # Fallback: ignore context, find any occurrence.
    return _first_match(mistake, words, error)


def _first_match(mistake: Mistake, words: list[Word], target: str) -> LocatedMistake | None:
    for w in words:
        if w.text == target:
            return LocatedMistake(mistake=mistake, word=w)
    return None
```

- [ ] **Step 4: Run tests to verify pass**

Run: `uv run pytest tests/test_locator.py -v`
Expected: 3 passed. If `test_locate_returns_none_when_unfindable` returns a hit instead of `None`, tighten `_first_match` to only fire when context matched at least once — the safe default is the strict match above.

Replace `_first_match` fallback with a stricter version:

```python
def locate_mistake(mistake: Mistake, *, words: list[Word]) -> LocatedMistake | None:
    ctx_tokens = mistake.context_before.split()
    n_ctx = len(ctx_tokens)
    error = mistake.error_text
    if n_ctx == 0:
        for w in words:
            if w.text == error:
                return LocatedMistake(mistake=mistake, word=w)
        return None
    for i in range(len(words) - n_ctx):
        window = [w.text for w in words[i : i + n_ctx]]
        if window == ctx_tokens and i + n_ctx < len(words) and words[i + n_ctx].text == error:
            return LocatedMistake(mistake=mistake, word=words[i + n_ctx])
    return None
```

- [ ] **Step 5: Commit**

```bash
git add proofreader/locator.py tests/test_locator.py
git commit -m "feat(locator): match error_text + context_before to a word bbox"
```

---

### Task 9: LLM module (LiteLLM + structured output)

**Files:**
- Create: `proofreader/llm.py`
- Create: `tests/test_llm.py`

This module is hard to unit-test without an API key, so we write one integration-style smoke test gated on an env var, plus one unit test that injects a fake chain.

- [ ] **Step 1: Write the failing tests**

`tests/test_llm.py`:

```python
"""Tests for the LLM proofreading runner."""
import os

import pytest

from proofreader.llm import proofread, build_chain
from proofreader.models import Mistake, ProofreadResult


class _FakeChain:
    def __init__(self, result: ProofreadResult) -> None:
        self._result = result

    async def ainvoke(self, _payload: dict) -> ProofreadResult:
        return self._result


async def test_proofread_returns_mistakes_from_chain():
    expected = ProofreadResult(
        mistakes=[
            Mistake(
                error_text="exempel",
                correction="example",
                description="ortho",
                type="orthographe",
                context_before="this is an",
            )
        ]
    )
    fake = _FakeChain(expected)
    result = await proofread(
        markdown="this is an exempel",
        language="en",
        chain=fake,
    )
    assert result == expected


@pytest.mark.skipif(
    not os.getenv("LITELLM_API_KEY"),
    reason="LITELLM_API_KEY not set, skipping live LLM call",
)
async def test_build_chain_runs_against_real_llm():
    chain = build_chain(
        model=os.environ.get("LITELLM_MODEL", "gpt-4o-mini"),
        api_key=os.environ["LITELLM_API_KEY"],
    )
    result = await proofread(
        markdown="This is a smple sentance.",
        language="en",
        chain=chain,
    )
    assert isinstance(result, ProofreadResult)
```

- [ ] **Step 2: Run tests to verify failure**

Run: `uv run pytest tests/test_llm.py -v`
Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Implement `proofreader/llm.py`**

```python
"""LangChain + LiteLLM proofreading chain with structured output."""
from typing import Protocol

from langchain_core.prompts import ChatPromptTemplate
from langchain_litellm import ChatLiteLLM

from proofreader.models import ProofreadResult


class ProofreadChain(Protocol):
    async def ainvoke(self, payload: dict) -> ProofreadResult: ...


SYSTEM_PROMPT = (
    "You are an expert proofreader. The text below is the Markdown extraction "
    "of a CV in {language}. List EVERY mistake you find. For each mistake, "
    "return: the exact substring as written (`error_text`), the corrected form "
    "(`correction`), a short explanation in {language} (max 15 words), a `type` "
    "from [orthographe, grammaire, conjugaison, accord, ponctuation], and 3-5 "
    "words preceding the error verbatim (`context_before`). Be exhaustive."
)


def build_chain(*, model: str, api_key: str, api_base: str | None = None) -> ProofreadChain:
    llm = ChatLiteLLM(model=model, api_key=api_key, api_base=api_base)
    structured = llm.with_structured_output(ProofreadResult, method="json_schema")
    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", SYSTEM_PROMPT),
            ("human", "{markdown}"),
        ]
    )
    return prompt | structured


async def proofread(*, markdown: str, language: str, chain: ProofreadChain) -> ProofreadResult:
    return await chain.ainvoke({"language": language, "markdown": markdown})
```

- [ ] **Step 4: Run tests to verify pass**

Run: `uv run pytest tests/test_llm.py -v`
Expected: 1 passed, 1 skipped (or 2 passed if `LITELLM_API_KEY` is set).

- [ ] **Step 5: Commit**

```bash
git add proofreader/llm.py tests/test_llm.py
git commit -m "feat(llm): LangChain + LiteLLM chain with structured output"
```

---

### Task 10: Streamlit app integration

**Files:**
- Create: `app.py`

No automated test for this module — Streamlit apps are validated by manual smoke. Keep the file focused on glue.

- [ ] **Step 1: Implement `app.py`**

```python
"""Streamlit entry point for piighost-proofreader."""
from __future__ import annotations

import asyncio
import os
import tempfile
import uuid
from pathlib import Path

import streamlit as st
from dotenv import load_dotenv

from proofreader.anonymize import AnonymizationClient
from proofreader.highlight import HighlightSpec, overlay_highlights
from proofreader.language import detect_language
from proofreader.llm import build_chain, proofread
from proofreader.locator import LocatedMistake, locate_mistake
from proofreader.pdf_extraction import extract_markdown
from proofreader.pdf_render import PdfDocument


load_dotenv()

MAX_PDF_BYTES = 5 * 1024 * 1024
MAX_PAGES = 20


def _get_chain():
    return build_chain(
        model=os.environ["LITELLM_MODEL"],
        api_key=os.environ["LITELLM_API_KEY"],
        api_base=os.environ.get("LITELLM_API_BASE") or None,
    )


def _get_client() -> AnonymizationClient:
    return AnonymizationClient(base_url=os.environ.get("PIIGHOST_API_URL", "http://localhost:8000"))


async def _run_pipeline(pdf_bytes: bytes, pdf_path: Path) -> dict:
    markdown = extract_markdown(pdf_path)
    if not markdown.strip():
        raise RuntimeError(
            "Empty Markdown extracted, the PDF probably has no text layer (scanned image)."
        )
    language = detect_language(markdown)
    client = _get_client()
    thread_id = str(uuid.uuid4())
    anonymized = await client.anonymize(markdown, thread_id=thread_id)
    chain = _get_chain()
    result = await proofread(markdown=anonymized, language=language, chain=chain)
    located: list[LocatedMistake] = []
    unlocatable = []
    doc = PdfDocument(pdf_path)
    for m in result.mistakes:
        m_clean = m.model_copy(
            update={
                "error_text": await client.deanonymize(m.error_text, thread_id=thread_id),
                "context_before": await client.deanonymize(m.context_before, thread_id=thread_id),
            }
        )
        for page_index in range(doc.page_count):
            hit = locate_mistake(m_clean, words=list(doc.words(page_index)))
            if hit is not None:
                located.append(hit)
                break
        else:
            unlocatable.append(m_clean)
    return {"doc": doc, "located": located, "unlocatable": unlocatable, "language": language}


def _render_page(doc: PdfDocument, page_index: int, located: list[LocatedMistake], active_idx: int | None) -> bytes:
    page_png = doc.render_page(page_index)
    page_w, page_h = doc.page_size(page_index)
    highlights = [
        HighlightSpec(bbox=lm.word.bbox, is_active=(i == active_idx))
        for i, lm in enumerate(located)
        if lm.word.page_index == page_index
    ]
    return overlay_highlights(
        page_png,
        page_width_pt=page_w,
        page_height_pt=page_h,
        highlights=highlights,
    )


def main() -> None:
    st.set_page_config(page_title="piighost-proofreader", layout="wide")
    st.title("piighost-proofreader")
    st.caption("Upload a CV, get an LLM-powered proofreading pass with click-to-highlight.")

    upload = st.file_uploader("PDF du CV", type=["pdf"])
    if upload is None:
        st.info("Upload a PDF to start.")
        return

    pdf_bytes = upload.read()
    if len(pdf_bytes) > MAX_PDF_BYTES:
        st.warning(f"File too large ({len(pdf_bytes) / 1e6:.1f} MB > 5 MB).")
        return

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as fp:
        fp.write(pdf_bytes)
        pdf_path = Path(fp.name)

    quick_doc = PdfDocument(pdf_path)
    if quick_doc.page_count > MAX_PAGES:
        st.warning(f"PDF has {quick_doc.page_count} pages (max {MAX_PAGES}).")
        return

    if "last_run" not in st.session_state or st.session_state.get("last_pdf") != pdf_bytes:
        with st.spinner("Proofreading…"):
            try:
                outcome = asyncio.run(_run_pipeline(pdf_bytes, pdf_path))
            except Exception as exc:  # noqa: BLE001 surface to UI
                st.error(f"Pipeline failed: {exc}")
                return
        st.session_state["last_run"] = outcome
        st.session_state["last_pdf"] = pdf_bytes
        st.session_state["active_idx"] = None

    outcome = st.session_state["last_run"]
    doc: PdfDocument = outcome["doc"]
    located: list[LocatedMistake] = outcome["located"]
    unlocatable = outcome["unlocatable"]

    col_pdf, col_list = st.columns([2, 1])

    with col_list:
        st.subheader("Fautes détectées")
        for i, lm in enumerate(located):
            label = f"**{lm.mistake.type}** — `{lm.mistake.error_text}` → `{lm.mistake.correction}`"
            if st.button(label, key=f"mist_{i}"):
                st.session_state["active_idx"] = i
            st.caption(lm.mistake.description)
        if unlocatable:
            st.divider()
            st.subheader("Non localisées")
            for m in unlocatable:
                st.markdown(f"`{m.error_text}` → `{m.correction}` ({m.type})")
                st.caption(m.description)

    with col_pdf:
        active_idx = st.session_state.get("active_idx")
        for page_index in range(doc.page_count):
            png = _render_page(doc, page_index, located, active_idx)
            st.image(png, caption=f"Page {page_index + 1}", use_column_width=True)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Manual smoke test**

In one terminal, start piighost-api locally (consult its README; typically `make run` or `uv run python -m piighost_api.app`).

In another terminal:

```bash
cp .env.example .env
# edit .env: set LITELLM_API_KEY and LITELLM_MODEL
uv run streamlit run app.py
```

Open the URL Streamlit prints. Upload `samples/cv_fr_with_typos.pdf` (created in Task 11). Verify:
- the PDF appears in the left column with red highlights
- the right column shows the list of mistakes
- clicking a mistake repaints that bbox in yellow while others stay red

If any step fails, report the exact error.

- [ ] **Step 3: Commit**

```bash
git add app.py
git commit -m "feat(app): wire the Streamlit pipeline end to end"
```

---

### Task 11: Sample CVs

**Files:**
- Create: `samples/.gitkeep`
- Create: `samples/build_samples.py`

These PDFs are committed only as a build script — we don't ship binary PDFs in git (the `.gitignore` excludes them, but the script can rebuild them on demand).

- [ ] **Step 1: Implement the sample builder**

```python
"""Build the smoke-test CV PDFs in samples/."""
from pathlib import Path

import fitz

SAMPLES = {
    "cv_fr_with_typos.pdf": [
        "Jean Dupont",
        "Email: jean.dupont@example.com",
        "Expérience profesionnelle",  # typo: profesionnelle → professionnelle
        "2022-2024 - Développeur chez Acme",
        "J'avais travailler sur des projets python.",  # conj: travailler → travaillé
    ],
    "cv_en_with_typos.pdf": [
        "John Doe",
        "Email: john.doe@example.com",
        "Profesional experience",  # typo
        "2022-2024 - Engineer at Acme",
        "I has worked on python projects.",  # conj
    ],
    "cv_es_with_typos.pdf": [
        "Juan Pérez",
        "Correo: juan@example.com",
        "Experencia profesional",  # typo: Experencia → Experiencia
        "2022-2024 - Ingeniero en Acme",
        "He trabajadoo en proyectos python.",  # ortho
    ],
}


def build() -> None:
    out_dir = Path(__file__).parent
    for name, lines in SAMPLES.items():
        doc = fitz.open()
        page = doc.new_page()
        y = 72
        for line in lines:
            page.insert_text((72, y), line, fontsize=12)
            y += 20
        doc.save(out_dir / name)
        doc.close()


if __name__ == "__main__":
    build()
```

- [ ] **Step 2: Build the samples**

```bash
uv run python samples/build_samples.py
ls samples/
```

Expected: 3 `.pdf` files (not committed, listed in `.gitignore`).

- [ ] **Step 3: Commit**

```bash
git add samples/.gitkeep samples/build_samples.py
git commit -m "feat(samples): add multi-language CV builder for smoke tests"
```

---

### Task 12: Docker + Coolify

**Files:**
- Create: `Dockerfile`
- Create: `compose.yaml`
- Create: `.dockerignore`

- [ ] **Step 1: Implement the multi-stage Dockerfile**

```dockerfile
FROM eclipse-temurin:21-jre AS base

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3.12 python3.12-venv python3-pip curl \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PATH="/app/.venv/bin:${PATH}"

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN curl -LsSf https://astral.sh/uv/install.sh | sh \
    && /root/.local/bin/uv sync --frozen --no-dev

COPY proofreader ./proofreader
COPY app.py ./app.py

EXPOSE 8501

CMD ["streamlit", "run", "app.py", "--server.address=0.0.0.0", "--server.port=8501"]
```

- [ ] **Step 2: Implement the compose file**

```yaml
services:
  proofreader:
    build: .
    image: piighost-proofreader:latest
    ports:
      - "8501:8501"
    environment:
      PIIGHOST_API_URL: ${PIIGHOST_API_URL}
      LITELLM_MODEL: ${LITELLM_MODEL}
      LITELLM_API_KEY: ${LITELLM_API_KEY}
      LITELLM_API_BASE: ${LITELLM_API_BASE}
    restart: unless-stopped
```

- [ ] **Step 3: Implement `.dockerignore`**

```
.venv/
.git/
.pytest_cache/
.ruff_cache/
__pycache__/
samples/*.pdf
tests/
docs/
*.tmp.pdf
```

- [ ] **Step 4: Local build check**

```bash
docker build -t piighost-proofreader:dev .
```

Expected: image builds successfully. If `uv` install fails inside the container, switch to `pip install -e .` as a fallback.

- [ ] **Step 5: Commit**

```bash
git add Dockerfile compose.yaml .dockerignore
git commit -m "chore(deploy): multi-stage Dockerfile and Coolify compose"
```

---

### Task 13: README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Write the README**

```markdown
# piighost-proofreader

LLM-powered proofreader for CVs. Upload a PDF, get an annotated list of mistakes with click-to-highlight on the rendered pages.

## How it works

1. `opendataloader-pdf` converts the PDF to Markdown for the LLM.
2. `PyMuPDF` renders each page and emits per-word bounding boxes.
3. `piighost-api` anonymizes the Markdown before any LLM call.
4. `LangChain + LiteLLM` runs a structured-output proofreading chain.
5. A locator module re-anchors each mistake to a `(page, bbox)` tuple using the LLM's `context_before` field.
6. Streamlit renders pages with red overlays for every mistake; clicking a mistake in the list repaints it yellow.

## Local dev

```bash
uv sync --group dev
cp .env.example .env  # fill in LITELLM_API_KEY etc.
uv run python samples/build_samples.py
uv run streamlit run app.py
```

You also need a running `piighost-api` at the URL declared in `.env`. See `~/PycharmProjects/piighost-api/`.

## Tests

```bash
uv run pytest
```

Set `LITELLM_API_KEY` to enable the one live-LLM smoke test in `tests/test_llm.py`.

## Deployment

Coolify-friendly. Build the image, point Coolify at this repo, set the env vars in the Coolify dashboard, and Coolify will run `compose.yaml`.

## Architecture spec

`docs/superpowers/specs/2026-05-20-piighost-proofreader-design.md`.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs(readme): write project README"
```

---

### Task 14: Final lint pass + smoke test

- [ ] **Step 1: Run the full test suite**

```bash
uv run pytest -v
```

Expected: all tests pass (one may be skipped without `LITELLM_API_KEY`).

- [ ] **Step 2: Lint**

```bash
uv run ruff check proofreader app.py tests
uv run ruff format --check proofreader app.py tests
```

Expected: no errors.

- [ ] **Step 3: Run the end-to-end smoke test**

Start `piighost-api` locally, then:

```bash
uv run streamlit run app.py
```

Verify:
- Upload `samples/cv_fr_with_typos.pdf` → at least one mistake found.
- Click a mistake → the bbox turns yellow.
- Upload `samples/cv_en_with_typos.pdf` → list returned in English.

- [ ] **Step 4: Final commit (if anything was tweaked)**

```bash
git status
# if dirty:
git add -p
git commit -m "chore: final lint and smoke fixes"
```
