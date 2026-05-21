import { useEffect } from "react";
import type { ProofreadResult } from "@/lib/types";
import { useMistakesStore } from "@/hooks/useMistakesStore";
import { useDebugMode } from "@/hooks/useDebugMode";
import TopBar from "./TopBar";
import PdfPanel from "./PdfPanel";
import MistakesPanel from "./MistakesPanel";
import DebugPanel from "./DebugPanel";

interface Props {
  data: ProofreadResult;
  onReset: () => void;
}

export default function ResultsState({ data, onReset }: Props) {
  const [mistakesState, dispatch] = useMistakesStore(data.mistakes.length);
  const debug = useDebugMode();

  // Re-initialise when the underlying mistakes list changes (e.g. new upload).
  useEffect(() => {
    dispatch({ type: "RESET", count: data.mistakes.length });
  }, [data.mistakes.length, dispatch]);

  return (
    <>
      <div className="max-w-6xl mx-auto px-4 sm:px-8 lg:px-12 py-6 lg:py-10">
        <TopBar
          filename={data.filename}
          mistakeCount={data.mistakes.length}
          onReset={onReset}
        />
        <div className="flex flex-col lg:flex-row gap-6 lg:h-[calc(100vh-200px)]">
          <div className="flex-1 overflow-y-auto bg-background-50 border border-base-100 rounded-xl p-6 min-h-[60vh] lg:min-h-0">
            <PdfPanel
              pdfBase64={data.pdf_base64}
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
            />
          </div>
        </div>
      </div>

      {debug.visible && <DebugPanel data={data} />}

      <button
        type="button"
        onClick={debug.toggle}
        title="Toggle debug panel"
        className="fixed bottom-4 right-4 px-3 py-1.5 text-xs rounded-md bg-foreground-100 text-white-100 opacity-30 hover:opacity-100 transition-opacity"
      >
        Debug
      </button>
    </>
  );
}
