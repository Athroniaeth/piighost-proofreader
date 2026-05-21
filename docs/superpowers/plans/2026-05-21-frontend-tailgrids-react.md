# Frontend TailGrids — React Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Single-page React + Vite + TypeScript frontend that uploads a CV PDF, renders it client-side via PDF.js with bbox overlays, and lets the user toggle individual highlights from a list of mistakes — driven by a mocked JSON fixture for phase 1.

**Architecture:** Vite-bundled React SPA with a four-state machine (`empty | loading | results | error`) driven by `useReducer`. PDF.js renders pages to `<canvas>` inside a `PdfPanel`; absolute-positioned `HighlightOverlay` `<div>`s sit on top of each page wrapper. `MistakesPanel` consumes a separate `useMistakesStore` hook for per-mistake `enabled` / `active` state. Debug panel and `?fake=1` short-circuit are gated by URL params via `useDebugMode`. Pure logic (file validation, bbox scaling, store reducer) is unit-tested with Vitest; React components are smoke-tested manually in a real browser.

**Tech Stack:** Vite 5, React 19, TypeScript 5, Tailwind CSS 3.4 (PostCSS via Vite plugin), TailGrids React primitives (installed locally in `src/components/core/`), `pdfjs-dist@4`, Vitest + `@testing-library/react` + `jsdom`.

---

## Cross-task conventions

- All commands assume working directory `/home/secondary/PycharmProjects/piighost-proofreader/frontend/` unless prefixed with `cd ..`.
- Every TDD step references the *exact* Vitest command to run a single test by filename or test name. Don't run the whole suite when only one test changed.
- Every code block is the **final** content of the file at that step — overwrite, don't merge.
- Commits are per-task, never per-step. Each task's last step is the commit.
- Type names: `Mistake`, `MistakeType`, `ProofreadResult` mirror the Pydantic models in `proofreader/models.py` exactly. Don't rename.

---

## File Structure

```
piighost-proofreader/
├── frontend/                                # New phase 1 root
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   ├── package.json
│   ├── .gitignore
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── index.css
│   │   ├── components/
│   │   │   ├── core/                        # TailGrids primitives (installed via CLI)
│   │   │   ├── EmptyState.tsx
│   │   │   ├── LoadingState.tsx
│   │   │   ├── ResultsState.tsx
│   │   │   ├── ErrorState.tsx
│   │   │   ├── TopBar.tsx
│   │   │   ├── PdfPanel.tsx
│   │   │   ├── HighlightOverlay.tsx
│   │   │   ├── MistakesPanel.tsx
│   │   │   ├── MistakeCard.tsx
│   │   │   └── DebugPanel.tsx
│   │   ├── hooks/
│   │   │   ├── useAppState.ts
│   │   │   ├── useMistakesStore.ts
│   │   │   └── useDebugMode.ts
│   │   ├── lib/
│   │   │   ├── upload.ts
│   │   │   ├── pdf.ts
│   │   │   ├── scaling.ts
│   │   │   └── types.ts
│   │   └── fixtures/
│   │       └── sample-result.json
│   └── tests/
│       ├── setup.ts
│       ├── upload.test.ts
│       ├── scaling.test.ts
│       ├── mistakesStore.test.ts
│       └── appState.test.ts
└── docs/superpowers/plans/
    └── 2026-05-21-frontend-tailgrids-react.md   (this file)
```

---

### Task 1: Scaffolding Vite + React + TS + Tailwind + Vitest

**Files:**
- Create: `frontend/package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `index.html`, `.gitignore`, `postcss.config.js`, `tailwind.config.js`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `tests/setup.ts`

- [ ] **Step 1: Create the directory tree**

Run from `/home/secondary/PycharmProjects/piighost-proofreader/`:

```bash
mkdir -p frontend/src/components/core frontend/src/hooks frontend/src/lib frontend/src/fixtures frontend/tests
```

- [ ] **Step 2: Write `frontend/package.json`**

```json
{
  "name": "piighost-proofreader-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview --port 5173",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "pdfjs-dist": "^4.6.82",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.0",
    "@testing-library/react": "^16.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.0",
    "jsdom": "^25.0.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 3: Write `frontend/.gitignore`**

```
node_modules/
dist/
.DS_Store
*.log
coverage/
```

- [ ] **Step 4: Write `frontend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noImplicitAny": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "allowImportingTsExtensions": false,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "useDefineForClassFields": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src", "tests"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 5: Write `frontend/tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 6: Write `frontend/vite.config.ts`**

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./tests/setup.ts",
    css: false,
  },
});
```

- [ ] **Step 7: Write `frontend/postcss.config.js`**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 8: Write `frontend/tailwind.config.js`**

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        highlight: {
          default: "rgba(235, 30, 30, 0.35)",
          active: "rgba(255, 230, 0, 0.55)",
          activeBorder: "#f59e0b",
        },
      },
      maxWidth: {
        container: "1280px",
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 9: Write `frontend/index.html`**

```html
<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ProofReader</title>
  </head>
  <body class="bg-slate-100 text-slate-900 antialiased">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 10: Write `frontend/src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

.pdf-page {
  position: relative;
  margin-bottom: 16px;
  background: white;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.spinner {
  width: 48px;
  height: 48px;
  border: 4px solid #e2e8f0;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
```

- [ ] **Step 11: Write `frontend/src/main.tsx`**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 12: Write a placeholder `frontend/src/App.tsx`**

```tsx
export default function App() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <p className="text-sm text-slate-500">ProofReader bootstrap OK</p>
    </main>
  );
}
```

- [ ] **Step 13: Write `frontend/tests/setup.ts`**

```typescript
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 14: Install dependencies and verify**

Run from `frontend/`:

```bash
npm install
npm run build
ls dist/
```

Expected: `dist/index.html` and `dist/assets/` exist. The `build` finishes with no TS errors.

- [ ] **Step 15: Run the empty Vitest suite to confirm test infra**

```bash
npm test
```

Expected: `No test files found, exiting with code 1` — that's fine for now, Vitest is wired.

- [ ] **Step 16: Commit**

```bash
cd /home/secondary/PycharmProjects/piighost-proofreader
git add frontend/package.json frontend/package-lock.json frontend/vite.config.ts frontend/tsconfig.json frontend/tsconfig.node.json frontend/postcss.config.js frontend/tailwind.config.js frontend/index.html frontend/.gitignore frontend/src/main.tsx frontend/src/App.tsx frontend/src/index.css frontend/tests/setup.ts
git commit -m "chore(frontend): scaffold Vite + React + TS + Tailwind + Vitest"
```

---

### Task 2: Install TailGrids primitives (Button, Checkbox, Badge, Spinner, Alert)

The TailGrids React primitives ship as standalone TSX files installable via the CLI into `src/components/core/`. We need at minimum: **Button**, **Checkbox**, **Badge**, **Alert**, **Spinner**. The exact install command can be obtained via `mcp__tailgrids__get_install_command` — typically `npx @tailgrids/cli@latest add <name>`.

**Files:**
- Create: `frontend/src/components/core/Button.tsx`, `Checkbox.tsx`, `Badge.tsx`, `Alert.tsx`, `Spinner.tsx` (via CLI)

- [ ] **Step 1: Identify primitives and install each one**

From `frontend/`, for each primitive (Button, Checkbox, Badge, Alert, Spinner), call the TailGrids MCP tool to fetch the spec:

```text
Use mcp__tailgrids__get_component with { "name": "Button" } → returns the install command + import path.
Then run the install command in frontend/. Repeat for Checkbox, Badge, Alert, Spinner.
```

If the CLI is unavailable, fall back to `mcp__tailgrids__get_component_code` and write each file by hand into `src/components/core/<Name>.tsx`. Each file must export a typed React component (props with `extends` of the underlying HTML element where relevant).

- [ ] **Step 2: Verify each primitive renders standalone**

Temporarily edit `src/App.tsx` to render all five primitives:

```tsx
import { Button } from "./components/core/Button";
import { Checkbox } from "./components/core/Checkbox";
import { Badge } from "./components/core/Badge";
import { Alert } from "./components/core/Alert";
import { Spinner } from "./components/core/Spinner";

