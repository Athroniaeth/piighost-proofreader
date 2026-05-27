import type { ErrorReason, ErrorDetails } from "@/hooks/useAppState";
import { Button } from "@/components/tailgrids/core/button";
import { useT } from "@/i18n/LanguageContext";

interface Props {
  reason: ErrorReason;
  details?: ErrorDetails;
  onReset: () => void;
}

export default function ErrorState({ reason, details, onReset }: Props) {
  const { t } = useT();

  const PRESETS: Record<
    ErrorReason,
    {
      icon: string;
      title: string;
      body: string;
      tone: "red" | "amber";
      action: string;
    }
  > = {
    "too-large": {
      icon: "⚠️",
      title: t("error_too_large_title"),
      body: t("error_too_large_body", {
        sizeMb: (details?.sizeMb ?? 0).toFixed(1),
      }),
      tone: "red",
      action: t("error_choose_another_file"),
    },
    "not-pdf": {
      icon: "📄❌",
      title: t("error_not_pdf_title"),
      body: t("error_not_pdf_body"),
      tone: "red",
      action: t("error_choose_another_file"),
    },
    "no-text-layer": {
      icon: "📄❌",
      title: t("error_no_text_layer_title"),
      body: t("error_no_text_layer_body"),
      tone: "red",
      action: t("error_try_another_pdf"),
    },
    "backend-down": {
      icon: "🔌",
      title: t("error_backend_down_title"),
      body: t("error_backend_down_body"),
      tone: "amber",
      action: t("error_retry_button"),
    },
    "rate-limit": {
      icon: "⏳",
      title: t("error_rate_limit_title"),
      body: t("error_rate_limit_body", {
        retryInSec: details?.retryInSec ?? 120,
      }),
      tone: "amber",
      action: t("error_retry_button"),
    },
    internal: {
      icon: "⚠️",
      title: t("error_internal_title"),
      body: details?.message ?? t("error_internal_body"),
      tone: "red",
      action: t("error_back_button"),
    },
  };

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
        <div className={`text-sm ${text}`}>{p.body}</div>
        <div className="mt-4">
          <Button variant="primary" appearance="fill" size="md" onClick={onReset}>
            {p.action}
          </Button>
        </div>
      </div>
    </section>
  );
}
