"""HTTP routes for the proofreading API."""

import tempfile
import uuid
from pathlib import Path

import anyio.to_thread
from fastapi import APIRouter, File, Query, UploadFile
from fastapi.responses import JSONResponse, StreamingResponse

from proofreader.anonymize import AnonymizationClient
from proofreader.api.errors import NoTextLayerError, classify_exception
from proofreader.api.pipeline import locate_detection, run_pipeline
from proofreader.api.settings import load_settings
from proofreader.api.sse import format_sse
from proofreader.language import detect_language
from proofreader.pdf_extraction import extract_markdown
from proofreader.pdf_render import PdfDocument

router = APIRouter(prefix="/api")


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


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


@router.get("/labels")
async def labels():
    settings = load_settings()
    client = AnonymizationClient(base_url=settings.piighost_api_url)
    return {"labels": await client.get_labels()}
