// Mirror of proofreader/models.py — keep field names byte-identical.

export type MistakeType =
  | "orthographe"
  | "grammaire"
  | "conjugaison"
  | "accord"
  | "ponctuation";

export interface Mistake {
  error_text: string;
  correction: string;
  description: string;
  type: MistakeType;
  context_before: string;
}

export interface LocatedMistake extends Mistake {
  page: number;
  bbox: [number, number, number, number]; // (x0, y0, x1, y1) in PDF points
}

export interface PageSize {
  page: number;
  width_pt: number;
  height_pt: number;
}

export type ProgressStep = "extracted" | "anonymized" | "llm-started" | "done";

export interface Detection {
  text: string;
  label: string;
  start_pos: number;
  end_pos: number;
  confidence: number;
}

export interface PageDetection extends Detection {
  page: number;
  bbox: [number, number, number, number] | null;
  manual?: boolean;
}

export interface OverrideEntry {
  text: string;
  label: string;
  remove?: boolean;
  // Frontend-only hint: where the user's selection landed on the PDF.
  // Used by applyOverrides to render the blue highlight immediately in
  // review mode. The backend ignores these fields — it re-locates all
  // occurrences from the markdown via markdown.find().
  page?: number;
  bbox?: [number, number, number, number];
}

export interface DetectPiiResponse {
  thread_id: string;
  language: string;
  page_count: number;
  page_sizes: PageSize[];
  markdown: string;
  detections: PageDetection[];
}

export interface ProofreadResult {
  language: string;
  filename: string;
  page_count: number;
  page_sizes: PageSize[];
  mistakes: LocatedMistake[];
  unlocatable: Mistake[];
  markdown_raw?: string;
  markdown_anonymized?: string;
  thread_id?: string;
  word_stream?: { page: number; text: string; bbox: [number, number, number, number] }[];
}
