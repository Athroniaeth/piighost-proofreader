import { useReducer } from "react";
import type {
  DetectPiiResponse,
  LocatedMistake,
  Mistake,
  OverrideEntry,
  PageDetection,
  PageSize,
  ProgressStep,
  ProofreadResult,
} from "@/lib/types";

export type ErrorReason =
  | "too-large"
  | "not-pdf"
  | "no-text-layer"
  | "backend-down"
  | "rate-limit"
  | "internal";

export interface ErrorDetails {
  sizeMb?: number;
  retryInSec?: number;
  message?: string;
}

export interface MetaPayload {
  filename: string;
  language: string;
  page_count: number;
  page_sizes: PageSize[];
  thread_id: string;
}

export interface DebugPayload {
  markdown_raw: string;
  markdown_anonymized: string;
  word_stream: { page: number; text: string; bbox: [number, number, number, number] }[];
}

export type AppState =
  | { kind: "empty" }
  | { kind: "loading-detect"; filename: string }
  | {
      kind: "reviewing";
      filename: string;
      file: File;
      pdfBytes: Uint8Array;
      thread_id: string;
      language: string;
      page_count: number;
      page_sizes: PageSize[];
      markdown: string;
      detections: PageDetection[];
      pendingOverrides: OverrideEntry[];
    }
  | {
      kind: "loading-proofread";
      filename: string;
      file: File;
      thread_id: string;
      overrides: OverrideEntry[];
    }
  | {
      kind: "results";
      data: ProofreadResult;
      pdfBytes: Uint8Array;
      streaming: boolean;
      progress: ProgressStep;
    }
  | { kind: "error"; reason: ErrorReason; details?: ErrorDetails };

export type AppAction =
  | { type: "UPLOAD_STARTED"; filename: string }
  | { type: "DETECT_LOADED"; payload: DetectPiiResponse; file: File; pdfBytes: Uint8Array }
  | {
      type: "OVERRIDE_ADD";
      text: string;
      label: string;
      page?: number;
      bbox?: [number, number, number, number];
    }
  | { type: "OVERRIDE_REMOVE_DETECTION"; detection: PageDetection }
  | { type: "OVERRIDE_RELABEL"; detection: PageDetection; newLabel: string }
  | { type: "REVIEW_SUBMIT" }
  | { type: "STREAM_META"; meta: MetaPayload; pdfBytes: Uint8Array }
  | { type: "STREAM_PROGRESS"; step: ProgressStep }
  | { type: "STREAM_MISTAKE"; mistake: LocatedMistake }
  | { type: "STREAM_UNLOCATABLE"; mistake: Mistake }
  | { type: "STREAM_DEBUG"; debug: DebugPayload }
  | { type: "STREAM_DONE"; counts: { mistake_count: number; unlocatable_count: number } }
  | { type: "ERROR"; reason: ErrorReason; details?: ErrorDetails }
  | { type: "RESET" };

export const initialAppState: AppState = { kind: "empty" };

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "UPLOAD_STARTED":
      return { kind: "loading-detect", filename: action.filename };

    case "DETECT_LOADED": {
      const p = action.payload;
      return {
        kind: "reviewing",
        filename: state.kind === "loading-detect" ? state.filename : p.detections[0]?.text ?? "cv.pdf",
        file: action.file,
        pdfBytes: action.pdfBytes,
        thread_id: p.thread_id,
        language: p.language,
        page_count: p.page_count,
        page_sizes: p.page_sizes,
        markdown: p.markdown,
        detections: p.detections,
        pendingOverrides: [],
      };
    }

    case "OVERRIDE_ADD":
      if (state.kind !== "reviewing") return state;
      return {
        ...state,
        pendingOverrides: [
          ...state.pendingOverrides,
          {
            text: action.text,
            label: action.label,
            page: action.page,
            bbox: action.bbox,
          },
        ],
      };

    case "OVERRIDE_REMOVE_DETECTION":
      if (state.kind !== "reviewing") return state;
      return {
        ...state,
        pendingOverrides: [
          ...state.pendingOverrides,
          { text: action.detection.text, label: action.detection.label, remove: true },
        ],
      };

    case "OVERRIDE_RELABEL":
      if (state.kind !== "reviewing") return state;
      return {
        ...state,
        pendingOverrides: [
          ...state.pendingOverrides,
          { text: action.detection.text, label: action.detection.label, remove: true },
          { text: action.detection.text, label: action.newLabel },
        ],
      };

    case "REVIEW_SUBMIT":
      if (state.kind !== "reviewing") return state;
      return {
        kind: "loading-proofread",
        filename: state.filename,
        file: state.file,
        thread_id: state.thread_id,
        overrides: state.pendingOverrides,
      };

    case "STREAM_META": {
      const data: ProofreadResult = {
        ...action.meta,
        mistakes: [],
        unlocatable: [],
      };
      return {
        kind: "results",
        data,
        pdfBytes: action.pdfBytes,
        streaming: true,
        progress: "extracted",
      };
    }

    case "STREAM_PROGRESS":
      if (state.kind !== "results") return state;
      return { ...state, progress: action.step };

    case "STREAM_MISTAKE":
      if (state.kind !== "results") return state;
      return {
        ...state,
        data: { ...state.data, mistakes: [...state.data.mistakes, action.mistake] },
      };

    case "STREAM_UNLOCATABLE":
      if (state.kind !== "results") return state;
      return {
        ...state,
        data: { ...state.data, unlocatable: [...state.data.unlocatable, action.mistake] },
      };

    case "STREAM_DEBUG":
      if (state.kind !== "results") return state;
      return { ...state, data: { ...state.data, ...action.debug } };

    case "STREAM_DONE":
      if (state.kind !== "results") return state;
      return { ...state, streaming: false, progress: "done" };

    case "ERROR":
      return { kind: "error", reason: action.reason, details: action.details };

    case "RESET":
      return { kind: "empty" };
  }
}

export function useAppState() {
  return useReducer(appReducer, initialAppState);
}
