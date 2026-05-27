import type { LocatedMistake, ProgressStep } from "@/lib/types";
import type { MistakesState, MistakesAction } from "@/hooks/useMistakesStore";
import MistakeCard from "./MistakeCard";
import { Checkbox } from "@/components/tailgrids/core/checkbox";
import { useT } from "@/i18n/LanguageContext";
import { plural } from "@/i18n/plural";

interface Props {
  mistakes: LocatedMistake[];
  state: MistakesState;
  dispatch: (action: MistakesAction) => void;
  streaming: boolean;
  progress: ProgressStep;
}

export default function MistakesPanel({ mistakes, state, dispatch, streaming, progress }: Props) {
  const { t } = useT();

  const PROGRESS_LABEL: Record<ProgressStep, string> = {
    extracted: t("mistakes_loading"),
    anonymized: t("mistakes_loading"),
    "llm-started": t("mistakes_loading"),
    done: "",
  };

  if (mistakes.length === 0 && !streaming) {
    return (
      <div className="h-full flex items-center justify-center px-8">
        <div className="text-center max-w-[240px]">
          <div className="text-3xl mb-3">✅</div>
          <div className="text-lg font-semibold mb-2">{t("mistakes_no_mistakes_title")}</div>
          <div className="text-base text-text-100 leading-relaxed">
            {t("mistakes_no_mistakes_body")}
          </div>
        </div>
      </div>
    );
  }

  const visible = state.enabled.filter(Boolean).length;
  const allChecked = mistakes.length > 0 && visible === mistakes.length;

  return (
    <div>
      <div className="flex items-center gap-3 mb-3 pb-3 border-b border-base-100">
        <Checkbox
          checked={allChecked}
          onChange={() => dispatch({ type: "SET_ALL", enabled: !allChecked })}
        />
        <span className="text-xs text-text-100">{t("mistakes_toggle_all")}</span>
        <span className="text-xs text-text-100 ml-auto">
          {t("mistakes_visible_count", { shown: visible, total: mistakes.length })}
        </span>
      </div>

      {/* Status bar: spinner+label while streaming, ✅ when done */}
      {streaming ? (
        <div className="flex items-center gap-2 mb-3 p-2.5 rounded-md bg-background-soft-50 text-sm text-text-50">
          <span className="inline-block w-4 h-4 border-2 border-base-100 border-t-foreground-100 rounded-full animate-spin" />
          <span>{PROGRESS_LABEL[progress]}</span>
        </div>
      ) : progress === "done" ? (
        <div className="flex items-center gap-2 mb-3 p-2.5 rounded-md bg-badge-success-background text-sm text-badge-success-text">
          <span>✅</span>
          <span>{t("mistakes_done_prefix") + plural(t, mistakes.length, "mistake")}</span>
        </div>
      ) : null}

      <p className="text-[11px] text-text-200 italic mb-3">
        {t("mistakes_click_hint")}
      </p>
      {mistakes.map((m, i) => (
        <MistakeCard
          key={i}
          mistake={m}
          enabled={state.enabled[i] ?? true}
          active={state.activeIndex === i}
          onToggle={() => dispatch({ type: "TOGGLE", index: i })}
          onActivate={() => dispatch({ type: "SET_ACTIVE", index: i })}
        />
      ))}
    </div>
  );
}
