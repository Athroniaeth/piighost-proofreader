import { useEffect, useState } from "react";
import { Viewer, Worker } from "@react-pdf-viewer/core";
import "@react-pdf-viewer/core/lib/styles/index.css";
import workerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
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
  // enableTextLayer is now a no-op: @react-pdf-viewer renders its text layer
  // by default so text selection always works without extra configuration.
  enableTextLayer?: boolean;
  onTextSelection?: (text: string) => void;
}

export default function PdfPanel({
  pdfBytes,
  pageSizes,
  variant,
  items,
  activeIndex,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  enableTextLayer: _enableTextLayer,
  onTextSelection,
}: Props) {
  // Create the blob URL inside the effect so its lifetime matches the cleanup.
  // This avoids a StrictMode race where useMemo's URL gets revoked while
  // @react-pdf-viewer is still fetching it, surfacing as ERR_FILE_NOT_FOUND.
  const [blobUrl, setBlobUrl] = useState<string>("");

  useEffect(() => {
    const url = URL.createObjectURL(
      new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" })
    );
    setBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pdfBytes]);

  // Text-selection handler: fires on mouseup anywhere in the document.
  // We always attach it when onTextSelection is provided because the
  // @react-pdf-viewer text layer is always enabled.
  useEffect(() => {
    if (!onTextSelection) return;
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
  }, [onTextSelection]);

  // Pre-compute overlay specs once (same logic as before).
  const overlaySpecs = items
    .map((it) => {
      if (it.kind === "mistake") {
        if (!it.enabled) return null;
        return { page: it.m.page, bbox: it.m.bbox };
      }
      // detection: skip entries without a PDF bounding box
      if (it.d.bbox == null) return null;
      return { page: it.d.page, bbox: it.d.bbox };
    })
    .filter((s): s is { page: number; bbox: [number, number, number, number] } => s !== null);

  if (!blobUrl) return null;

  return (
    // The viewer fills its parent container. The parent in ResultsState /
    // ReviewState already has min-h-[60vh], so we match that height here.
    <div style={{ height: "100%", minHeight: "60vh" }}>
      <Worker workerUrl={workerUrl}>
        <Viewer
          fileUrl={blobUrl}
          renderPage={(props) => {
            const sizePt = pageSizes.find((s) => s.page === props.pageIndex);
            const pageWidthPt = sizePt?.width_pt ?? props.width;
            const pageHeightPt = sizePt?.height_pt ?? props.height;

            return (
              <>
                {props.canvasLayer.children}
                {props.textLayer.children}
                {props.annotationLayer.children}
                <HighlightOverlay
                  items={overlaySpecs}
                  pageIndex={props.pageIndex}
                  pageWidthPt={pageWidthPt}
                  pageHeightPt={pageHeightPt}
                  variant={variant}
                  activeIndex={activeIndex}
                />
              </>
            );
          }}
        />
      </Worker>
    </div>
  );
}
