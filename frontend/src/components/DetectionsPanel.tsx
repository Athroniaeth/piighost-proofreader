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
  if (detections.length === 0) {
    return (
      <div className="h-full flex items-center justify-center px-8">
        <div className="text-center max-w-[260px]">
          <div className="text-3xl mb-3">🛡️</div>
          <div className="text-lg font-semibold mb-2">Aucune entité détectée</div>
          <div className="text-base text-text-100 leading-relaxed">
            piighost-api n'a rien repéré.
            Tu peux sélectionner du texte sur le PDF pour l'anonymiser à la main.
          </div>
        </div>
      </div>
    );
  }
  return (
    <div>
      <p className="text-[11px] text-text-200 italic mb-3">
        Cliquez sur une carte pour la mettre en évidence sur le PDF. Croix pour
        retirer, label pour re-catégoriser.
      </p>
      {detections.map((d, i) => (
        <DetectionCard
          key={i}
          detection={d}
          active={activeIndex === i}
          labels={labels}
          onActivate={() => onActivate(i)}
          onRemove={() => onRemove(d)}
          onRelabel={(l) => onRelabel(d, l)}
        />
      ))}
    </div>
  );
}
