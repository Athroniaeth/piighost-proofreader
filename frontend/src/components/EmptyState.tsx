import { useRef, useState, type DragEvent } from "react";
import { validateFile, type ValidationResult } from "@/lib/upload";
import { Button } from "@/components/tailgrids/core/button";

interface Props {
  onFile: (file: File) => void;
  onReject: (result: Extract<ValidationResult, { ok: false }>) => void;
}

export default function EmptyState({ onFile, onReject }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setDragOver] = useState(false);

  const handle = (file: File | null | undefined) => {
    if (!file) return;
    const r = validateFile(file);
    if (r.ok) onFile(r.file);
    else onReject(r);
  };

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handle(e.dataTransfer?.files?.[0]);
  };

  return (
    <section className="min-h-screen flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-xl text-center">
          <h1 className="text-3xl font-bold tracking-tight mb-2">ProofReader</h1>
          <p className="text-sm text-text-100 mb-8">
            Glissez un PDF, le LLM repère orthographe, grammaire, accord,
            conjugaison et ponctuation.
          </p>

          <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={`p-12 border-2 border-dashed rounded-2xl transition-colors ${
              isDragOver
                ? "border-foreground-soft-100 bg-background-soft-200"
                : "border-base-300 bg-background-soft-50 hover:border-base-300"
            }`}
          >
            <div className="text-5xl mb-4">📄</div>
            <div className="text-lg font-semibold mb-1">Glissez votre CV ici</div>
            <div className="text-sm text-text-100 mb-5">ou</div>
            <div className="flex justify-center">
              <Button
                variant="primary"
                appearance="fill"
                size="md"
                onClick={() => inputRef.current?.click()}
              >
                Parcourir mes fichiers
              </Button>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                handle(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <div className="text-xs text-text-200 mt-5">
              PDF uniquement · 10 Mo max · texte (pas un scan)
            </div>
          </div>

          <p className="text-xs text-text-100 mt-6 leading-relaxed">
            🔒 Aucune donnée personnelle ne sort de votre processus. Le contenu
            de votre CV est anonymisé via piighost-api avant d'être envoyé au
            modèle de langage.
          </p>
        </div>
      </div>

      <footer className="py-5 border-t border-base-100 text-center">
        <a
          href="https://github.com/Athroniaeth/piighost-proofreader"
          target="_blank"
          rel="noopener"
          className="inline-flex items-center justify-center w-9 h-9 rounded-full text-text-200 hover:text-text-50"
          title="Code source GitHub"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.34-1.28-1.7-1.28-1.7-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.21-1.49 3.18-1.18 3.18-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.69 5.41-5.25 5.69.41.36.78 1.06.78 2.14 0 1.55-.01 2.8-.01 3.18 0 .31.21.68.8.56C20.71 21.39 24 17.08 24 12 24 5.65 18.85.5 12.5.5z" />
          </svg>
        </a>
      </footer>
    </section>
  );
}
