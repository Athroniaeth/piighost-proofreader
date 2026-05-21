import { useCallback } from "react";
import { parseSSE } from "@/lib/parseSSE";
import type { AppAction, ErrorReason } from "./useAppState";
import type { LocatedMistake, Mistake } from "@/lib/types";

interface MetaData {
  filename: string;
  language: string;
  page_count: number;
  page_sizes: { page: number; width_pt: number; height_pt: number }[];
  thread_id: string;
}

interface DebugData {
  markdown_raw: string;
  markdown_anonymized: string;
  word_stream: { page: number; text: string; bbox: [number, number, number, number] }[];
}

export function useResultStream(dispatch: (action: AppAction) => void) {
  return useCallback(
    async (file: File, debug: boolean) => {
      dispatch({ type: "UPLOAD_STARTED", filename: file.name });
      const pdfBytes = new Uint8Array(await file.arrayBuffer());
      const formData = new FormData();
      formData.append("file", file);
      const url = `/api/proofread${debug ? "?debug=1" : ""}`;

      let response: Response;
      try {
        response = await fetch(url, { method: "POST", body: formData });
      } catch (e) {
        dispatch({
          type: "ERROR",
          reason: "backend-down",
          details: { message: String(e) },
        });
        return;
      }
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const reason: ErrorReason = (body.reason as ErrorReason) ?? "internal";
        dispatch({
          type: "ERROR",
          reason,
          details: { sizeMb: body.size_mb, message: body.message },
        });
        return;
      }
      if (!response.body) {
        dispatch({ type: "ERROR", reason: "internal" });
        return;
      }
      for await (const event of parseSSE(response.body)) {
        switch (event.name) {
          case "meta":
            dispatch({
              type: "STREAM_META",
              meta: event.data as MetaData,
              pdfBytes,
            });
            break;
          case "progress":
            dispatch({
              type: "STREAM_PROGRESS",
              step: (event.data as { step: never }).step,
            });
            break;
          case "mistake":
            dispatch({
              type: "STREAM_MISTAKE",
              mistake: event.data as LocatedMistake,
            });
            break;
          case "unlocatable":
            dispatch({
              type: "STREAM_UNLOCATABLE",
              mistake: event.data as Mistake,
            });
            break;
          case "debug":
            dispatch({
              type: "STREAM_DEBUG",
              debug: event.data as DebugData,
            });
            break;
          case "done":
            dispatch({
              type: "STREAM_DONE",
              counts: event.data as { mistake_count: number; unlocatable_count: number },
            });
            break;
          case "error": {
            const d = event.data as { reason: ErrorReason; message?: string };
            dispatch({
              type: "ERROR",
              reason: d.reason ?? "internal",
              details: { message: d.message },
            });
            return;
          }
        }
      }
    },
    [dispatch]
  );
}
