import type { LocatedMistake } from "@/lib/types";
import type { MistakesState, MistakesAction } from "@/hooks/useMistakesStore";
import MistakeCard from "./MistakeCard";
import { Checkbox } from "@/components/tailgrids/core/checkbox";

interface Props {
  mistakes: LocatedMistake[];
  state: MistakesState;
  dispatch: (action: MistakesAction) => void;
}

export default function MistakesPanel({ mistakes, state, dispatch }: Props) {
  if (mistakes.length === 0) {
    return (
      <div className="h-full flex items-center justify-center px-8">
        <div className="text-center max-w-[240px]">
          <div className="text-3xl mb-3">✅</div>
          <div className="text-lg font-semibold mb-2">
            Aucune faute détectée
          </div>
          <div className="text-base text-text-100 leading-relaxed">
            Le LLM a analysé votre CV et n'a rien trouvé à corriger.
          </div>
        </div>
      </div>
    );
  }

  const visible = state.enabled.filter(Boolean).length;
  const allChecked = visible === mistakes.length;

  return (
    <div>
      <div className="flex items-center gap-3 mb-1 pb-3 border-b border-base-100">
        <Checkbox
          checked={allChecked}
          onChange={() =>
            dispatch({ type: "SET_ALL", enabled: !allChecked })
          }
        />
        <span className="text-xs text-text-100">Tout cocher / décocher</span>
        <span className="text-xs text-text-100 ml-auto">
          {visible} / {mistakes.length} visibles
        </span>
      </div>
      <p className="text-[11px] text-text-200 italic mb-3">
        Cliquez sur une faute pour la mettre en évidence sur le PDF.
      </p>
      {mistakes.map((m, i) => (
        <MistakeCard
          key={i}
          mistake={m}
          enabled={state.enabled[i]}
          active={state.activeIndex === i}
          onToggle={() => dispatch({ type: "TOGGLE", index: i })}
          onActivate={() => dispatch({ type: "SET_ACTIVE", index: i })}
        />
      ))}
    </div>
  );
}
