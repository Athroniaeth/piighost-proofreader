import { useCallback } from "react";
import type { AppAction, ErrorReason } from "./useAppState";
import type { DetectPiiResponse } from "@/lib/types";

export function useDetectPii(dispatch: (action: AppAction) => void) {
  return useCallback(
    async (file: File) => {
      dispatch({ type: "UPLOAD_STARTED", filename: file.name });
      const pdfBytes = new Uint8Array(await file.arrayBuffer());
      const formData = new FormData();
      formData.append("file", file);
      let response: Response;
      try {
        response = await fetch("/api/detect-pii", {
          method: "POST",
          body: formData,
        });
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
      const data: DetectPiiResponse = await response.json();
      dispatch({ type: "DETECT_LOADED", payload: data, file, pdfBytes });
    },
    [dispatch]
  );
}
