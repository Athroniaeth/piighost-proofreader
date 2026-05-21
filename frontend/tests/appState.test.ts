import { describe, it, expect } from "vitest";
import { appReducer, initialAppState, type AppState } from "@/hooks/useAppState";
import type { LocatedMistake, Mistake } from "@/lib/types";

const META = {
  filename: "cv.pdf",
  language: "fr",
  page_count: 1,
  page_sizes: [{ page: 0, width_pt: 595, height_pt: 842 }],
  thread_id: "uuid-x",
};
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
const SAMPLE_MISTAKE: LocatedMistake = {
  error_text: "x",
  correction: "y",
  description: "d",
  type: "orthographe",
  context_before: "c",
  page: 0,
  bbox: [10, 20, 30, 40],
};
const SAMPLE_UNLOCATABLE: Mistake = {
  error_text: "u",
  correction: "v",
  description: "e",
  type: "grammaire",
  context_before: "c",
};

describe("appReducer", () => {
  it("starts empty", () => {
    expect(initialAppState).toEqual({ kind: "empty" });
  });

  it("UPLOAD_STARTED transitions empty → loading", () => {
    expect(appReducer({ kind: "empty" }, { type: "UPLOAD_STARTED", filename: "cv.pdf" })).toEqual({
      kind: "loading",
      filename: "cv.pdf",
    });
  });

  it("STREAM_META from loading transitions to results with empty lists and streaming=true", () => {
    const start: AppState = { kind: "loading", filename: "cv.pdf" };
    const next = appReducer(start, { type: "STREAM_META", meta: META, pdfBytes: PDF_BYTES });
    expect(next.kind).toBe("results");
    if (next.kind !== "results") return;
    expect(next.streaming).toBe(true);
    expect(next.progress).toBe("extracted");
    expect(next.data.mistakes).toEqual([]);
    expect(next.data.unlocatable).toEqual([]);
    expect(next.pdfBytes).toBe(PDF_BYTES);
  });

  it("STREAM_PROGRESS updates progress without leaving results", () => {
    const start = appReducer(
      { kind: "loading", filename: "cv.pdf" },
      { type: "STREAM_META", meta: META, pdfBytes: PDF_BYTES }
    );
    const next = appReducer(start, { type: "STREAM_PROGRESS", step: "anonymized" });
    expect(next.kind).toBe("results");
    if (next.kind !== "results") return;
    expect(next.progress).toBe("anonymized");
  });

  it("STREAM_MISTAKE appends to data.mistakes", () => {
    const after_meta = appReducer(
      { kind: "loading", filename: "cv.pdf" },
      { type: "STREAM_META", meta: META, pdfBytes: PDF_BYTES }
    );
    const next = appReducer(after_meta, { type: "STREAM_MISTAKE", mistake: SAMPLE_MISTAKE });
    expect(next.kind).toBe("results");
    if (next.kind !== "results") return;
    expect(next.data.mistakes).toEqual([SAMPLE_MISTAKE]);
  });

  it("STREAM_UNLOCATABLE appends to data.unlocatable", () => {
    const after_meta = appReducer(
      { kind: "loading", filename: "cv.pdf" },
      { type: "STREAM_META", meta: META, pdfBytes: PDF_BYTES }
    );
    const next = appReducer(after_meta, {
      type: "STREAM_UNLOCATABLE",
      mistake: SAMPLE_UNLOCATABLE,
    });
    expect(next.kind).toBe("results");
    if (next.kind !== "results") return;
    expect(next.data.unlocatable).toEqual([SAMPLE_UNLOCATABLE]);
  });

  it("STREAM_DEBUG merges debug fields into data", () => {
    const after_meta = appReducer(
      { kind: "loading", filename: "cv.pdf" },
      { type: "STREAM_META", meta: META, pdfBytes: PDF_BYTES }
    );
    const next = appReducer(after_meta, {
      type: "STREAM_DEBUG",
      debug: {
        markdown_raw: "raw",
        markdown_anonymized: "anon",
        word_stream: [{ page: 0, text: "Voici", bbox: [10, 20, 30, 40] }],
      },
    });
    expect(next.kind).toBe("results");
    if (next.kind !== "results") return;
    expect(next.data.markdown_raw).toBe("raw");
    expect(next.data.markdown_anonymized).toBe("anon");
    expect(next.data.word_stream).toHaveLength(1);
  });

  it("STREAM_DONE flips streaming to false and progress to done", () => {
    const after_meta = appReducer(
      { kind: "loading", filename: "cv.pdf" },
      { type: "STREAM_META", meta: META, pdfBytes: PDF_BYTES }
    );
    const next = appReducer(after_meta, {
      type: "STREAM_DONE",
      counts: { mistake_count: 1, unlocatable_count: 0 },
    });
    expect(next.kind).toBe("results");
    if (next.kind !== "results") return;
    expect(next.streaming).toBe(false);
    expect(next.progress).toBe("done");
  });

  it("ERROR from any state transitions to error", () => {
    expect(
      appReducer({ kind: "loading", filename: "x" }, {
        type: "ERROR",
        reason: "backend-down",
      })
    ).toEqual({ kind: "error", reason: "backend-down", details: undefined });
  });

  it("RESET returns to empty", () => {
    expect(appReducer({ kind: "error", reason: "not-pdf" }, { type: "RESET" })).toEqual({
      kind: "empty",
    });
  });
});
