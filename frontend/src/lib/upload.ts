export const MAX_BYTES = 10 * 1024 * 1024;

export type ValidationResult =
  | { ok: true; file: File }
  | { ok: false; reason: "not-pdf" }
  | { ok: false; reason: "too-large"; sizeMb: number };

export function validateFile(file: File): ValidationResult {
  if (file.type !== "application/pdf") {
    return { ok: false, reason: "not-pdf" };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, reason: "too-large", sizeMb: file.size / 1024 / 1024 };
  }
  return { ok: true, file };
}
