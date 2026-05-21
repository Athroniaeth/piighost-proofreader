# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

`piighost-proofreader` is a Streamlit app that runs an LLM proofreading pass on a CV PDF and re-anchors each mistake back to its physical `(page, bbox)` location on the rendered page. The product novelty is the **anonymise → LLM → de-anonymise → relocate** loop: no PII ever reaches the LLM, but final highlights still land on the original text.

Phase 1 of a TailGrids vanilla frontend is planned in `docs/superpowers/plans/2026-05-21-frontend-tailgrids.md` (the Streamlit app at `app.py` is the current UI).

## Common commands

```bash
# Install (uv-managed, Python 3.12+)
uv sync --group dev

# Bootstrap test PDFs (fr/en/es CVs with seeded typos) — required before running tests/manual smoke
uv run python samples/build_samples.py

# Run the Streamlit UI
uv run streamlit run app.py

# Full test suite
uv run pytest

# Single test
uv run pytest tests/test_locator.py::test_locate_strict_match -xvs

# Live LLM smoke test (skipped unless LITELLM_API_KEY set)
LITELLM_API_KEY=… uv run pytest tests/test_llm.py -xvs

# Lint / type-check
uv run ruff check .
uv run pyrefly check

# Container build & run (mirrors Coolify deployment)
docker compose up --build
```

Env vars (see `.env.example`): `PIIGHOST_API_URL`, `LITELLM_MODEL`, `LITELLM_API_KEY`, `LITELLM_API_BASE`. The app **requires** a reachable `piighost-api` (sibling repo at `~/PycharmProjects/piighost-api/`) — without it, anonymisation fails and no LLM call is made.

## Architecture: the pipeline

`app.py::_run_pipeline` is the only place where the modules below are wired together. Read it before editing anything else — every module is single-purpose and the data flow is linear:

```
PDF bytes
  │
  ├─► proofreader.pdf_extraction.extract_markdown   (opendataloader-pdf → .md)
  │     │
  │     └─► proofreader.language.detect_language    (lingua, ISO-639-1, fallback "en")
  │           │
  │           └─► AnonymizationClient.anonymize      (piighost-api, thread_id-scoped)
  │                 │
  │                 └─► proofreader.llm.proofread    (LangChain + ChatLiteLLM, JSON schema)
  │                       │
  │                       └─► for each Mistake:
  │                             ├─► client.deanonymize(error_text / context_before / correction / description)
  │                             └─► locator.locate_mistake(mistake, words=PdfDocument.words(page))
  │
  └─► proofreader.pdf_render.PdfDocument   (PyMuPDF: PNG render + per-word bbox stream)
        │
        └─► proofreader.highlight.overlay_highlights   (PIL semi-transparent rectangles, scaled pt→px)
```

Key invariants:

- **Anonymisation is keyed by `thread_id`** (a UUID per upload). The same `thread_id` must be passed to every anonymize/deanonymize call in one pipeline run, or the entity map will be missing. The Streamlit layer owns this UUID.
- **Two de-anonymise endpoints exist** in piighost-api; `proofreader.anonymize` uses `/v1/deanonymize/entities` because the LLM emits *substrings* of the anonymised text (per-field `error_text`, `context_before`, `correction`, `description`), and the cache-keyed `/v1/deanonymize` would 404 on substrings. Do not "simplify" this.
- **The LLM never sees the raw Markdown.** It also never sees PDF coordinates. It only emits text fields (`error_text`, `correction`, `context_before`, `description`, `type`). Re-anchoring is the locator's job.

## The locator (the load-bearing piece)

`proofreader/locator.py` resolves an LLM-emitted `Mistake` to a `(page_index, bbox)` tuple by matching against the PyMuPDF word stream. It runs **four fallback strategies in order**; do not collapse or reorder them without understanding what each absorbs:

1. **Strict whole-word match** of `context_before` followed by `error_text`.
2. **Punctuation+case+typographic-quote tolerant** version of the same match (`_normalize` casefolds, ASCII-fies `’ ‘ “ ”`, strips surrounding punctuation).
3. **Error-only unique match** — if `error_text` appears exactly once anywhere on the page, return it regardless of context (catches LLM `context_before` drift in multi-column layouts).
4. **Substring of concatenated normalised stream** — handles LLM tokenisation drift like `d'une` → `d' + une`, where the standalone word has no PyMuPDF token equivalent. Gated by `_MIN_SUBSTRING_CHARS = 5` to avoid spurious matches like `une` inside `commune`.

When the locator misses, the mistake is shown in the "Non localisées" section instead of being silently dropped. The **Debug toggle in the sidebar** dumps the raw Markdown, the anonymised prompt, raw + deanonymised mistakes, and the per-page word stream — that's the primary tool for diagnosing why a mistake didn't land.

## Tests

Tests are layered on top of `tests/conftest.py::tiny_pdf_path`, which builds a real 1-page PDF with PyMuPDF using **ASCII-only text** — deliberate, because Unicode apostrophes drift between PyMuPDF's writer and opendataloader-pdf's reader and would make assertions flaky. Keep that ASCII rule when adding new fixture PDFs.

`pytest-asyncio` is in `asyncio_mode = "auto"`, so `async def test_…` works without decorators.

## Constraints baked into the app

- `MAX_PDF_BYTES = 5 * 1024 * 1024` and `MAX_PAGES = 20` (app.py). These are enforced *before* the pipeline runs.
- PDFs without a text layer (scanned images) are rejected — `extract_markdown` returns empty and the pipeline raises rather than calling the LLM.
- `PdfDocument.render_page` and `.words` are `lru_cache`d per page; the `PdfDocument` itself lives in `st.session_state["last_run"]` keyed by the uploaded bytes, so re-renders on click don't re-run the LLM.

## Design docs

- `docs/superpowers/specs/2026-05-20-piighost-proofreader-design.md` — full architecture spec for the Python pipeline.
- `docs/superpowers/specs/2026-05-21-frontend-tailgrids-design.md` — frontend phase 1 design. The stack was revised on 2026-05-21 from vanilla HTML/JS to **React + Vite + TypeScript + TailGrids primitives TSX**; the spec carries a banner noting this.
- `docs/superpowers/plans/2026-05-21-frontend-tailgrids-react.md` — **authoritative** implementation plan (14 TDD tasks). The earlier `2026-05-21-frontend-tailgrids.md` is the obsolete vanilla plan, kept only for historical context — do not execute it.
- `docs/superpowers/specs/references/2026-05-21-tailgrids-mockups/` — frozen brainstorm mockups (HTML + TailGrids screenshots) that justified the visual decisions captured in the spec.
