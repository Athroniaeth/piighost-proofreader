import StepIndicator from "./StepIndicator";
import { useT } from "@/i18n/LanguageContext";
import type { TranslationKey } from "@/i18n/types";

interface Props {
  /** When provided, render the step indicator above the spinner. */
  currentStep?: 1 | 2 | 3;
  /** Translation key for the body line under the spinner. */
  messageKey?: TranslationKey;
}

export default function LoadingState({ currentStep, messageKey }: Props) {
  const { t } = useT();
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
          <div className="font-semibold mb-1">{t("loading_title")}</div>
          <div className="text-xs text-text-100">
            {t(messageKey ?? "loading_steps_default")}
          </div>
          <div className="text-xs text-text-200 mt-2">{t("loading_eta")}</div>
        </div>
      </div>
    </section>
  );
}
