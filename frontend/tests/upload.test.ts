import { describe, it, expect } from "vitest";
import { validateFile, MAX_BYTES } from "@/lib/upload";

function fakeFile(name: string, type: string, sizeBytes: number): File {
  const f = new File([new Uint8Array(0)], name, { type });
  Object.defineProperty(f, "size", { value: sizeBytes });
  return f;
}

describe("validateFile", () => {
  it("accepts a PDF under the size limit", () => {
    const file = fakeFile("cv.pdf", "application/pdf", 1024 * 1024);
    expect(validateFile(file)).toEqual({ ok: true, file });
  });

  it("rejects non-PDF mime types", () => {
    const file = fakeFile("cv.txt", "text/plain", 100);
    expect(validateFile(file)).toEqual({ ok: false, reason: "not-pdf" });
  });

  it("rejects files above MAX_BYTES with size in MB", () => {
    const file = fakeFile("big.pdf", "application/pdf", 11 * 1024 * 1024);
    const result = validateFile(file);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("too-large");
      if (result.reason === "too-large") {
        expect(result.sizeMb).toBeCloseTo(11, 1);
      }
    }
  });

  it("exposes MAX_BYTES = 10 MB", () => {
    expect(MAX_BYTES).toBe(10 * 1024 * 1024);
  });
});
