import type { PageDetection } from "@/lib/types";
import DetectionCard from "./DetectionCard";
import { Button } from "@/components/tailgrids/core/button";

interface Props {
  detections: PageDetection[];
  labels: string[];
  activeIndex: number | null;
  onActivate: (i: number) => void;
  onRemove: (d: PageDetection) => void;
  onRelabel: (d: PageDetection, newLabel: string) => void;
  onAddManual: () => void;
}

export default function DetectionsPanel({
  detections, labels, activeIndex, onActivate, onRemove, onRelabel, onAddManual,
}: Props) {
  const empty = detections.length === 0;
  return (
    <div>
      <Button
        variant="primary"
        appearance="outline"
        size="sm"
        onClick={onAddManual}
        className="w-full mb-3"
      >
        + Ajouter une anonymisation
      </Button>
      <p className="text-[11px] text-text-200 italic mb-3 leading-relaxed">
        Sélectionnez du texte sur le PDF pour l'anonymiser, ou utilisez le
        bouton ci-dessus. Croix pour retirer, label pour re-catégoriser.
      </p>
      {empty ? (
        <div className="text-center px-6 py-8 border border-dashed border-base-200 rounded-lg">
          <div className="text-3xl mb-2">🛡️</div>
          <div className="text-sm font-semibold mb-1">Aucune entité détectée</div>
          <div className="text-xs text-text-100 leading-relaxed">
            piighost-api n'a rien repéré. Vous pouvez ajouter manuellement
            ci-dessus.
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
