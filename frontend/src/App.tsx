import { useEffect } from "react";
import { useAppState, type AppAction } from "@/hooks/useAppState";
import { fakeMode, isDebugAvailable } from "@/hooks/useDebugMode";
import { useDetectPii } from "@/hooks/useDetectPii";
import { useResultStream } from "@/hooks/useResultStream";
import EmptyState from "@/components/EmptyState";
import LoadingState from "@/components/LoadingState";
import ErrorState from "@/components/ErrorState";
import ResultsState from "@/components/ResultsState";
import ReviewState from "@/components/ReviewState";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import sampleResult from "@/fixtures/sample-result.json";
import sampleDetections from "@/fixtures/sample-detections.json";
import samplePdfUrl from "@/fixtures/sample-cv.pdf?url";
import type { DetectPiiResponse, LocatedMistake, ProofreadResult } from "@/lib/types";

async function simulateDetect(dispatch: (a: AppAction) => void) {
  const fakeFile = new File([new Uint8Array(0)], "fake-cv.pdf", { type: "application/pdf" });
  const pdfResponse = await fetch(samplePdfUrl);
  const pdfBytes = new Uint8Array(await pdfResponse.arrayBuffer());
  dispatch({ type: "UPLOAD_STARTED", filename: "fake-cv.pdf" });
  await new Promise((r) => setTimeout(r, 200));
  dispatch({
    type: "DETECT_LOADED",
    payload: sampleDetections as unknown as DetectPiiResponse,
    file: fakeFile,
    pdfBytes,
  });
}

async function simulateStreamAfterSubmit(
  dispatch: (a: AppAction) => void,
  empty: boolean
) {
  const res = sampleResult as unknown as Omit<ProofreadResult, "unlocatable"> & {
    mistakes: LocatedMistake[];
  };
  const pdfResponse = await fetch(samplePdfUrl);
  const pdfBytes = new Uint8Array(await pdfResponse.arrayBuffer());
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
  const startDetect = useDetectPii(dispatch);
  const startStream = useResultStream(dispatch);
  const fake = fakeMode();

  useEffect(() => {
    if (state.kind === "empty" && fake !== "off") {
      simulateDetect(dispatch);
    }
  }, [state.kind, fake, dispatch]);

  useEffect(() => {
    if (state.kind !== "loading-proofread") return;
    if (fake !== "off") {
      simulateStreamAfterSubmit(dispatch, fake === "empty");
    } else {
      startStream(state.file, state.thread_id, state.overrides, isDebugAvailable());
    }
  }, [state, fake, dispatch, startStream]);

  const screen = (() => {
    switch (state.kind) {
      case "empty":
        return (
          <EmptyState
            onFile={(file) => startDetect(file)}
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
      case "loading-detect":
        return <LoadingState currentStep={1} messageKey="loading_steps_detect" />;
      case "reviewing":
        return (
          <ReviewState
            filename={state.filename}
            pdfBytes={state.pdfBytes}
            page_sizes={state.page_sizes}
            detections={state.detections}
            pendingOverrides={state.pendingOverrides}
            dispatch={dispatch}
          />
        );
      case "loading-proofread":
        return <LoadingState currentStep={2} messageKey="loading_steps_proofread" />;
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
  })();

  return (
    <>
      <LanguageSwitcher />
      {screen}
    </>
  );
}
