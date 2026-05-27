import { Badge } from "@/components/tailgrids/core/badge";
import { Button } from "@/components/tailgrids/core/button";
import { useT } from "@/i18n/LanguageContext";

interface Props {
  filename: string;
  autoCount: number;
  manualCount: number;
  onCancel: () => void;
  onValidate: () => void;
}

export default function ReviewTopBar({
  filename, autoCount, manualCount, onCancel, onValidate,
}: Props) {
  const { t } = useT();
  const total = autoCount + manualCount;
  return (
    <div className="flex items-center justify-between bg-background-50 border border-base-100 rounded-xl px-5 py-3 mb-5">
      <div className="flex items-center gap-3">
        <span className="font-semibold">{filename}</span>
        <Badge color="primary" size="sm">{t("review_entities_badge", { n: total })}</Badge>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="primary" appearance="outline" size="sm" onClick={onCancel}>
          {t("review_cancel")}
        </Button>
        <Button variant="primary" appearance="fill" size="sm" onClick={onValidate}>
          {t("review_analyze_button")}
        </Button>
      </div>
    </div>
  );
}
