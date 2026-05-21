import type { ErrorReason, ErrorDetails } from "@/hooks/useAppState";
import { Button } from "@/components/tailgrids/core/button";

interface Props {
  reason: ErrorReason;
  details?: ErrorDetails;
  onReset: () => void;
}

const PRESETS: Record<
  ErrorReason,
  {
    icon: string;
    title: string;
    body: (d?: ErrorDetails) => string;
    tone: "red" | "amber";
    action: string;
  }
> = {
  "too-large": {
    icon: "⚠️",
    title: "Fichier trop volumineux",
    body: (d) => `${(d?.sizeMb ?? 0).toFixed(1)} Mo · limite 10 Mo`,
    tone: "red",
    action: "Choisir un autre fichier",
  },
  "not-pdf": {
    icon: "📄❌",
    title: "Format non supporté",
    body: () => "Uniquement les fichiers PDF sont acceptés.",
    tone: "red",
    action: "Choisir un autre fichier",
  },
  "no-text-layer": {
    icon: "📄❌",
    title: "PDF non lisible",
    body: () =>
      "Aucun texte trouvé. Le PDF semble être un scan, l'OCR n'est pas supporté.",
    tone: "red",
    action: "Essayer un autre PDF",
  },
  "backend-down": {
    icon: "🔌",
    title: "Service indisponible",
    body: () =>
      "Réessayez dans quelques instants. Si ça persiste, signalez sur GitHub.",
    tone: "amber",
    action: "Réessayer",
  },
  "rate-limit": {
    icon: "⏳",
    title: "Trop de requêtes",
    body: (d) =>
      `Quota atteint pour cette IP. Réessayez dans ${d?.retryInSec ?? 120} secondes.`,
    tone: "amber",
    action: "Réessayer",
  },
};

export default function ErrorState({ reason, details, onReset }: Props) {
  const p = PRESETS[reason];
  const border =
    p.tone === "amber"
      ? "border-badge-warning-icon-color bg-badge-warning-background"
      : "border-button-error-border bg-badge-error-background";
  const text = p.tone === "amber" ? "text-badge-warning-text" : "text-badge-error-text";
  return (
    <section className="min-h-screen flex items-center justify-center px-4">
      <div className={`max-w-md mx-auto text-center p-8 border rounded-2xl ${border}`}>
        <div className="text-4xl mb-2">{p.icon}</div>
        <div className={`font-semibold mb-1 ${text}`}>{p.title}</div>
        <div className={`text-sm ${text}`}>{p.body(details)}</div>
        <div className="mt-4">
          <Button variant="primary" appearance="fill" size="md" onClick={onReset}>
            {p.action}
          </Button>
        </div>
      </div>
    </section>
  );
}
