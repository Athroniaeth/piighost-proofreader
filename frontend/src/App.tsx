import { useEffect } from "react";
import { useAppState, type AppAction } from "@/hooks/useAppState";
import { fakeMode } from "@/hooks/useDebugMode";
import { useResultStream } from "@/hooks/useResultStream";
import EmptyState from "@/components/EmptyState";
import LoadingState from "@/components/LoadingState";
import ErrorState from "@/components/ErrorState";
import ResultsState from "@/components/ResultsState";
import sampleResult from "@/fixtures/sample-result.json";
import samplePdfUrl from "@/fixtures/sample-cv.pdf?url";
import type { LocatedMistake, ProofreadResult } from "@/lib/types";

async function simulateStream(
  dispatch: (action: AppAction) => void,
  empty: boolean
) {
  const res = sampleResult as unknown as Omit<ProofreadResult, "unlocatable"> & {
    mistakes: LocatedMistake[];
  };
  const pdfResponse = await fetch(samplePdfUrl);
  const pdfBytes = new Uint8Array(await pdfResponse.arrayBuffer());
  dispatch({ type: "UPLOAD_STARTED", filename: res.filename });
  dispatch({
    type: "STREAM_META",
    meta: {
      filename: res.filename,
      language: res.language,
      page_count: res.page_count,
      page_sizes: res.page_sizes,
      thread_id: res.thread_id ?? "fake",
    },
    pdfBytes,
  });
  dispatch({ type: "STREAM_PROGRESS", step: "extracted" });
  await new Promise((r) => setTimeout(r, 100));
  dispatch({ type: "STREAM_PROGRESS", step: "anonymized" });
  await new Promise((r) => setTimeout(r, 100));
  dispatch({ type: "STREAM_PROGRESS", step: "llm-started" });
  const mistakes = empty ? [] : res.mistakes;
  for (const m of mistakes) {
    await new Promise((r) => setTimeout(r, 150));
    dispatch({ type: "STREAM_MISTAKE", mistake: m });
  }
  dispatch({
    type: "STREAM_DONE",
    counts: { mistake_count: mistakes.length, unlocatable_count: 0 },
  });
}

export default function App() {
  const [state, dispatch] = useAppState();
  const startStream = useResultStream(dispatch);

  useEffect(() => {
    if (state.kind !== "empty") return;
    const mode = fakeMode();
    if (mode === "off") return;
    simulateStream(dispatch, mode === "empty");
  }, [state.kind, dispatch]);

  switch (state.kind) {
    case "empty":
      return (
        <EmptyState
          onFile={(file) => startStream(file, false)}
          onReject={(r) => {
            if (r.reason === "too-large") {
              dispatch({
                type: "ERROR",
                reason: "too-large",
                details: { sizeMb: r.sizeMb },
              });
            } else {
              dispatch({ type: "ERROR", reason: "not-pdf" });
            }
          }}
        />
      );
    case "loading":
      return <LoadingState />;
    case "error":
      return (
        <ErrorState
          reason={state.reason}
          details={state.details}
          onReset={() => dispatch({ type: "RESET" })}
        />
      );
    case "results":
      return (
        <ResultsState
          data={state.data}
          pdfBytes={state.pdfBytes}
          streaming={state.streaming}
          progress={state.progress}
          onReset={() => dispatch({ type: "RESET" })}
        />
      );
  }
}
