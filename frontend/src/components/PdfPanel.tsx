import { useEffect, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { renderAllPages, type RenderedPage } from "@/lib/pdf";
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
  enableTextLayer?: boolean;
  onTextSelection?: (text: string) => void;
}

export default function PdfPanel({
  pdfBytes,
  pageSizes,
  variant,
  items,
  activeIndex,
  enableTextLayer = false,
  onTextSelection,
}: Props) {
  const [pages, setPages] = useState<RenderedPage[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rendered = await renderAllPages(pdfBytes, 2);
      if (cancelled) return;
      setPages(rendered);
    })();
    return () => { cancelled = true; };
  }, [pdfBytes]);

  useEffect(() => {
    if (!enableTextLayer || !onTextSelection) return;
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
  }, [enableTextLayer, onTextSelection]);

  const overlaySpecs = items
    .map((it) => {
      if (it.kind === "mistake") {
        if (!it.enabled) return null;
        return { page: it.m.page, bbox: it.m.bbox };
      }
      if (it.d.bbox == null) return null;
      return { page: it.d.page, bbox: it.d.bbox };
    })
    .filter((s): s is { page: number; bbox: [number, number, number, number] } => s !== null);

  return (
    <div className="space-y-4">
      {pages.map((p) => {
        const sizePt = pageSizes.find((s) => s.page === p.pageIndex);
        const pageWidthPt = sizePt?.width_pt ?? p.width / p.scale;
        const pageHeightPt = sizePt?.height_pt ?? p.height / p.scale;
        return (
          <div
            key={p.pageIndex}
            className="pdf-page relative mx-auto w-full"
            style={{ aspectRatio: `${pageWidthPt} / ${pageHeightPt}` }}
          >
            <div
              className="absolute inset-0"
              ref={(el) => {
                if (!el) return;
                if (el.firstChild !== p.canvas) {
                  p.canvas.style.width = "100%";
                  p.canvas.style.height = "100%";
                  p.canvas.style.display = "block";
                  el.replaceChildren(p.canvas);
                }
              }}
            />
            {enableTextLayer && <TextLayer page={p} />}
            <HighlightOverlay
              items={overlaySpecs}
              pageIndex={p.pageIndex}
              pageWidthPt={pageWidthPt}
              pageHeightPt={pageHeightPt}
              variant={variant}
              activeIndex={activeIndex}
            />
          </div>
        );
      })}
      {pages.length === 0 && (
        <p className="text-xs text-text-200">Chargement du PDF…</p>
      )}
    </div>
  );
}

function TextLayer({ page }: { page: RenderedPage }) {
  return (
    <div
      ref={(container) => {
        if (!container) return;
        if (container.dataset.rendered === "1") return;
        container.innerHTML = "";
        page.page
          .getTextContent()
          .then((textContent) => {
            const layer = new pdfjsLib.TextLayer({
              textContentSource: textContent,
              container,
              viewport: page.viewport,
            });
            return layer.render();
          })
          .then(() => {
            container.dataset.rendered = "1";
          })
          .catch(() => { /* swallow */ });
      }}
      className="absolute inset-0 opacity-100"
      style={{
        color: "transparent",
        userSelect: "text",
        pointerEvents: "auto",
      }}
    />
  );
}
