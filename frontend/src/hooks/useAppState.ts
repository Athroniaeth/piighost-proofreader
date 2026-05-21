import { useReducer } from "react";
import type { ProofreadResult } from "@/lib/types";

export type ErrorReason =
  | "too-large"
  | "not-pdf"
  | "no-text-layer"
  | "backend-down"
  | "rate-limit";

export interface ErrorDetails {
  sizeMb?: number;
  retryInSec?: number;
}

export type AppState =
  | { kind: "empty" }
  | { kind: "loading"; filename: string }
  | { kind: "results"; data: ProofreadResult }
  | { kind: "error"; reason: ErrorReason; details?: ErrorDetails };

export type AppAction =
  | { type: "UPLOAD_STARTED"; filename: string }
  | { type: "RESULT_RECEIVED"; data: ProofreadResult }
  | { type: "ERROR"; reason: ErrorReason; details?: ErrorDetails }
  | { type: "RESET" };

export const initialAppState: AppState = { kind: "empty" };

export function appReducer(_state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "UPLOAD_STARTED":
      return { kind: "loading", filename: action.filename };
    case "RESULT_RECEIVED":
      return { kind: "results", data: action.data };
    case "ERROR":
      return { kind: "error", reason: action.reason, details: action.details };
    case "RESET":
      return { kind: "empty" };
  }
}

export function useAppState() {
  return useReducer(appReducer, initialAppState);
}
