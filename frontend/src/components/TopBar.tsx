import { Badge } from "@/components/tailgrids/core/badge";
import { Button } from "@/components/tailgrids/core/button";
import { useT } from "@/i18n/LanguageContext";
import { plural } from "@/i18n/plural";

interface Props {
  filename: string;
  mistakeCount: number;
  streaming: boolean;
  debugAvailable: boolean;
  debugVisible: boolean;
  onToggleDebug: () => void;
  onReset: () => void;
}

export default function TopBar({
  filename,
  mistakeCount,
  streaming,
  debugAvailable,
  debugVisible,
  onToggleDebug,
  onReset,
}: Props) {
  const { t } = useT();
  let badge;
  if (streaming) {
    badge = (
      <Badge color="primary" size="sm">
        {t("topbar_streaming", { n: mistakeCount })}
      </Badge>
    );
  } else if (mistakeCount === 0) {
    badge = (
      <Badge color="success" size="sm">{t("topbar_no_mistakes")}</Badge>
    );
  } else {
    badge = (
      <Badge color="primary" size="sm">{plural(t, mistakeCount, "mistake")}</Badge>
    );
  }
  return (
    <div className="flex items-center justify-between bg-background-50 border border-base-100 rounded-xl px-5 py-3 mb-5">
      <div className="flex items-center gap-3">
        <span className="font-semibold">{filename}</span>
        {badge}
      </div>
      <div className="flex items-center gap-2">
        {debugAvailable && (
          <Button
            variant="primary"
            appearance={debugVisible ? "fill" : "outline"}
            size="sm"
            onClick={onToggleDebug}
          >
            Debug
          </Button>
        )}
        <Button variant="primary" appearance="outline" size="sm" onClick={onReset}>
          {t("topbar_new_pdf")}
        </Button>
      </div>
    </div>
  );
}
