import { useEffect } from "react";
import type { ProgressStep, ProofreadResult } from "@/lib/types";
import { useMistakesStore } from "@/hooks/useMistakesStore";
import { useDebugMode } from "@/hooks/useDebugMode";
import TopBar from "./TopBar";
import PdfPanel from "./PdfPanel";
import MistakesPanel from "./MistakesPanel";
import DebugPanel from "./DebugPanel";
import StepIndicator from "./StepIndicator";

interface Props {
  data: ProofreadResult;
  pdfBytes: Uint8Array;
  streaming: boolean;
  progress: ProgressStep;
  onReset: () => void;
}

export default function ResultsState({ data, pdfBytes, streaming, progress, onReset }: Props) {
  const [mistakesState, dispatch] = useMistakesStore(data.mistakes.length);
  const debug = useDebugMode();

  useEffect(() => {
    dispatch({ type: "RESET", count: data.mistakes.length });
  }, [data.mistakes.length, dispatch]);

  return (
    <div className="min-h-screen flex flex-col max-w-[1280px] mx-auto px-3 sm:px-4 lg:px-6 py-6 lg:py-8">
      <StepIndicator current={streaming ? 2 : 3} />
      <TopBar
        filename={data.filename}
        mistakeCount={data.mistakes.length}
        streaming={streaming}
        debugAvailable={debug.available}
        debugVisible={debug.visible}
        onToggleDebug={debug.toggle}
        onReset={onReset}
      />
      {debug.available && debug.visible && <DebugPanel data={data} />}
      <div className="lg:flex-1 flex flex-col lg:flex-row gap-4 lg:min-h-0">
        <div className="lg:flex-[2] overflow-y-auto bg-background-50 border border-base-100 rounded-xl p-4 min-h-[60vh] lg:min-h-0">
          <PdfPanel
            pdfBytes={pdfBytes}
            pageSizes={data.page_sizes}
            variant="mistake"
            items={data.mistakes.map((m, i) => ({
              kind: "mistake" as const,
              m,
              enabled: mistakesState.enabled[i] ?? true,
            }))}
            activeIndex={mistakesState.activeIndex}
          />
        </div>
        <div className="lg:flex-1 overflow-y-auto bg-background-50 border border-base-100 rounded-xl p-5 min-h-[40vh] lg:min-h-0">
          <MistakesPanel
            mistakes={data.mistakes}
            state={mistakesState}
            dispatch={dispatch}
            streaming={streaming}
            progress={progress}
          />
        </div>
      </div>
    </div>
  );
}
