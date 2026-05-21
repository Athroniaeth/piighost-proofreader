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
    raise HTTPException(status_code=501, detail="streaming wired in next task")
