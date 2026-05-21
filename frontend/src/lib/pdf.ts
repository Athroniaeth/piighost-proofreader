import * as pdfjsLib from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

export interface RenderedPage {
  pageIndex: number;
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  scale: number;
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function renderAllPages(
  bytes: Uint8Array,
  scale = 1.25
): Promise<RenderedPage[]> {
  // Clone the buffer: PDF.js transfers ownership of the ArrayBuffer to its
  // worker, detaching the original. Without a clone, React 19 StrictMode's
  // double-mount in dev (or any re-run of this effect) would re-use a
  // detached buffer and throw DataCloneError.
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(bytes) });
  const pdf = await loadingTask.promise;
  const out: RenderedPage[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvasContext: ctx, viewport }).promise;
    out.push({
      pageIndex: i - 1,
      canvas,
      width: viewport.width,
      height: viewport.height,
      scale,
    });
  }
  return out;
}
