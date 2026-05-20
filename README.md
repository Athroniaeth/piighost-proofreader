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
