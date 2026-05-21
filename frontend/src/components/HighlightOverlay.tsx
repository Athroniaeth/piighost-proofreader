import { useEffect, useRef } from "react";

export type OverlayVariant = "mistake" | "detection";

interface Spec {
  page: number;
  bbox: [number, number, number, number];
  active?: boolean;
}

interface Props {
  items: Spec[];
  pageIndex: number;
  pageWidthPt: number;
  pageHeightPt: number;
  variant: OverlayVariant;
  activeIndex: number | null;
}

const COLORS: Record<OverlayVariant, { default: string; active: string; outline: string }> = {
  mistake: {
    default: "rgba(235, 30, 30, 0.35)",
    active: "rgba(255, 230, 0, 0.55)",
    outline: "#f59e0b",
  },
  detection: {
    default: "rgba(59, 130, 246, 0.35)",
    active: "rgba(255, 230, 0, 0.55)",
    outline: "#f59e0b",
  },
};

export default function HighlightOverlay({
  items,
  pageIndex,
  pageWidthPt,
  pageHeightPt,
  variant,
  activeIndex,
}: Props) {
  const activeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeIndex]);

  const colors = COLORS[variant];

  return (
    <div className="absolute inset-0 pointer-events-none">
      {items.map((item, idx) => {
        if (item.page !== pageIndex) return null;
        const [x0, y0, x1, y1] = item.bbox;
        const isActive = idx === activeIndex;
        return (
          <div
            key={idx}
            ref={isActive ? activeRef : null}
            className="absolute rounded-sm transition-colors"
            style={{
              left: `${(x0 / pageWidthPt) * 100}%`,
              top: `${(y0 / pageHeightPt) * 100}%`,
              width: `${((x1 - x0) / pageWidthPt) * 100}%`,
              height: `${((y1 - y0) / pageHeightPt) * 100}%`,
              backgroundColor: isActive ? colors.active : colors.default,
              outline: isActive ? `2px solid ${colors.outline}` : "none",
            }}
          />
        );
      })}
    </div>
  );
}
