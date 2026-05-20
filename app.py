"""Streamlit entry point for piighost-proofreader."""

from __future__ import annotations

import asyncio
import json
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
    mistakes_clean = []
    doc = PdfDocument(pdf_path)
    for m in result.mistakes:
        m_clean = m.model_copy(
            update={
                "error_text": await client.deanonymize(m.error_text, thread_id=thread_id),
                "context_before": await client.deanonymize(m.context_before, thread_id=thread_id),
                "correction": await client.deanonymize(m.correction, thread_id=thread_id),
                "description": await client.deanonymize(m.description, thread_id=thread_id),
            }
        )
        mistakes_clean.append(m_clean)
        for page_index in range(doc.page_count):
            hit = locate_mistake(m_clean, words=list(doc.words(page_index)))
            if hit is not None:
                located.append(hit)
                break
        else:
            unlocatable.append(m_clean)
    return {
        "doc": doc,
        "located": located,
        "unlocatable": unlocatable,
        "language": language,
        # Debug payload (rendered conditionally by the UI).
        "markdown_raw": markdown,
        "markdown_anonymized": anonymized,
        "mistakes_raw": list(result.mistakes),
        "mistakes_clean": mistakes_clean,
        "thread_id": thread_id,
    }


def _render_page(
    doc: PdfDocument, page_index: int, located: list[LocatedMistake], active_idx: int | None
) -> bytes:
    page_png = doc.render_page(page_index)
    page_w, page_h = doc.page_size(page_index)
    highlights = [
        HighlightSpec(bbox=lm.bbox, is_active=(i == active_idx))
        for i, lm in enumerate(located)
        if lm.page_index == page_index
    ]
    return overlay_highlights(
        page_png,
        page_width_pt=page_w,
        page_height_pt=page_h,
        highlights=highlights,
    )


def _build_dump(outcome: dict) -> str:
    """Serialize the full pipeline state as JSON for offline diagnosis.

    Includes both anonymized and deanonymized data; share only with
    parties trusted with the original PDF content.
    """
    doc: PdfDocument = outcome["doc"]
    word_stream = []
    for page_index in range(doc.page_count):
        for w in doc.words(page_index):
            word_stream.append(
                {
                    "page": page_index,
                    "text": w.text,
                    "bbox": list(w.bbox),
                }
            )
    page_sizes = [
        {"page": i, "width_pt": doc.page_size(i)[0], "height_pt": doc.page_size(i)[1]}
        for i in range(doc.page_count)
    ]
    payload = {
        "language": outcome["language"],
        "thread_id": outcome["thread_id"],
        "page_count": doc.page_count,
        "page_sizes": page_sizes,
        "markdown_raw": outcome["markdown_raw"],
        "markdown_anonymized": outcome["markdown_anonymized"],
        "mistakes_raw": [m.model_dump() for m in outcome["mistakes_raw"]],
        "mistakes_clean": [m.model_dump() for m in outcome["mistakes_clean"]],
        "located": [
            {
                "mistake": lm.mistake.model_dump(),
                "page": lm.page_index,
                "bbox": list(lm.bbox),
            }
            for lm in outcome["located"]
        ],
        "unlocatable": [m.model_dump() for m in outcome["unlocatable"]],
        "word_stream": word_stream,
    }
    return json.dumps(payload, ensure_ascii=False, indent=2)


def _render_debug_section(outcome: dict) -> None:
    """Show pipeline intermediates so the user can diagnose why a mistake is missing."""
    st.divider()
    st.subheader("Debug")
    st.caption(
        f"language={outcome['language']}, thread_id={outcome['thread_id']}, "
        f"raw mistakes={len(outcome['mistakes_raw'])}, "
        f"located={len(outcome['located'])}, "
        f"unlocatable={len(outcome['unlocatable'])}"
    )

    st.download_button(
        "Download pipeline dump (JSON)",
        data=_build_dump(outcome),
        file_name=f"proofreader-dump-{outcome['thread_id'][:8]}.json",
        mime="application/json",
        help="Full state: extracted Markdown, anonymized prompt, raw + deanonymized mistakes, located/unlocatable lists, per-page word stream. Share only with trusted parties since it contains the original PDF text.",
    )

    with st.expander("Markdown extracted from the PDF (sent to anonymizer)", expanded=False):
        st.code(outcome["markdown_raw"], language="markdown")

    with st.expander("Anonymized Markdown (sent to the LLM)", expanded=False):
        st.code(outcome["markdown_anonymized"], language="markdown")

    with st.expander("Raw LLM mistakes (before deanonymization)", expanded=False):
        if outcome["mistakes_raw"]:
            st.dataframe(
                [m.model_dump() for m in outcome["mistakes_raw"]],
                use_container_width=True,
                hide_index=True,
            )
        else:
            st.info("LLM returned no mistakes.")

    with st.expander("Deanonymized mistakes (after the entity replacement)", expanded=False):
        if outcome["mistakes_clean"]:
            st.dataframe(
                [m.model_dump() for m in outcome["mistakes_clean"]],
                use_container_width=True,
                hide_index=True,
            )
        else:
            st.info("Nothing to deanonymize.")

    doc: PdfDocument = outcome["doc"]
    with st.expander("Word stream per page (PyMuPDF, used by the locator)", expanded=False):
        for page_index in range(doc.page_count):
            words = doc.words(page_index)
            st.caption(f"Page {page_index + 1}, {len(words)} words")
            st.dataframe(
                [
                    {
                        "text": w.text,
                        "x0": round(w.bbox[0], 1),
                        "y0": round(w.bbox[1], 1),
                        "x1": round(w.bbox[2], 1),
                        "y1": round(w.bbox[3], 1),
                    }
                    for w in words
                ],
                use_container_width=True,
                hide_index=True,
                height=240,
            )


def main() -> None:
    st.set_page_config(page_title="piighost-proofreader", layout="wide")
    st.title("piighost-proofreader")
    st.caption("Upload a CV, get an LLM-powered proofreading pass with click-to-highlight.")

    with st.sidebar:
        debug_mode = st.toggle(
            "Debug mode",
            value=False,
            help="Show the extracted Markdown, the anonymized prompt, the raw LLM output, and the word stream the locator sees.",
        )

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

    if debug_mode:
        _render_debug_section(outcome)


if __name__ == "__main__":
    main()
