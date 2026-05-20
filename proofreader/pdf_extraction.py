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
