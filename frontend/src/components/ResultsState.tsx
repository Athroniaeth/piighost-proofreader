import { useEffect } from "react";
import type { ProgressStep, ProofreadResult } from "@/lib/types";
import { useMistakesStore } from "@/hooks/useMistakesStore";
import { useDebugMode } from "@/hooks/useDebugMode";
import TopBar from "./TopBar";
import PdfPanel from "./PdfPanel";
import MistakesPanel from "./MistakesPanel";
import DebugPanel from "./DebugPanel";

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
    <div className="min-h-screen flex flex-col max-w-6xl mx-auto px-4 sm:px-8 lg:px-12 py-6 lg:py-10">
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
      <div className="lg:flex-1 flex flex-col lg:flex-row gap-6 lg:min-h-0">
        <div className="flex-1 overflow-y-auto bg-background-50 border border-base-100 rounded-xl p-6 min-h-[60vh] lg:min-h-0">
          <PdfPanel
            pdfBytes={pdfBytes}
            pageSizes={data.page_sizes}
            mistakes={data.mistakes}
            enabled={mistakesState.enabled}
            activeIndex={mistakesState.activeIndex}
          />
        </div>
        <div className="flex-1 overflow-y-auto bg-background-50 border border-base-100 rounded-xl p-5 min-h-[40vh] lg:min-h-0">
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
