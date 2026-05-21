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
