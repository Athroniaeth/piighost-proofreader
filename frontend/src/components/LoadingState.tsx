import StepIndicator from "./StepIndicator";

interface Props {
  /** When provided, render the step indicator above the spinner. */
  currentStep?: 1 | 2 | 3;
  /** Optional override of the body text shown below the spinner. */
  message?: string;
}

export default function LoadingState({ currentStep, message }: Props) {
  return (
    <section className="min-h-screen flex flex-col items-center justify-center px-4">
      {currentStep !== undefined && (
        <div className="w-full max-w-[1280px] pt-8">
          <StepIndicator current={currentStep} />
        </div>
      )}
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-sm mx-auto">
          <div className="spinner mx-auto mb-4" aria-label="loading" />
          <div className="font-semibold mb-1">Analyse en cours…</div>
          <div className="text-xs text-text-100">
            {message ?? "Extraction du texte · Anonymisation · Détection des fautes"}
          </div>
          <div className="text-xs text-text-200 mt-2">
            ≈ 10 secondes pour un CV d'une page
          </div>
        </div>
      </div>
    </section>
  );
}
