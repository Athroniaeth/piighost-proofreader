import { describe, it, expect } from "vitest";
import { appReducer, initialAppState, type AppState } from "@/hooks/useAppState";
import type { ProofreadResult } from "@/lib/types";

const fakeResult = (filename: string): ProofreadResult => ({
  language: "fr",
  filename,
  page_count: 1,
  page_sizes: [{ page: 0, width_pt: 595, height_pt: 842 }],
  mistakes: [],
  pdf_base64: "",
});

describe("appReducer", () => {
  it("starts in the empty state", () => {
    expect(initialAppState).toEqual({ kind: "empty" });
  });

  it("transitions empty → loading on UPLOAD_STARTED", () => {
    const next = appReducer({ kind: "empty" }, { type: "UPLOAD_STARTED", filename: "cv.pdf" });
    expect(next).toEqual({ kind: "loading", filename: "cv.pdf" });
  });

  it("transitions loading → results on RESULT_RECEIVED", () => {
    const start: AppState = { kind: "loading", filename: "cv.pdf" };
    const next = appReducer(start, {
      type: "RESULT_RECEIVED",
      data: fakeResult("cv.pdf"),
    });
    expect(next.kind).toBe("results");
  });

  it("transitions any state → error on ERROR", () => {
    const next = appReducer(
      { kind: "loading", filename: "x" },
      { type: "ERROR", reason: "too-large", details: { sizeMb: 12.3 } }
    );
    expect(next).toEqual({
      kind: "error",
      reason: "too-large",
      details: { sizeMb: 12.3 },
    });
  });

  it("RESET returns to empty regardless of current state", () => {
    expect(appReducer({ kind: "error", reason: "not-pdf" }, { type: "RESET" })).toEqual({
      kind: "empty",
    });
  });
});
