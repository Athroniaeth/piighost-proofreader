import { useEffect, useRef } from "react";
import type { LocatedMistake } from "@/lib/types";

interface Props {
  mistakes: LocatedMistake[];
  enabled: boolean[];
  activeIndex: number | null;
  pageIndex: number;
  pageWidthPt: number;
  pageHeightPt: number;
}

export default function HighlightOverlay({
  mistakes,
  enabled,
  activeIndex,
  pageIndex,
  pageWidthPt,
  pageHeightPt,
}: Props) {
  const activeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeIndex]);

  return (
    <div className="absolute inset-0 pointer-events-none">
      {mistakes.map((m, idx) => {
        if (m.page !== pageIndex || !enabled[idx]) return null;
        const [x0, y0, x1, y1] = m.bbox;
        const left = (x0 / pageWidthPt) * 100;
        const top = (y0 / pageHeightPt) * 100;
        const width = ((x1 - x0) / pageWidthPt) * 100;
        const height = ((y1 - y0) / pageHeightPt) * 100;
        const isActive = idx === activeIndex;
        return (
          <div
            key={idx}
            ref={isActive ? activeRef : null}
            className="absolute rounded-sm transition-colors"
            style={{
              left: `${left}%`,
              top: `${top}%`,
              width: `${width}%`,
              height: `${height}%`,
              backgroundColor: isActive
                ? "rgba(255, 230, 0, 0.55)"
                : "rgba(235, 30, 30, 0.35)",
              outline: isActive ? "2px solid #f59e0b" : "none",
            }}
          />
        );
      })}
    </div>
  );
}
