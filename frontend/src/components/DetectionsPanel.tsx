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
      <div className="mb-3 p-3 rounded-lg bg-badge-primary-background border border-base-100">
        <p className="text-xs text-foreground-100 leading-relaxed mb-2">
          <span className="font-semibold">Sélectionnez du texte sur le PDF</span>{" "}
          pour l'ajouter à la liste d'anonymisation, ou cliquez le bouton
          ci-dessous.
        </p>
        <Button
          variant="primary"
          appearance="fill"
          size="sm"
          onClick={onAddManual}
          className="w-full"
        >
          + Ajouter une anonymisation
        </Button>
      </div>
      <p className="text-[11px] text-text-100 mb-3 leading-relaxed">
        Croix pour retirer une entité · label pour re-catégoriser.
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
