import { useEffect, useState } from "react";
import { base64ToBytes, renderAllPages, type RenderedPage } from "@/lib/pdf";
import HighlightOverlay from "./HighlightOverlay";
import type { LocatedMistake } from "@/lib/types";

interface Props {
  pdfBase64: string;
  pageSizes: { page: number; width_pt: number; height_pt: number }[];
  mistakes: LocatedMistake[];
  enabled: boolean[];
  activeIndex: number | null;
}

export default function PdfPanel({
  pdfBase64,
  pageSizes,
  mistakes,
  enabled,
  activeIndex,
}: Props) {
  const [pages, setPages] = useState<RenderedPage[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const bytes = base64ToBytes(pdfBase64);
      // Render at 2× for crisp text — CSS will downscale via width: 100%.
      const rendered = await renderAllPages(bytes, 2);
      if (cancelled) return;
      setPages(rendered);
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfBase64]);

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
            <HighlightOverlay
              mistakes={mistakes}
              enabled={enabled}
              activeIndex={activeIndex}
              pageIndex={p.pageIndex}
              pageWidthPt={pageWidthPt}
              pageHeightPt={pageHeightPt}
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
