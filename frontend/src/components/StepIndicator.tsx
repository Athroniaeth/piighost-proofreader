import { useT } from "@/i18n/LanguageContext";

interface Props {
  /** 1-based index of the current step (1, 2 or 3). */
  current: 1 | 2 | 3;
}

export default function StepIndicator({ current }: Props) {
  const { t } = useT();
  const STEPS = [t("step_anonymisation"), t("step_correction"), t("step_result")] as const;
  return (
    <div className="flex items-center justify-center gap-2 mb-4">
      {STEPS.map((label, idx) => {
        const step = (idx + 1) as 1 | 2 | 3;
        const done = step < current;
        const active = step === current;
        return (
          <div key={label} className="flex items-center gap-2">
            <div
              className={
                "flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-semibold " +
                (done
                  ? "bg-button-success-background text-button-success-text"
                  : active
                    ? "bg-button-primary-background text-button-primary-text"
                    : "bg-background-soft-100 text-text-200")
              }
            >
              {done ? "✓" : step}
            </div>
            <span
              className={
                "text-xs " +
                (active
                  ? "text-foreground-100 font-semibold"
                  : done
                    ? "text-text-100"
                    : "text-text-200")
              }
            >
              {label}
            </span>
            {step < 3 && (
              <span
                className={
                  "inline-block w-8 h-px " +
                  (done ? "bg-button-success-background" : "bg-base-200")
                }
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