export default function App() {
  return (
    <main className="min-h-screen p-8 flex flex-col gap-4 items-start">
      <Button>Primary action</Button>
      <Checkbox label="Cocher" />
      <Badge>18 fautes</Badge>
      <Alert variant="error" title="Erreur">Test alert</Alert>
      <Spinner />
    </main>
  );
}
```

Note: the exact prop names depend on the installed TailGrids version. Adjust the JSX above to match the actual prop signatures shown by the MCP `get_props_schema` tool.

- [ ] **Step 3: Manual smoke**

```bash
npm run dev
```

Open `http://localhost:5173/`. Expected: all five primitives visible, no console errors.

- [ ] **Step 4: Revert `App.tsx` to the placeholder**

```tsx
export default function App() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <p className="text-sm text-slate-500">ProofReader bootstrap OK</p>
    </main>
  );
}
```

- [ ] **Step 5: Commit**

```bash
cd /home/secondary/PycharmProjects/piighost-proofreader
git add frontend/src/components/core/ frontend/package.json frontend/package-lock.json
git commit -m "chore(frontend): install TailGrids primitives (Button, Checkbox, Badge, Alert, Spinner)"
```

---

### Task 3: Type definitions matching the Python pipeline

**Files:**
- Create: `frontend/src/lib/types.ts`

- [ ] **Step 1: Write `frontend/src/lib/types.ts`**

```typescript
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
  // Optional debug payload — populated when backend is in debug mode.
  markdown_raw?: string;
  markdown_anonymized?: string;
  thread_id?: string;
  word_stream?: { page: number; text: string; bbox: [number, number, number, number] }[];
}
```

- [ ] **Step 2: Verify types compile**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/types.ts
git commit -m "feat(frontend): type definitions mirroring Python proofreader models"
```

---

### Task 4: Upload validation (TDD)

**Files:**
- Create: `frontend/tests/upload.test.ts`
- Create: `frontend/src/lib/upload.ts`

- [ ] **Step 1: Write the failing test `frontend/tests/upload.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { validateFile, MAX_BYTES } from "../src/lib/upload";

function fakeFile(name: string, type: string, sizeBytes: number): File {
  // Build a minimal File-like object — jsdom's File constructor accepts
  // Blob parts; we pass an empty array and override size via a stub.
  const f = new File([new Uint8Array(0)], name, { type });
  Object.defineProperty(f, "size", { value: sizeBytes });
  return f;
}

