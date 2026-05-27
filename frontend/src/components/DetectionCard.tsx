import { useState } from "react";
import { useT } from "@/i18n/LanguageContext";
import type { PageDetection } from "@/lib/types";

interface Props {
  detection: PageDetection;
  active: boolean;
  labels: string[];
  onActivate: () => void;
  onRemove: () => void;
  onRelabel: (newLabel: string) => void;
}

export default function DetectionCard({
  detection, active, labels, onActivate, onRemove, onRelabel,
}: Props) {
  const { t } = useT();
  const [labelMenuOpen, setLabelMenuOpen] = useState(false);
  const ring = active
    ? "border border-amber-200 bg-amber-50"
    : "border border-base-100 bg-background-50";
  const manualBadge = detection.manual ? (
    <span className="text-[10px] italic text-text-200 ml-2">{t("detections_manual_badge")}</span>
  ) : null;

  return (
    <div
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("[data-action]")) return;
        onActivate();
      }}
      className={`flex items-start gap-3 p-3 rounded-lg mb-2 cursor-pointer transition-colors ${ring}`}
    >
      <div className="flex-1 text-xs min-w-0">
        <div className="break-words leading-snug font-semibold">
          {detection.text}{manualBadge}
        </div>
        <div className="relative inline-block mt-1">
          <button
            type="button"
            data-action
            onClick={(e) => {
              e.stopPropagation();
              setLabelMenuOpen((v) => !v);
            }}
            className="text-[10px] uppercase italic text-text-200 hover:text-text-50 px-1 py-0.5 rounded hover:bg-background-soft-50"
          >
            {detection.label} ▾
          </button>
          {labelMenuOpen && (
            <div
              data-action
              className="absolute z-10 bg-background-50 border border-base-100 rounded-md shadow-md mt-1 max-h-40 overflow-y-auto min-w-32"
            >
              {labels
                .filter((l) => l !== detection.label)
                .map((l) => (
                  <button
                    key={l}
                    type="button"
                    data-action
                    className="block w-full text-left px-3 py-1 text-xs hover:bg-background-soft-50"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRelabel(l);
                      setLabelMenuOpen(false);
                    }}
                  >
                    {l}
                  </button>
                ))}
            </div>
          )}
        </div>
      </div>
      <button
        type="button"
        data-action
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="text-text-200 hover:text-button-error-background text-sm leading-none p-1"
        title={t("detections_remove")}
        aria-label={t("detections_remove")}
      >
        ✕
      </button>
    </div>
  );
}
