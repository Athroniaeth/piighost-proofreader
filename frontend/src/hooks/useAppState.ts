import { useReducer } from "react";
import type { LocatedMistake, Mistake, PageSize, ProgressStep, ProofreadResult } from "@/lib/types";

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
  | { kind: "loading"; filename: string }
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
      return { kind: "loading", filename: action.filename };
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