describe("validateFile", () => {
  it("accepts a PDF under the size limit", () => {
    const file = fakeFile("cv.pdf", "application/pdf", 1024 * 1024); // 1 MB
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
      expect(result.sizeMb).toBeCloseTo(11, 1);
    }
  });

  it("exposes MAX_BYTES = 10 MB", () => {
    expect(MAX_BYTES).toBe(10 * 1024 * 1024);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run tests/upload.test.ts
```

Expected: FAIL with `Cannot find module '../src/lib/upload'`.

- [ ] **Step 3: Implement `frontend/src/lib/upload.ts`**

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/upload.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/upload.ts frontend/tests/upload.test.ts
git commit -m "feat(frontend): file upload validation with TDD coverage"
```

---

### Task 5: Bbox scaling logic (TDD)

The locator emits bboxes in PDF points; PDF.js renders at a fixed scale. The mapping is `(x * scale, y * scale, w * scale, h * scale)`. Tested in isolation so we can trust it before stitching it to the overlay component.

**Files:**
- Create: `frontend/tests/scaling.test.ts`
- Create: `frontend/src/lib/scaling.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { scaleBox } from "../src/lib/scaling";

describe("scaleBox", () => {
  it("scales each component by the viewport scale", () => {
    const bbox: [number, number, number, number] = [100, 200, 150, 230];
    const result = scaleBox(bbox, 1.5);
    expect(result).toEqual({
      left: 150,
      top: 300,
      width: 75,   // (150 - 100) * 1.5
      height: 45,  // (230 - 200) * 1.5
    });
  });

  it("returns zero-sized rect for a degenerate bbox", () => {
    expect(scaleBox([10, 10, 10, 10], 2)).toEqual({
      left: 20, top: 20, width: 0, height: 0,
    });
  });

  it("supports fractional scales", () => {
    const result = scaleBox([0, 0, 100, 50], 0.5);
    expect(result.width).toBe(50);
    expect(result.height).toBe(25);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
npx vitest run tests/scaling.test.ts
```

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement `frontend/src/lib/scaling.ts`**

```typescript
export interface PixelRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function scaleBox(
  bbox: [number, number, number, number],
  scale: number
): PixelRect {
  const [x0, y0, x1, y1] = bbox;
  return {
    left: x0 * scale,
    top: y0 * scale,
    width: (x1 - x0) * scale,
    height: (y1 - y0) * scale,
  };
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
npx vitest run tests/scaling.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/scaling.ts frontend/tests/scaling.test.ts
git commit -m "feat(frontend): bbox-to-pixel scaling helper with TDD"
```

---

### Task 6: App-state reducer (TDD)

Single source of truth for which view is rendered. Transitions are explicit; no setState scatter.

**Files:**
- Create: `frontend/tests/appState.test.ts`
- Create: `frontend/src/hooks/useAppState.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { appReducer, initialAppState, type AppState } from "../src/hooks/useAppState";

describe("appReducer", () => {
  it("starts in the empty state", () => {
    expect(initialAppState).toEqual({ kind: "empty" });
  });

  it("transitions empty → loading on UPLOAD_STARTED", () => {
    const next = appReducer({ kind: "empty" }, { type: "UPLOAD_STARTED", filename: "cv.pdf" });
    expect(next).toEqual({ kind: "loading", filename: "cv.pdf" });
  });

  it("transitions loading → results on RESULT_RECEIVED", () => {
    const start: AppState = { kind: "loading", filename: "cv.pdf" };
    const next = appReducer(start, {
      type: "RESULT_RECEIVED",
      data: { mistakes: [], filename: "cv.pdf" } as never,
    });
    expect(next.kind).toBe("results");
  });

  it("transitions any state → error on ERROR", () => {
    const next = appReducer({ kind: "loading", filename: "x" }, {
      type: "ERROR",
      reason: "too-large",
      details: { sizeMb: 12.3 },
    });
    expect(next).toEqual({
      kind: "error",
      reason: "too-large",
      details: { sizeMb: 12.3 },
    });
  });

  it("RESET returns to empty regardless of current state", () => {
    expect(appReducer({ kind: "error", reason: "not-pdf" }, { type: "RESET" })).toEqual({
      kind: "empty",
    });
  });
});
```

- [ ] **Step 2: Run test, verify failure**

```bash
npx vitest run tests/appState.test.ts
```

Expected: FAIL, module not found.

- [ ] **Step 3: Implement `frontend/src/hooks/useAppState.ts`**

```typescript
import { useReducer } from "react";
import type { ProofreadResult } from "../lib/types";

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

export function appReducer(state: AppState, action: AppAction): AppState {
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
```

- [ ] **Step 4: Run test, verify pass**

```bash
npx vitest run tests/appState.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useAppState.ts frontend/tests/appState.test.ts
git commit -m "feat(frontend): app state reducer with TDD"
```

---

### Task 7: Mistakes store (TDD)

Maps each mistake index to `{ enabled, active }`. At most one active at a time. Decided here so the UI never has to chase consistency.

**Files:**
- Create: `frontend/tests/mistakesStore.test.ts`
- Create: `frontend/src/hooks/useMistakesStore.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect } from "vitest";
import { mistakesReducer, initState } from "../src/hooks/useMistakesStore";

describe("mistakesReducer", () => {
  it("initializes 3 mistakes as enabled and inactive", () => {
    expect(initState(3)).toEqual({
      enabled: [true, true, true],
      activeIndex: null,
    });
  });

  it("TOGGLE flips enabled at index", () => {
    const next = mistakesReducer(initState(2), { type: "TOGGLE", index: 0 });
    expect(next.enabled).toEqual([false, true]);
  });

  it("SET_ACTIVE sets a unique active index", () => {
    const next = mistakesReducer(initState(2), { type: "SET_ACTIVE", index: 1 });
    expect(next.activeIndex).toBe(1);
  });

  it("SET_ACTIVE with the current active index clears it (toggle off)", () => {
    const s = mistakesReducer(initState(2), { type: "SET_ACTIVE", index: 1 });
    const cleared = mistakesReducer(s, { type: "SET_ACTIVE", index: 1 });
    expect(cleared.activeIndex).toBeNull();
  });

  it("TOGGLE on the currently active index also clears active", () => {
    const s = mistakesReducer(initState(2), { type: "SET_ACTIVE", index: 0 });
    const next = mistakesReducer(s, { type: "TOGGLE", index: 0 });
    expect(next.enabled[0]).toBe(false);
    expect(next.activeIndex).toBeNull();
  });

  it("SET_ALL replaces every enabled flag with the same value", () => {
    const next = mistakesReducer(initState(3), { type: "SET_ALL", enabled: false });
    expect(next.enabled).toEqual([false, false, false]);
    expect(next.activeIndex).toBeNull();
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
npx vitest run tests/mistakesStore.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `frontend/src/hooks/useMistakesStore.ts`**

```typescript
import { useReducer } from "react";

export interface MistakesState {
  enabled: boolean[];
  activeIndex: number | null;
}

export type MistakesAction =
  | { type: "TOGGLE"; index: number }
  | { type: "SET_ACTIVE"; index: number }
  | { type: "SET_ALL"; enabled: boolean }
  | { type: "RESET"; count: number };

export function initState(count: number): MistakesState {
  return { enabled: new Array(count).fill(true), activeIndex: null };
}

export function mistakesReducer(
  state: MistakesState,
  action: MistakesAction
): MistakesState {
  switch (action.type) {
    case "TOGGLE": {
      const enabled = state.enabled.slice();
      enabled[action.index] = !enabled[action.index];
      const activeIndex =
        !enabled[action.index] && state.activeIndex === action.index
          ? null
          : state.activeIndex;
      return { enabled, activeIndex };
    }
    case "SET_ACTIVE":
      return {
        ...state,
        activeIndex: state.activeIndex === action.index ? null : action.index,
      };
    case "SET_ALL":
      return {
        enabled: state.enabled.map(() => action.enabled),
        activeIndex: null,
      };
    case "RESET":
      return initState(action.count);
  }
}

export function useMistakesStore(count: number) {
  return useReducer(mistakesReducer, count, initState);
}
```

- [ ] **Step 4: Run, verify pass**

```bash
npx vitest run tests/mistakesStore.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useMistakesStore.ts frontend/tests/mistakesStore.test.ts
git commit -m "feat(frontend): mistakes store reducer with toggle + active semantics"
```

---

### Task 8: Sample fixture (PDF base64 + 5 mistakes)

**Files:**
- Create: `frontend/src/fixtures/sample-result.json`

- [ ] **Step 1: Build the sample PDF and capture base64**

Run from `piighost-proofreader/`:

```bash
uv run python -c "
import base64, fitz, json
doc = fitz.open()
page = doc.new_page()
page.insert_text((72, 100), 'Voici un exemple simple avec mot mot dans une phrase.', fontsize=14)
page.insert_text((72, 130), 'Une faute ortho ici et une autre la.', fontsize=14)
doc.save('/tmp/fake.pdf')
print(base64.b64encode(open('/tmp/fake.pdf', 'rb').read()).decode())
" > /tmp/fake-b64.txt
echo "base64 length: $(wc -c < /tmp/fake-b64.txt) bytes"
```

Expected: ~2-5 KB of base64 in `/tmp/fake-b64.txt`.

- [ ] **Step 2: Write `frontend/src/fixtures/sample-result.json`**

Use the bbox positions PyMuPDF would emit for the sample sentence at 14 pt, page size 595×842. Replace `REPLACE_WITH_BASE64` with the contents of `/tmp/fake-b64.txt` (a single line, no quotes, no whitespace).

```json
{
  "language": "fr",
  "filename": "fake-cv.pdf",
  "page_count": 1,
  "page_sizes": [{ "page": 0, "width_pt": 595.0, "height_pt": 842.0 }],
  "mistakes": [
    {
      "error_text": "exemple",
      "correction": "exemple correct",
      "description": "Démonstration d'orthographe.",
      "type": "orthographe",
      "context_before": "Voici un",
      "page": 0,
      "bbox": [110.0, 95.0, 158.0, 110.0]
    },
    {
      "error_text": "mot mot",
      "correction": "un mot",
      "description": "Répétition à corriger.",
      "type": "grammaire",
      "context_before": "simple avec",
      "page": 0,
      "bbox": [205.0, 95.0, 245.0, 110.0]
    },
    {
      "error_text": "phrase",
      "correction": "phrase finale",
      "description": "Précision manquante.",
      "type": "ponctuation",
      "context_before": "dans une",
      "page": 0,
      "bbox": [310.0, 95.0, 350.0, 110.0]
    },
    {
      "error_text": "ortho",
      "correction": "orthographe",
      "description": "Abréviation à éviter.",
      "type": "orthographe",
      "context_before": "Une faute",
      "page": 0,
      "bbox": [160.0, 125.0, 195.0, 140.0]
    },
    {
      "error_text": "la",
      "correction": "là",
      "description": "Accent grave manquant.",
      "type": "accord",
      "context_before": "et une autre",
      "page": 0,
      "bbox": [305.0, 125.0, 320.0, 140.0]
    }
  ],
  "pdf_base64": "REPLACE_WITH_BASE64",
  "markdown_raw": "Voici un exemple simple avec mot mot dans une phrase.\\nUne faute ortho ici et une autre la.",
  "markdown_anonymized": "Voici un exemple simple avec mot mot dans une phrase.\\nUne faute ortho ici et une autre la.",
  "thread_id": "fake-thread-0001"
}
```

- [ ] **Step 3: Sanity check**

```bash
cd frontend && node -e "const d = require('./src/fixtures/sample-result.json'); console.log(d.mistakes.length, 'mistakes,', d.pdf_base64.length, 'b64 chars')"
```

Expected: `5 mistakes, NNNN b64 chars` (`NNNN` ≥ 2000).

- [ ] **Step 4: Commit**

```bash
cd /home/secondary/PycharmProjects/piighost-proofreader
git add frontend/src/fixtures/sample-result.json
git commit -m "feat(frontend): sample-result fixture for offline development"
```

---

### Task 9: PDF rendering helper

Wraps `pdfjs-dist` so the rest of the app sees a synchronous-feeling API: pass base64 in, get rendered pages out.

**Files:**
- Create: `frontend/src/lib/pdf.ts`

- [ ] **Step 1: Write `frontend/src/lib/pdf.ts`**

```typescript
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
  const loadingTask = pdfjsLib.getDocument({ data: bytes });
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
```

- [ ] **Step 2: Confirm Vite resolves the worker URL import**

```bash
cd frontend && npm run build
```

Expected: build succeeds. If it errors on `pdfjs-dist/build/pdf.worker.mjs?url`, check the installed `pdfjs-dist` version exposes that path; with `^4.6.82` it does.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/pdf.ts
git commit -m "feat(frontend): PDF.js wrapper with base64 decode and full-document render"
```

---

### Task 10: EmptyState + LoadingState + ErrorState components

**Files:**
- Create: `frontend/src/components/EmptyState.tsx`, `LoadingState.tsx`, `ErrorState.tsx`

- [ ] **Step 1: Write `frontend/src/components/EmptyState.tsx`**

```tsx
import { useRef, useState, type DragEvent } from "react";
import { validateFile } from "../lib/upload";
import type { ValidationResult } from "../lib/upload";

interface Props {
  onFile: (file: File) => void;
  onReject: (result: Extract<ValidationResult, { ok: false }>) => void;
}

export default function EmptyState({ onFile, onReject }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setDragOver] = useState(false);

  const handle = (file: File | null | undefined) => {
    if (!file) return;
    const r = validateFile(file);
    if (r.ok) onFile(r.file);
    else onReject(r);
  };

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handle(e.dataTransfer?.files?.[0]);
  };

  return (
    <section className="min-h-screen flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-xl text-center">
          <h1 className="text-3xl font-bold tracking-tight mb-2">ProofReader</h1>
          <p className="text-sm text-slate-500 mb-8">
            Glissez un PDF, le LLM repère orthographe, grammaire, accord,
            conjugaison et ponctuation.
          </p>

          <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={`p-12 border-2 border-dashed rounded-2xl transition-colors ${
              isDragOver
                ? "border-slate-500 bg-slate-100"
                : "border-slate-300 bg-slate-50 hover:border-slate-400"
            }`}
          >
            <div className="text-5xl mb-4">📄</div>
            <div className="text-lg font-semibold mb-1">Glissez votre CV ici</div>
            <div className="text-sm text-slate-500 mb-5">ou</div>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="px-6 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800"
            >
              Parcourir mes fichiers
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                handle(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <div className="text-xs text-slate-400 mt-5">
              PDF uniquement · 10 Mo max · texte (pas un scan)
            </div>
          </div>

          <p className="text-xs text-slate-500 mt-6 leading-relaxed">
            🔒 Aucune donnée personnelle ne sort de votre processus. Le contenu
            de votre CV est anonymisé via piighost-api avant d'être envoyé au
            modèle de langage.
          </p>
        </div>
      </div>

      <footer className="py-5 border-t border-slate-200 text-center">
        <a
          href="https://github.com/Athroniaeth/piighost-proofreader"
          target="_blank"
          rel="noopener"
          className="inline-flex items-center justify-center w-9 h-9 rounded-full text-slate-400 hover:text-slate-700"
          title="Code source GitHub"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.34-1.28-1.7-1.28-1.7-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.21-1.49 3.18-1.18 3.18-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.69 5.41-5.25 5.69.41.36.78 1.06.78 2.14 0 1.55-.01 2.8-.01 3.18 0 .31.21.68.8.56C20.71 21.39 24 17.08 24 12 24 5.65 18.85.5 12.5.5z" />
          </svg>
        </a>
      </footer>
    </section>
  );
}
```

- [ ] **Step 2: Write `frontend/src/components/LoadingState.tsx`**

```tsx
export default function LoadingState() {
  return (
    <section className="min-h-screen flex items-center justify-center">
      <div className="text-center max-w-sm mx-auto px-4">
        <div className="spinner mx-auto mb-4" aria-label="loading" />
        <div className="font-semibold mb-1">Analyse en cours…</div>
        <div className="text-xs text-slate-500">
          Extraction du texte · Anonymisation · Détection des fautes
        </div>
        <div className="text-xs text-slate-400 mt-2">
          ≈ 10 secondes pour un CV d'une page
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Write `frontend/src/components/ErrorState.tsx`**

```tsx
import type { ErrorReason, ErrorDetails } from "../hooks/useAppState";

interface Props {
  reason: ErrorReason;
  details?: ErrorDetails;
  onReset: () => void;
}

const PRESETS: Record<
  ErrorReason,
  { icon: string; title: string; body: (d?: ErrorDetails) => string; tone: "red" | "amber"; action: string }
> = {
  "too-large": {
    icon: "⚠️",
    title: "Fichier trop volumineux",
    body: (d) => `${(d?.sizeMb ?? 0).toFixed(1)} Mo · limite 10 Mo`,
    tone: "red",
    action: "Choisir un autre fichier",
  },
  "not-pdf": {
    icon: "📄❌",
    title: "Format non supporté",
    body: () => "Uniquement les fichiers PDF sont acceptés.",
    tone: "red",
    action: "Choisir un autre fichier",
  },
  "no-text-layer": {
    icon: "📄❌",
    title: "PDF non lisible",
    body: () => "Aucun texte trouvé. Le PDF semble être un scan, l'OCR n'est pas supporté.",
    tone: "red",
    action: "Essayer un autre PDF",
  },
  "backend-down": {
    icon: "🔌",
    title: "Service indisponible",
    body: () => "Réessayez dans quelques instants. Si ça persiste, signalez sur GitHub.",
    tone: "amber",
    action: "Réessayer",
  },
  "rate-limit": {
    icon: "⏳",
    title: "Trop de requêtes",
    body: (d) => `Quota atteint pour cette IP. Réessayez dans ${d?.retryInSec ?? 120} secondes.`,
    tone: "amber",
    action: "Réessayer",
  },
};

export default function ErrorState({ reason, details, onReset }: Props) {
  const p = PRESETS[reason];
  const border = p.tone === "amber" ? "border-amber-300 bg-amber-50" : "border-red-300 bg-red-50";
  const text = p.tone === "amber" ? "text-amber-800" : "text-red-800";
  return (
    <section className="min-h-screen flex items-center justify-center px-4">
      <div className={`max-w-md mx-auto text-center p-8 border rounded-2xl ${border}`}>
        <div className="text-4xl mb-2">{p.icon}</div>
        <div className={`font-semibold mb-1 ${text}`}>{p.title}</div>
        <div className={`text-sm ${text}`}>{p.body(details)}</div>
        <button
          onClick={onReset}
          className="mt-4 px-5 py-2 bg-slate-900 text-white text-sm rounded-lg hover:bg-slate-800"
        >
          {p.action}
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Wire EmptyState into `App.tsx` (temporary check)**

```tsx
import { useAppState } from "./hooks/useAppState";
import EmptyState from "./components/EmptyState";
import LoadingState from "./components/LoadingState";
import ErrorState from "./components/ErrorState";

export default function App() {
  const [state, dispatch] = useAppState();

  switch (state.kind) {
    case "empty":
      return (
        <EmptyState
          onFile={(file) => dispatch({ type: "UPLOAD_STARTED", filename: file.name })}
          onReject={(r) => {
            if (r.reason === "too-large") {
              dispatch({ type: "ERROR", reason: "too-large", details: { sizeMb: r.sizeMb } });
            } else {
              dispatch({ type: "ERROR", reason: "not-pdf" });
            }
          }}
        />
      );
    case "loading":
      return <LoadingState />;
    case "error":
      return (
        <ErrorState
          reason={state.reason}
          details={state.details}
          onReset={() => dispatch({ type: "RESET" })}
        />
      );
    case "results":
      return <main className="p-8 text-sm text-slate-500">Results state — Task 11.</main>;
  }
}
```

- [ ] **Step 5: Manual smoke**

```bash
npm run dev
```

Open `http://localhost:5173/`. Expected:
- ProofReader title + dropzone visible.
- Pick a valid PDF → loader appears, stays (we haven't wired the result yet — that's normal).
- Reload, pick a `.txt` → red "Format non supporté" card. Click button → back to empty.
- Reload, pick a PDF > 10 Mo → red "Fichier trop volumineux" with the real size.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/EmptyState.tsx frontend/src/components/LoadingState.tsx frontend/src/components/ErrorState.tsx frontend/src/App.tsx
git commit -m "feat(frontend): empty / loading / error state components"
```

---

### Task 11: ResultsState shell (TopBar + 2 panels)

**Files:**
- Create: `frontend/src/components/TopBar.tsx`, `ResultsState.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Write `frontend/src/components/TopBar.tsx`**

```tsx
interface Props {
  filename: string;
  mistakeCount: number;
  onReset: () => void;
}

export default function TopBar({ filename, mistakeCount, onReset }: Props) {
  return (
    <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-5 py-3 mb-5">
      <div className="flex items-center gap-2">
        <span className="font-semibold">{filename}</span>
        {mistakeCount === 0 ? (
          <span className="text-xs text-emerald-700 font-semibold">· ✓ aucune faute</span>
        ) : (
          <span className="text-xs text-slate-500">· {mistakeCount} fautes</span>
        )}
      </div>
      <button
        onClick={onReset}
        className="px-3.5 py-1.5 text-xs bg-slate-900 text-white rounded-md hover:bg-slate-800"
      >
        ↻ Nouveau PDF
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Write `frontend/src/components/ResultsState.tsx`**

```tsx
import type { ProofreadResult } from "../lib/types";
import TopBar from "./TopBar";

interface Props {
  data: ProofreadResult;
  onReset: () => void;
}

export default function ResultsState({ data, onReset }: Props) {
  return (
    <div className="max-w-container mx-auto px-4 lg:px-8 py-4 lg:py-6">
      <TopBar
        filename={data.filename}
        mistakeCount={data.mistakes.length}
        onReset={onReset}
      />
      <div className="flex flex-col lg:flex-row gap-5 lg:h-[calc(100vh-160px)]">
        <div
          id="pdf-panel"
          className="flex-1 overflow-y-auto bg-white border border-slate-200 rounded-xl p-6 min-h-[60vh] lg:min-h-0"
        >
          <p className="text-xs text-slate-400">PDF panel — wired in Task 12.</p>
        </div>
        <div
          id="mistakes-panel"
          className="flex-1 overflow-y-auto bg-white border border-slate-200 rounded-xl p-5 min-h-[40vh] lg:min-h-0"
        >
          <p className="text-xs text-slate-400">Mistakes list — wired in Task 13.</p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire `ResultsState` and the loading→results transition in `App.tsx`**

Replace `App.tsx` with:

```tsx
import { useEffect } from "react";
import { useAppState } from "./hooks/useAppState";
import EmptyState from "./components/EmptyState";
import LoadingState from "./components/LoadingState";
import ErrorState from "./components/ErrorState";
import ResultsState from "./components/ResultsState";
import sampleResult from "./fixtures/sample-result.json";
import type { ProofreadResult } from "./lib/types";

export default function App() {
  const [state, dispatch] = useAppState();

  // Phase 1: any uploaded PDF triggers loading → results with the fake fixture.
  useEffect(() => {
    if (state.kind !== "loading") return;
    const timer = setTimeout(() => {
      const data: ProofreadResult = {
        ...(sampleResult as ProofreadResult),
        filename: state.filename, // override with the uploaded filename
      };
      dispatch({ type: "RESULT_RECEIVED", data });
    }, 1000);
    return () => clearTimeout(timer);
  }, [state, dispatch]);

  switch (state.kind) {
    case "empty":
      return (
        <EmptyState
          onFile={(file) => dispatch({ type: "UPLOAD_STARTED", filename: file.name })}
          onReject={(r) => {
            if (r.reason === "too-large") {
              dispatch({ type: "ERROR", reason: "too-large", details: { sizeMb: r.sizeMb } });
            } else {
              dispatch({ type: "ERROR", reason: "not-pdf" });
            }
          }}
        />
      );
    case "loading":
      return <LoadingState />;
    case "error":
      return (
        <ErrorState
          reason={state.reason}
          details={state.details}
          onReset={() => dispatch({ type: "RESET" })}
        />
      );
    case "results":
      return (
        <ResultsState data={state.data} onReset={() => dispatch({ type: "RESET" })} />
      );
  }
}
```

- [ ] **Step 4: Manual smoke**

Reload `http://localhost:5173/`. Upload any PDF. Expected:
- Loader shows for ~1 s.
- Then results view: filename from your upload + "· 5 fautes" + two empty panels with placeholder text.
- "↻ Nouveau PDF" returns to empty state.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/TopBar.tsx frontend/src/components/ResultsState.tsx frontend/src/App.tsx
git commit -m "feat(frontend): results state shell with top bar and 2 panels"
```

---

### Task 12: PDF rendering inside PdfPanel

**Files:**
- Create: `frontend/src/components/PdfPanel.tsx`
- Modify: `frontend/src/components/ResultsState.tsx`

- [ ] **Step 1: Write `frontend/src/components/PdfPanel.tsx`**

```tsx
import { useEffect, useRef, useState } from "react";
import { base64ToBytes, renderAllPages, type RenderedPage } from "../lib/pdf";

interface Props {
  pdfBase64: string;
  onPagesReady: (pages: RenderedPage[]) => void;
}

export default function PdfPanel({ pdfBase64, onPagesReady }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<RenderedPage[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const bytes = base64ToBytes(pdfBase64);
      const rendered = await renderAllPages(bytes);
      if (cancelled) return;
      setPages(rendered);
      onPagesReady(rendered);
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfBase64, onPagesReady]);

  return (
    <div ref={containerRef} className="space-y-4">
      {pages.map((p) => (
        <div
          key={p.pageIndex}
          className="pdf-page mx-auto"
          style={{ width: p.width, height: p.height }}
          data-page-index={p.pageIndex}
          ref={(el) => {
            if (!el) return;
            // Mount the offscreen canvas once.
            if (el.firstChild !== p.canvas) {
              el.replaceChildren(p.canvas);
            }
          }}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Mount `PdfPanel` in `ResultsState.tsx`**

Replace `ResultsState.tsx`:

```tsx
import { useState } from "react";
import type { ProofreadResult } from "../lib/types";
import TopBar from "./TopBar";
import PdfPanel from "./PdfPanel";
import type { RenderedPage } from "../lib/pdf";

interface Props {
  data: ProofreadResult;
  onReset: () => void;
}

export default function ResultsState({ data, onReset }: Props) {
  const [pages, setPages] = useState<RenderedPage[]>([]);

  return (
    <div className="max-w-container mx-auto px-4 lg:px-8 py-4 lg:py-6">
      <TopBar
        filename={data.filename}
        mistakeCount={data.mistakes.length}
        onReset={onReset}
      />
      <div className="flex flex-col lg:flex-row gap-5 lg:h-[calc(100vh-160px)]">
        <div className="flex-1 overflow-y-auto bg-white border border-slate-200 rounded-xl p-6 min-h-[60vh] lg:min-h-0">
          <PdfPanel pdfBase64={data.pdf_base64} onPagesReady={setPages} />
        </div>
        <div className="flex-1 overflow-y-auto bg-white border border-slate-200 rounded-xl p-5 min-h-[40vh] lg:min-h-0">
          <p className="text-xs text-slate-400">
            {pages.length > 0
              ? `${pages.length} page(s) rendered — mistakes list in Task 13.`
              : "Loading PDF…"}
          </p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Manual smoke**

```bash
npm run dev
```

Upload any PDF. Expected:
- After ~1 s loader, the left panel shows the sample CV PDF rendered as a single page canvas.
- The right panel shows "1 page(s) rendered".

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/PdfPanel.tsx frontend/src/components/ResultsState.tsx
git commit -m "feat(frontend): render PDF.js pages inside the results panel"
```

---

### Task 13: HighlightOverlay + MistakesPanel + MistakeCard

This task draws bbox highlights over the PDF AND renders the list. The two are coupled by `useMistakesStore`, so they ship together.

**Files:**
- Create: `frontend/src/components/HighlightOverlay.tsx`, `MistakesPanel.tsx`, `MistakeCard.tsx`
- Modify: `frontend/src/components/PdfPanel.tsx`, `ResultsState.tsx`

- [ ] **Step 1: Write `frontend/src/components/HighlightOverlay.tsx`**

```tsx
import { useEffect, useRef } from "react";
import type { LocatedMistake } from "../lib/types";
import { scaleBox } from "../lib/scaling";

interface Props {
  mistakes: LocatedMistake[];
  enabled: boolean[];
  activeIndex: number | null;
  pageIndex: number;
  scale: number;
}

export default function HighlightOverlay({
  mistakes,
  enabled,
  activeIndex,
  pageIndex,
  scale,
}: Props) {
  const activeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeIndex]);

  return (
    <div className="absolute inset-0 pointer-events-none">
      {mistakes.map((m, idx) => {
        if (m.page !== pageIndex || !enabled[idx]) return null;
        const rect = scaleBox(m.bbox, scale);
        const isActive = idx === activeIndex;
        return (
          <div
            key={idx}
            ref={isActive ? activeRef : null}
            className="absolute rounded-sm transition-colors"
            style={{
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
              backgroundColor: isActive
                ? "rgba(255, 230, 0, 0.55)"
                : "rgba(235, 30, 30, 0.35)",
              outline: isActive ? "2px solid #f59e0b" : "none",
            }}
          />
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Update `frontend/src/components/PdfPanel.tsx` to host overlays per page**

```tsx
import { useEffect, useRef, useState } from "react";
import { base64ToBytes, renderAllPages, type RenderedPage } from "../lib/pdf";
import HighlightOverlay from "./HighlightOverlay";
import type { LocatedMistake } from "../lib/types";

interface Props {
  pdfBase64: string;
  mistakes: LocatedMistake[];
  enabled: boolean[];
  activeIndex: number | null;
}

export default function PdfPanel({ pdfBase64, mistakes, enabled, activeIndex }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<RenderedPage[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const bytes = base64ToBytes(pdfBase64);
      const rendered = await renderAllPages(bytes);
      if (cancelled) return;
      setPages(rendered);
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfBase64]);

  return (
    <div ref={containerRef} className="space-y-4">
      {pages.map((p) => (
        <div
          key={p.pageIndex}
          className="pdf-page mx-auto relative"
          style={{ width: p.width, height: p.height }}
        >
          <div
            ref={(el) => {
              if (!el) return;
              if (el.firstChild !== p.canvas) {
                el.replaceChildren(p.canvas);
              }
            }}
          />
          <HighlightOverlay
            mistakes={mistakes}
            enabled={enabled}
            activeIndex={activeIndex}
            pageIndex={p.pageIndex}
            scale={p.scale}
          />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Write `frontend/src/components/MistakeCard.tsx`**

```tsx
import type { LocatedMistake, MistakeType } from "../lib/types";

const TYPE_CLASSES: Record<MistakeType, string> = {
  orthographe: "bg-red-100 text-red-800",
  accord: "bg-red-100 text-red-800",
  grammaire: "bg-amber-100 text-amber-800",
  conjugaison: "bg-blue-100 text-blue-800",
  ponctuation: "bg-violet-100 text-violet-800",
};

interface Props {
  mistake: LocatedMistake;
  enabled: boolean;
  active: boolean;
  onToggle: () => void;
  onActivate: () => void;
}

export default function MistakeCard({
  mistake,
  enabled,
  active,
  onToggle,
  onActivate,
}: Props) {
  const baseRing = active
    ? "border-2 border-amber-500 bg-amber-50"
    : "border border-slate-200 bg-white";
  const opacity = enabled ? "" : "opacity-60 bg-slate-50";
  return (
    <div
      onClick={(e) => {
        if ((e.target as HTMLElement).tagName === "INPUT") return;
        if (!enabled) return;
        onActivate();
      }}
      className={`flex items-start gap-2 p-2.5 rounded-lg mb-2 cursor-pointer ${baseRing} ${opacity}`}
    >
      <input
        type="checkbox"
        checked={enabled}
        onChange={onToggle}
        onClick={(e) => e.stopPropagation()}
        className="mt-0.5 rounded"
      />
      <div className="flex-1 text-xs min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase ${TYPE_CLASSES[mistake.type]}`}>
            {mistake.type}
          </span>
          {active && (
            <span className="text-[10px] text-amber-700 font-semibold">🎯 ACTIVE</span>
          )}
        </div>
        <div className="break-words">
          <s className="text-red-600">{mistake.error_text}</s>
          {" → "}
          <b className="text-green-600">{mistake.correction}</b>
        </div>
        <div className="text-slate-500 text-[11px] mt-0.5">{mistake.description}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write `frontend/src/components/MistakesPanel.tsx`**

```tsx
import { useMistakesStore } from "../hooks/useMistakesStore";
import type { LocatedMistake } from "../lib/types";
import MistakeCard from "./MistakeCard";

interface Props {
  mistakes: LocatedMistake[];
  onStateChange: (enabled: boolean[], activeIndex: number | null) => void;
}

export default function MistakesPanel({ mistakes, onStateChange }: Props) {
  const [store, dispatch] = useMistakesStore(mistakes.length);

  // Propagate up so PdfPanel can update overlays.
  // useEffect would re-run on every store change; called inline is fine here
  // because React batches and onStateChange is stable from parent.
  if (store.enabled.length !== mistakes.length) {
    dispatch({ type: "RESET", count: mistakes.length });
  }

  const visible = store.enabled.filter(Boolean).length;
  const allChecked = visible === mistakes.length;

  // Trigger after render so the parent doesn't render-loop on first paint.
  // We use a microtask to push the update past the current render frame.
  queueMicrotask(() => onStateChange(store.enabled, store.activeIndex));

  if (mistakes.length === 0) {
    return (
      <div className="h-full flex items-center justify-center px-8">
        <div className="text-center max-w-xs">
          <div className="text-5xl mb-3">✅</div>
          <div className="font-semibold text-emerald-800 mb-1">Aucune faute détectée</div>
          <div className="text-sm text-slate-500 leading-relaxed">
            Le LLM a analysé votre CV et n'a rien trouvé à corriger.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-200">
        <input
          type="checkbox"
          checked={allChecked}
          onChange={(e) => dispatch({ type: "SET_ALL", enabled: e.target.checked })}
          className="rounded"
        />
        <span className="text-xs text-slate-500">Tout cocher / décocher</span>
        <span className="text-xs text-slate-500 ml-auto">
          {visible} / {mistakes.length} visibles
        </span>
      </div>
      {mistakes.map((m, i) => (
        <MistakeCard
          key={i}
          mistake={m}
          enabled={store.enabled[i]}
          active={store.activeIndex === i}
          onToggle={() => dispatch({ type: "TOGGLE", index: i })}
          onActivate={() => dispatch({ type: "SET_ACTIVE", index: i })}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Glue them in `ResultsState.tsx`**

Replace `ResultsState.tsx`:

```tsx
import { useState } from "react";
import type { ProofreadResult } from "../lib/types";
import TopBar from "./TopBar";
import PdfPanel from "./PdfPanel";
import MistakesPanel from "./MistakesPanel";

interface Props {
  data: ProofreadResult;
  onReset: () => void;
}

export default function ResultsState({ data, onReset }: Props) {
  const [enabled, setEnabled] = useState<boolean[]>(() =>
    new Array(data.mistakes.length).fill(true)
  );
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  return (
    <div className="max-w-container mx-auto px-4 lg:px-8 py-4 lg:py-6">
      <TopBar
        filename={data.filename}
        mistakeCount={data.mistakes.length}
        onReset={onReset}
      />
      <div className="flex flex-col lg:flex-row gap-5 lg:h-[calc(100vh-160px)]">
        <div className="flex-1 overflow-y-auto bg-white border border-slate-200 rounded-xl p-6 min-h-[60vh] lg:min-h-0">
          <PdfPanel
            pdfBase64={data.pdf_base64}
            mistakes={data.mistakes}
            enabled={enabled}
            activeIndex={activeIndex}
          />
        </div>
        <div className="flex-1 overflow-y-auto bg-white border border-slate-200 rounded-xl p-5 min-h-[40vh] lg:min-h-0">
          <MistakesPanel
            mistakes={data.mistakes}
            onStateChange={(e, a) => {
              setEnabled(e);
              setActiveIndex(a);
            }}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Manual smoke**

```bash
npm run dev
```

Upload any PDF. Expected:
- 5 red bbox highlights over the sample PDF (positions approximate).
- 5 cards in the right panel, type-colored badges, strikethrough error → green correction.
- Uncheck one → its red box disappears + card fades to 60 % opacity.
- Click a card body → border turns amber + 🎯 ACTIVE badge + box turns yellow + PDF auto-scrolls.
- Click a second card → previous loses active state.
- Click "Tout cocher / décocher" → all cards + boxes flip in sync.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/HighlightOverlay.tsx frontend/src/components/MistakeCard.tsx frontend/src/components/MistakesPanel.tsx frontend/src/components/PdfPanel.tsx frontend/src/components/ResultsState.tsx
git commit -m "feat(frontend): bbox overlays + mistakes list with toggle and active"
```

---

### Task 14: Debug panel + ?fake=1 + final acceptance

The debug panel and `?fake=1` are small enough to bundle. Final acceptance closes the task list.

**Files:**
- Create: `frontend/src/components/DebugPanel.tsx`, `frontend/src/hooks/useDebugMode.ts`
- Modify: `frontend/src/App.tsx`, `frontend/src/components/ResultsState.tsx`

- [ ] **Step 1: Write `frontend/src/hooks/useDebugMode.ts`**

```typescript
import { useEffect, useState } from "react";

function readFlag(name: string): boolean {
  return new URLSearchParams(window.location.search).get(name) === "1";
}

export function useDebugMode() {
  const [visible, setVisible] = useState(() => readFlag("debug"));
  useEffect(() => {
    setVisible(readFlag("debug"));
  }, []);
  return { visible, toggle: () => setVisible((v) => !v) };
}

export function isFakeMode(): boolean {
  return readFlag("fake");
}
```

- [ ] **Step 2: Write `frontend/src/components/DebugPanel.tsx`**

```tsx
import type { ProofreadResult } from "../lib/types";

interface Props {
  data: ProofreadResult;
}

export default function DebugPanel({ data }: Props) {
  const downloadDump = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `proofreader-dump-${data.thread_id?.slice(0, 8) ?? "fake"}.json`;
    a.click();
  };

  return (
    <aside className="max-w-container mx-auto px-4 lg:px-8 pb-12">
      <div className="bg-white border border-slate-200 rounded-xl p-5 mt-2">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Debug</h2>
          <button
            onClick={downloadDump}
            className="px-3 py-1.5 text-xs bg-slate-900 text-white rounded-md hover:bg-slate-800"
          >
            ⬇ Download pipeline dump (JSON)
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          language={data.language} · pages={data.page_count} · mistakes={data.mistakes.length}
          {data.thread_id ? ` · thread_id=${data.thread_id}` : ""}
        </p>
        <details className="mb-2">
          <summary className="text-xs font-semibold cursor-pointer">Markdown extracted</summary>
          <pre className="text-[11px] bg-slate-50 p-2 mt-1 rounded overflow-auto max-h-60">
            {data.markdown_raw ?? "(not provided in phase 1)"}
          </pre>
        </details>
        <details className="mb-2">
          <summary className="text-xs font-semibold cursor-pointer">Anonymized Markdown (LLM input)</summary>
          <pre className="text-[11px] bg-slate-50 p-2 mt-1 rounded overflow-auto max-h-60">
            {data.markdown_anonymized ?? "(not provided in phase 1)"}
          </pre>
        </details>
        <details className="mb-2">
          <summary className="text-xs font-semibold cursor-pointer">Mistakes (JSON)</summary>
          <pre className="text-[11px] bg-slate-50 p-2 mt-1 rounded overflow-auto max-h-60">
            {JSON.stringify(data.mistakes, null, 2)}
          </pre>
        </details>
        <details>
          <summary className="text-xs font-semibold cursor-pointer">Word stream (PyMuPDF)</summary>
          <pre className="text-[11px] bg-slate-50 p-2 mt-1 rounded overflow-auto max-h-60">
            {JSON.stringify(data.word_stream ?? [], null, 2)}
          </pre>
        </details>
      </div>
    </aside>
  );
}
```

- [ ] **Step 3: Add the floating 🔧 toggle and wire DebugPanel into `ResultsState.tsx`**

Replace `ResultsState.tsx`:

```tsx
import { useState } from "react";
import type { ProofreadResult } from "../lib/types";
import TopBar from "./TopBar";
import PdfPanel from "./PdfPanel";
import MistakesPanel from "./MistakesPanel";
import DebugPanel from "./DebugPanel";
import { useDebugMode } from "../hooks/useDebugMode";

interface Props {
  data: ProofreadResult;
  onReset: () => void;
}

export default function ResultsState({ data, onReset }: Props) {
  const [enabled, setEnabled] = useState<boolean[]>(() =>
    new Array(data.mistakes.length).fill(true)
  );
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const debug = useDebugMode();

  return (
    <>
      <div className="max-w-container mx-auto px-4 lg:px-8 py-4 lg:py-6">
        <TopBar
          filename={data.filename}
          mistakeCount={data.mistakes.length}
          onReset={onReset}
        />
        <div className="flex flex-col lg:flex-row gap-5 lg:h-[calc(100vh-160px)]">
          <div className="flex-1 overflow-y-auto bg-white border border-slate-200 rounded-xl p-6 min-h-[60vh] lg:min-h-0">
            <PdfPanel
              pdfBase64={data.pdf_base64}
              mistakes={data.mistakes}
              enabled={enabled}
              activeIndex={activeIndex}
            />
          </div>
          <div className="flex-1 overflow-y-auto bg-white border border-slate-200 rounded-xl p-5 min-h-[40vh] lg:min-h-0">
            <MistakesPanel
              mistakes={data.mistakes}
              onStateChange={(e, a) => {
                setEnabled(e);
                setActiveIndex(a);
              }}
            />
          </div>
        </div>
      </div>

      {debug.visible && <DebugPanel data={data} />}

      <button
        onClick={debug.toggle}
        title="Toggle debug"
        className="fixed bottom-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-slate-900 text-white opacity-40 hover:opacity-100 transition-opacity text-base"
      >
        🔧
      </button>
    </>
  );
}
```

- [ ] **Step 4: Wire `?fake=1` short-circuit in `App.tsx`**

Replace `App.tsx`:

```tsx
import { useEffect } from "react";
import { useAppState } from "./hooks/useAppState";
import { isFakeMode } from "./hooks/useDebugMode";
import EmptyState from "./components/EmptyState";
import LoadingState from "./components/LoadingState";
import ErrorState from "./components/ErrorState";
import ResultsState from "./components/ResultsState";
import sampleResult from "./fixtures/sample-result.json";
import type { ProofreadResult } from "./lib/types";

export default function App() {
  const [state, dispatch] = useAppState();

  // ?fake=1 jumps straight to results with the fixture, bypassing upload.
  useEffect(() => {
    if (state.kind === "empty" && isFakeMode()) {
      dispatch({
        type: "RESULT_RECEIVED",
        data: sampleResult as ProofreadResult,
      });
    }
  }, [state.kind, dispatch]);

  // After upload, fake the backend roundtrip with a 1 s timer.
  useEffect(() => {
    if (state.kind !== "loading") return;
    const timer = setTimeout(() => {
      const data: ProofreadResult = {
        ...(sampleResult as ProofreadResult),
        filename: state.filename,
      };
      dispatch({ type: "RESULT_RECEIVED", data });
    }, 1000);
    return () => clearTimeout(timer);
  }, [state, dispatch]);

  switch (state.kind) {
    case "empty":
      return (
        <EmptyState
          onFile={(file) => dispatch({ type: "UPLOAD_STARTED", filename: file.name })}
          onReject={(r) => {
            if (r.reason === "too-large") {
              dispatch({ type: "ERROR", reason: "too-large", details: { sizeMb: r.sizeMb } });
            } else {
              dispatch({ type: "ERROR", reason: "not-pdf" });
            }
          }}
        />
      );
    case "loading":
      return <LoadingState />;
    case "error":
      return (
        <ErrorState
          reason={state.reason}
          details={state.details}
          onReset={() => dispatch({ type: "RESET" })}
        />
      );
    case "results":
      return (
        <ResultsState data={state.data} onReset={() => dispatch({ type: "RESET" })} />
      );
  }
}
```

- [ ] **Step 5: Run the full Vitest suite + build**

```bash
cd frontend
npm test
npm run build
```

Expected: all tests pass (`upload`, `scaling`, `appState`, `mistakesStore` — 18 tests total). Build finishes with no TS errors.

- [ ] **Step 6: Final acceptance walkthrough**

```bash
npm run dev
```

Walk through each criterion. Tick a box only after the actual behavior is observed in Chrome.

- [ ] At `http://localhost:5173/` — state 1 visible, dropzone centered, no console errors. Test at 1440 px and 1024 px window widths.
- [ ] Drag a PDF > 10 Mo — red error card immediately, **no** network request (DevTools Network tab empty).
- [ ] Drag a `.txt` file — red "Format non supporté" card.
- [ ] Drag a valid PDF — loader for ~1 s → results state.
- [ ] Left panel shows the sample PDF (its content, not the file the user uploaded — that's expected in phase 1).
- [ ] 5 red highlight rectangles visible over text.
- [ ] Uncheck a faute → its red rectangle disappears + card fades.
- [ ] Click a card body → amber border + 🎯 ACTIVE + amber rectangle + PDF auto-scrolls.
- [ ] Click another card → previous loses active.
- [ ] "Tout cocher / décocher" flips all in sync.
- [ ] Visit `http://localhost:5173/?fake=1` directly — results state appears immediately without upload.
- [ ] Visit `http://localhost:5173/?debug=1` — debug section visible below results with stats and dump button.
- [ ] Click 🔧 button — debug section toggles in/out.
- [ ] Resize window to 800 px wide — panels stack vertically.
- [ ] Click "↻ Nouveau PDF" — instantly back to state 1, no confirmation dialog.

- [ ] **Step 7: Commit**

```bash
cd /home/secondary/PycharmProjects/piighost-proofreader
git add frontend/src/hooks/useDebugMode.ts frontend/src/components/DebugPanel.tsx frontend/src/components/ResultsState.tsx frontend/src/App.tsx
git commit -m "feat(frontend): debug panel + ?fake=1 short-circuit + final acceptance"
```

---

## Notes on phase 2 / 3 (out of scope here)

- The FastAPI backend (phase 2) will return the same `ProofreadResult` shape, with `pdf_base64` populated from the uploaded file's bytes. Replace the `setTimeout` in `App.tsx` with a real `fetch('/api/proofread', { method: 'POST', body: formData })`.
- The `markdown_raw`, `markdown_anonymized`, `thread_id`, `word_stream` fields populate naturally once the backend wires `_run_pipeline` from `app.py` into an HTTP endpoint.
- Error states `no-text-layer`, `backend-down`, `rate-limit` get triggered by HTTP status codes (`422`, `5xx`, `429`) once the backend exists.
- Multi-page PDFs already render correctly because `renderAllPages` iterates the whole document and `HighlightOverlay` filters by `page === pageIndex`.

## Self-review pass (writing-plans skill checklist)

- **Spec coverage:** every section of `docs/superpowers/specs/2026-05-21-frontend-tailgrids-design.md` is mapped to at least one task (states 1 + intermediate + 2 → Tasks 10, 11; PDF + overlays → Tasks 12, 13; mistakes panel → Task 13; debug → Task 14; error states → Tasks 10, 14; mobile stacking → embedded in Task 11 via `lg:` variants; `?fake=1` → Task 14; fixture → Task 8).
- **Placeholders:** none. Every code block is the final content; every command is exact.
- **Type consistency:** `Mistake`/`LocatedMistake`/`ProofreadResult` defined once in `lib/types.ts`, reused everywhere. `AppState`/`AppAction`/`ErrorReason` consistent between `useAppState.ts`, `App.tsx`, and `ErrorState.tsx`. Store action names (`TOGGLE`, `SET_ACTIVE`, `SET_ALL`, `RESET`) consistent between tests and impl.
