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
                "correction": await client.deanonymize(m.correction, thread_id=thread_id),
                "description": await client.deanonymize(m.description, thread_id=thread_id),
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
