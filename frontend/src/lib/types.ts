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

// Backend (phase 2) will additionally attach the located bbox + page to each
// mistake. Phase 1 fixtures already include them so the frontend can render.
export interface LocatedMistake extends Mistake {
  page: number;
  bbox: [number, number, number, number]; // (x0, y0, x1, y1) in PDF points
}

export interface PageSize {
  page: number;
  width_pt: number;
  height_pt: number;
}

export interface ProofreadResult {
  language: string;
  filename: string;
  page_count: number;
  page_sizes: PageSize[];
  mistakes: LocatedMistake[];
  pdf_base64: string;
  markdown_raw?: string;
  markdown_anonymized?: string;
  thread_id?: string;
  word_stream?: { page: number; text: string; bbox: [number, number, number, number] }[];
}
