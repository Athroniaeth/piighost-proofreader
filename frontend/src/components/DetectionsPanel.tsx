import { useT } from "@/i18n/LanguageContext";
import type { PageDetection } from "@/lib/types";
import DetectionCard from "./DetectionCard";

interface Props {
  detections: PageDetection[];
  labels: string[];
  activeIndex: number | null;
  onActivate: (i: number) => void;
  onRemove: (d: PageDetection) => void;
  onRelabel: (d: PageDetection, newLabel: string) => void;
}

export default function DetectionsPanel({
  detections, labels, activeIndex, onActivate, onRemove, onRelabel,
}: Props) {
  const { t } = useT();
  const empty = detections.length === 0;
  return (
    <div>
      <div className="mb-3 p-3 rounded-lg bg-background-soft-50 border border-base-100 space-y-2">
        <h3 className="text-sm font-semibold text-foreground-100">
          {t("detections_title")}
        </h3>
        <p className="text-xs text-foreground-100 leading-relaxed">
          {t("detections_intro_before")}
          <span className="font-semibold">{t("detections_intro_bold")}</span>
          {t("detections_intro_after")}
        </p>
        <p className="text-xs text-foreground-100 leading-relaxed">
          {t("detections_help")}
        </p>
      </div>
      {empty ? (
        <div className="text-center px-6 py-8 border border-dashed border-base-200 rounded-lg">
          <div className="text-3xl mb-2">🛡️</div>
          <div className="text-sm font-semibold mb-1">{t("detections_empty_title")}</div>
          <div className="text-xs text-text-100 leading-relaxed">
            {t("detections_empty_body")}
          </div>
        </div>
      ) : (
        detections.map((d, i) => (
          <DetectionCard
            key={i}
            detection={d}
            active={activeIndex === i}
            labels={labels}
            onActivate={() => onActivate(i)}
            onRemove={() => onRemove(d)}
            onRelabel={(l) => onRelabel(d, l)}
          />
        ))
      )}
    </div>
  );
}
