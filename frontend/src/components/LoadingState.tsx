export default function LoadingState() {
  return (
    <section className="min-h-screen flex items-center justify-center">
      <div className="text-center max-w-sm mx-auto px-4">
        <div className="spinner mx-auto mb-4" aria-label="loading" />
        <div className="font-semibold mb-1">Analyse en cours…</div>
        <div className="text-xs text-text-100">
          Extraction du texte · Anonymisation · Détection des fautes
        </div>
        <div className="text-xs text-text-200 mt-2">
          ≈ 10 secondes pour un CV d'une page
        </div>
      </div>
    </section>
  );
}
