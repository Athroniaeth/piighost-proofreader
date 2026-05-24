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
  const empty = detections.length === 0;
  return (
    <div>
      <div className="mb-3 p-3 rounded-lg bg-badge-cyan-background border border-base-100 space-y-2">
        <h3 className="text-sm font-semibold text-foreground-100">
          Anonymisation des données
        </h3>
        <p className="text-xs text-foreground-100 leading-relaxed">
          Vos données personnelles ont été détectées et seront anonymisées
          avant l'envoi au modèle d'analyse. Si une donnée à protéger a été
          oubliée, <span className="font-semibold">sélectionnez-la directement
          sur le PDF</span> pour l'ajouter à la liste.
        </p>
        <p className="text-xs text-foreground-100 leading-relaxed">
          En cas d'erreur, cliquez la croix de la carte concernée pour la
          retirer, ou son label pour changer de catégorie.
        </p>
      </div>
      {empty ? (
        <div className="text-center px-6 py-8 border border-dashed border-base-200 rounded-lg">
          <div className="text-3xl mb-2">🛡️</div>
          <div className="text-sm font-semibold mb-1">Aucune entité détectée</div>
          <div className="text-xs text-text-100 leading-relaxed">
            piighost-api n'a rien repéré. Sélectionnez du texte sur le PDF
            pour anonymiser manuellement.
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
