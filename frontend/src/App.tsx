import { useEffect } from "react";
import { useAppState } from "@/hooks/useAppState";
import { fakeMode } from "@/hooks/useDebugMode";
import EmptyState from "@/components/EmptyState";
import LoadingState from "@/components/LoadingState";
import ErrorState from "@/components/ErrorState";
import ResultsState from "@/components/ResultsState";
import sampleResult from "@/fixtures/sample-result.json";
import type { ProofreadResult } from "@/lib/types";

export default function App() {
  const [state, dispatch] = useAppState();

  // ?fake=1 → fixture as-is. ?fake=empty → same PDF but no mistakes.
  useEffect(() => {
    if (state.kind !== "empty") return;
    const mode = fakeMode();
    if (mode === "off") return;
    const base = sampleResult as ProofreadResult;
    const data: ProofreadResult =
      mode === "empty" ? { ...base, mistakes: [] } : base;
    dispatch({ type: "RESULT_RECEIVED", data });
  }, [state.kind, dispatch]);

  // After upload, fake the backend roundtrip with a 1 s timer.
  useEffect(() => {
    if (state.kind !== "loading") return;
    const timer = setTimeout(() => {
      const data: ProofreadResult = {
        ...(sampleResult as ProofreadResult),
        filename: state.filename,
      };
      dispatch({ type: "RESULT_RECEIVED", data });
    }, 1000);
    return () => clearTimeout(timer);
  }, [state, dispatch]);

  switch (state.kind) {
    case "empty":
      return (
        <EmptyState
          onFile={(file) =>
            dispatch({ type: "UPLOAD_STARTED", filename: file.name })
          }
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
        <ResultsState data={state.data} onReset={() => dispatch({ type: "RESET" })} />
      );
  }
}
