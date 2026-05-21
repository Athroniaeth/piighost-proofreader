# Frontend TailGrids Implementation Plan (DEPRECATED — vanilla HTML/JS)

> ⚠️ **DEPRECATED 2026-05-21.** The frontend stack pivoted to React + Vite + TypeScript + TailGrids primitives TSX to leverage the `tailgrids` skill (38 primitives + 410 blocks). The authoritative plan is now **[`2026-05-21-frontend-tailgrids-react.md`](./2026-05-21-frontend-tailgrids-react.md)**. This file is kept for historical context only — do not execute it.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Single-page TailGrids vanilla frontend that uploads a CV PDF, renders it client-side via PDF.js with bbox overlays, and lets the user toggle individual highlights from a list of mistakes — driven by mocked JSON for phase 1.

**Architecture:** HTML shell with two visual states (empty / loaded). Tailwind compiled via CLI. PDF.js standalone for rendering pages to canvas with absolute-positioned overlay divs for highlights. Vanilla JS state machine in one entry-point module; no framework. Debug section gated behind `?debug=1` or a discreet button. `?fake=1` short-circuits the upload and loads `sample-result.json` so the whole UI works without a backend.

**Tech Stack:** HTML5, Tailwind CSS 3.4.x (CLI), TailGrids vanilla HTML snippets, JS vanilla (no framework), pdfjs-dist 4.x standalone, Python `http.server` for dev.

---

## File Structure

```
piighost-proofreader/
├── frontend/                                # New phase 1 root
│   ├── index.html                           # Single page, both states
│   ├── package.json                         # Just tailwindcss dev dep
│   ├── tailwind.config.js
│   ├── .gitignore                           # node_modules, public/css
│   ├── src/
│   │   ├── css/
│   │   │   └── input.css                    # @tailwind directives + custom rules
│   │   ├── js/
│   │   │   ├── main.js                      # State machine, bootstraps everything
│   │   │   ├── upload.js                    # Dropzone + 10 MB validation
│   │   │   ├── render.js                    # PDF.js render + bbox overlays
│   │   │   ├── mistakes.js                  # List rendering + toggle/active
│   │   │   ├── debug.js                     # ?debug=1 panel + dump download
│   │   │   └── fakes/
│   │   │       └── sample-result.json       # Mocked backend response
│   │   └── components/                      # (optional) HTML snippets if used
│   └── public/
│       ├── css/
│       │   └── app.css                      # Tailwind output (gitignored)
│       └── pdfjs/                           # pdfjs-dist 4.x static
│           ├── build/pdf.mjs
│           ├── build/pdf.worker.mjs
│           └── web/                         # (not used, custom UI)
└── docs/superpowers/
    └── plans/2026-05-21-frontend-tailgrids.md
```

---

### Task 1: Frontend scaffolding

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tailwind.config.js`
- Create: `frontend/.gitignore`
- Create: `frontend/src/css/input.css`
- Create: `frontend/index.html` (empty shell)

- [ ] **Step 1: Create the directory tree**

Run from `~/PycharmProjects/piighost-proofreader/`:

```bash
mkdir -p frontend/src/css frontend/src/js/fakes frontend/src/components frontend/public/css frontend/public/pdfjs/build
```

- [ ] **Step 2: Write `frontend/package.json`**

```json
{
  "name": "piighost-proofreader-frontend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "tailwindcss -i src/css/input.css -o public/css/app.css --minify",
    "watch": "tailwindcss -i src/css/input.css -o public/css/app.css --watch",
    "serve": "python3 -m http.server 5173",
    "dev": "npm run watch & npm run serve"
  },
  "devDependencies": {
    "tailwindcss": "3.4.17"
  }
}
```

- [ ] **Step 3: Write `frontend/tailwind.config.js`**

```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{html,js}"],
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

- [ ] **Step 4: Write `frontend/.gitignore`**

```
node_modules/
public/css/app.css
.DS_Store
```

- [ ] **Step 5: Write `frontend/src/css/input.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Custom: highlight overlays positioned over the PDF canvas */
.pdf-highlight {
  position: absolute;
  pointer-events: none;
  border-radius: 2px;
  transition: background-color 0.15s ease, outline 0.15s ease;
}
.pdf-highlight.default {
  background-color: rgba(235, 30, 30, 0.35);
}
.pdf-highlight.active {
  background-color: rgba(255, 230, 0, 0.55);
  outline: 2px solid #f59e0b;
}
.pdf-highlight.hidden {
  display: none;
}

/* PDF canvas wrapper holds overlay children in absolute positioning */
.pdf-page {
  position: relative;
  margin-bottom: 16px;
  background: white;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

/* Spinner used in the loader state */
.spinner {
  width: 48px;
  height: 48px;
  border: 4px solid #e2e8f0;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
```

- [ ] **Step 6: Write `frontend/index.html` (empty shell)**

```html
<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ProofReader</title>
    <link rel="stylesheet" href="public/css/app.css" />
  </head>
  <body class="bg-slate-100 text-slate-900 antialiased">
    <main id="app"><!-- States injected here in later tasks --></main>
    <script type="module" src="src/js/main.js"></script>
  </body>
</html>
```

- [ ] **Step 7: Write minimal `frontend/src/js/main.js`**

```javascript
// Phase 1 entry point. Real state machine wired in later tasks.
console.log("ProofReader frontend bootstrapped");
```

- [ ] **Step 8: Install dependencies and build CSS**

```bash
cd frontend
npm install
npm run build
ls public/css/app.css
```

Expected: `public/css/app.css` exists, ~10-50 KB.

- [ ] **Step 9: Commit**

```bash
cd /home/secondary/PycharmProjects/piighost-proofreader
git add frontend/package.json frontend/package-lock.json frontend/tailwind.config.js frontend/.gitignore frontend/src/css/input.css frontend/index.html frontend/src/js/main.js
git commit -m "chore(frontend): scaffold TailGrids project with Tailwind CLI"
```

---

### Task 2: Empty state (state 1)

**Files:**
- Modify: `frontend/index.html`

- [ ] **Step 1: Add the state 1 markup inside `<main id="app">`**

Replace the comment with:

```html
<section id="state-empty" class="min-h-screen flex flex-col">
  <div class="flex-1 flex items-center justify-center px-4 py-16">
    <div class="w-full max-w-xl text-center">
      <h1 class="text-3xl font-bold tracking-tight mb-2">ProofReader</h1>
      <p class="text-sm text-slate-500 mb-8">
        Glissez un PDF, le LLM repère orthographe, grammaire, accord,
        conjugaison et ponctuation.
      </p>

      <div
        id="dropzone"
        class="p-12 border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50 transition-colors hover:border-slate-400"
      >
        <div class="text-5xl mb-4">📄</div>
        <div class="text-lg font-semibold mb-1">Glissez votre CV ici</div>
        <div class="text-sm text-slate-500 mb-5">ou</div>
        <label
          class="inline-block px-6 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-lg cursor-pointer hover:bg-slate-800"
        >
          Parcourir mes fichiers
          <input id="file-input" type="file" accept="application/pdf" class="hidden" />
        </label>
        <div class="text-xs text-slate-400 mt-5">
          PDF uniquement · 10 Mo max · texte (pas un scan)
        </div>
      </div>

      <p class="text-xs text-slate-500 mt-6 leading-relaxed">
        🔒 Aucune donnée personnelle ne sort de votre processus. Le contenu
        de votre CV est anonymisé via piighost-api avant d'être envoyé au
        modèle de langage.
      </p>
    </div>
  </div>

  <footer class="py-5 border-t border-slate-200 text-center">
    <a
      href="https://github.com/Athroniaeth/piighost-proofreader"
      target="_blank"
      rel="noopener"
      class="inline-flex items-center justify-center w-9 h-9 rounded-full text-slate-400 hover:text-slate-700"
      title="Code source GitHub"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.34-1.28-1.7-1.28-1.7-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.21-1.49 3.18-1.18 3.18-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.69 5.41-5.25 5.69.41.36.78 1.06.78 2.14 0 1.55-.01 2.8-.01 3.18 0 .31.21.68.8.56C20.71 21.39 24 17.08 24 12 24 5.65 18.85.5 12.5.5z" />
      </svg>
    </a>
  </footer>
</section>

<section id="state-loading" class="hidden min-h-screen flex items-center justify-center">
  <div class="text-center max-w-sm mx-auto px-4">
    <div class="spinner mx-auto mb-4"></div>
    <div class="font-semibold mb-1">Analyse en cours…</div>
    <div class="text-xs text-slate-500">
      Extraction du texte · Anonymisation · Détection des fautes
    </div>
    <div class="text-xs text-slate-400 mt-2">
      ≈ 10 secondes pour un CV d'une page
    </div>
  </div>
</section>

<section id="state-results" class="hidden">
  <!-- Filled in Task 6 -->
</section>

<section id="state-error" class="hidden min-h-screen flex items-center justify-center px-4">
  <!-- Filled in Task 10 -->
</section>
```

- [ ] **Step 2: Manual smoke**

Run from `frontend/`:

```bash
npm run build
python3 -m http.server 5173
```

Open `http://localhost:5173`. Expected:
- "ProofReader" title centered, font-weight bold.
- Dropzone visible with dashed border.
- "Parcourir mes fichiers" button.
- Privacy disclaimer below.
- GitHub icon in footer.
- States `loading`, `results`, `error` are hidden (you should NOT see them).

- [ ] **Step 3: Commit**

```bash
cd /home/secondary/PycharmProjects/piighost-proofreader
git add frontend/index.html
git commit -m "feat(frontend): empty state with dropzone, title, privacy disclaimer"
```

---

### Task 3: Dropzone upload validation (10 MB limit)

**Files:**
- Create: `frontend/src/js/upload.js`
- Modify: `frontend/src/js/main.js`

- [ ] **Step 1: Write `frontend/src/js/upload.js`**

```javascript
// Dropzone + file-picker logic with 10 MB validation.

const MAX_BYTES = 10 * 1024 * 1024;

/** Attach drop and click handlers to the dropzone element.
 *  Calls onFileAccepted(File) on success, onFileRejected({file, reason}) on failure. */
export function attachUpload({ dropzone, fileInput, onFileAccepted, onFileRejected }) {
  const handleFile = (file) => {
    if (!file) return;
    if (file.type !== "application/pdf") {
      onFileRejected({ file, reason: "not-pdf" });
      return;
    }
    if (file.size > MAX_BYTES) {
      onFileRejected({ file, reason: "too-large", sizeMb: file.size / 1024 / 1024 });
      return;
    }
    onFileAccepted(file);
  };

  fileInput.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    handleFile(file);
    fileInput.value = ""; // allow re-upload of same filename
  });

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("border-slate-500", "bg-slate-100");
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("border-slate-500", "bg-slate-100");
  });

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("border-slate-500", "bg-slate-100");
    const file = e.dataTransfer?.files?.[0];
    handleFile(file);
  });
}
```

- [ ] **Step 2: Wire it in `frontend/src/js/main.js`**

```javascript
import { attachUpload } from "./upload.js";

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("file-input");

attachUpload({
  dropzone,
  fileInput,
  onFileAccepted: (file) => {
    console.log("Accepted:", file.name, file.size);
    alert(`PDF accepté : ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} Mo)`);
  },
  onFileRejected: ({ file, reason, sizeMb }) => {
    if (reason === "too-large") {
      alert(`Fichier trop volumineux : ${sizeMb.toFixed(1)} Mo (limite 10 Mo)`);
    } else if (reason === "not-pdf") {
      alert(`Fichier non PDF : ${file.type}`);
    }
  },
});
```

- [ ] **Step 3: Manual smoke**

Reload `http://localhost:5173`:

1. Click "Parcourir mes fichiers", pick a valid PDF (≤ 10 Mo) → alert "PDF accepté".
2. Pick a PDF > 10 Mo → alert "Fichier trop volumineux".
3. Pick a non-PDF (.txt) → alert "Fichier non PDF".
4. Drag a valid PDF onto the dropzone → alert "PDF accepté".

- [ ] **Step 4: Commit**

```bash
git add frontend/src/js/upload.js frontend/src/js/main.js
git commit -m "feat(frontend): dropzone upload with 10 MB and PDF type validation"
```

---

### Task 4: State machine + loader transition

**Files:**
- Modify: `frontend/src/js/main.js`

- [ ] **Step 1: Replace `frontend/src/js/main.js` with a state machine**

```javascript
import { attachUpload } from "./upload.js";

const STATES = ["empty", "loading", "results", "error"];

function showState(name) {
  for (const s of STATES) {
    const el = document.getElementById(`state-${s}`);
    if (el) el.classList.toggle("hidden", s !== name);
  }
}

function renderErrorMessage(reason, details = {}) {
  const errorEl = document.getElementById("state-error");
  let icon = "⚠️";
  let title = "Erreur";
  let body = "";

  if (reason === "too-large") {
    icon = "⚠️";
    title = "Fichier trop volumineux";
    body = `${details.sizeMb.toFixed(1)} Mo · limite 10 Mo`;
  } else if (reason === "not-pdf") {
    icon = "📄❌";
    title = "Format non supporté";
    body = "Uniquement les fichiers PDF sont acceptés.";
  }

  errorEl.innerHTML = `
    <div class="max-w-md mx-auto text-center p-8 border border-red-300 rounded-2xl bg-red-50">
      <div class="text-4xl mb-2">${icon}</div>
      <div class="font-semibold text-red-800 mb-1">${title}</div>
      <div class="text-sm text-red-700">${body}</div>
      <button id="retry-from-error" class="mt-4 px-5 py-2 bg-slate-900 text-white text-sm rounded-lg hover:bg-slate-800">
        Choisir un autre fichier
      </button>
    </div>
  `;
  document.getElementById("retry-from-error").addEventListener("click", () => {
    showState("empty");
  });
}

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("file-input");

attachUpload({
  dropzone,
  fileInput,
  onFileAccepted: async (file) => {
    showState("loading");
    // Phase 1: just simulate the load. Real backend wired in phase 3.
    await new Promise((r) => setTimeout(r, 1500));
    showState("results");
  },
  onFileRejected: (info) => {
    renderErrorMessage(info.reason, info);
    showState("error");
  },
});

showState("empty");
```

- [ ] **Step 2: Manual smoke**

Reload page:

1. Upload a valid PDF → loader visible for ~1.5 s → state-results becomes visible (currently empty section, that's expected).
2. Click "↻" hard-refresh, upload a PDF > 10 Mo → red error card appears, "Choisir un autre fichier" button works (returns to empty state).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/js/main.js
git commit -m "feat(frontend): state machine with loader and inline error states"
```

---

### Task 5: Sample fake JSON fixture

**Files:**
- Create: `frontend/src/js/fakes/sample-result.json`

- [ ] **Step 1: Build a sample PDF and extract base64**

Run from `piighost-proofreader/`:

```bash
uv run python -c "
import base64, fitz
doc = fitz.open()
page = doc.new_page()
page.insert_text((72, 100), 'Voici un exemple simple avec mot mot dans une phrase.', fontsize=14)
page.insert_text((72, 130), 'Une faute ortho ici et une autre la.', fontsize=14)
doc.save('/tmp/fake.pdf')
print(base64.b64encode(open('/tmp/fake.pdf', 'rb').read()).decode())
" | tail -1 > /tmp/fake-b64.txt
echo \"$(wc -c < /tmp/fake-b64.txt) chars\"
```

Expected: ~2-5 KB of base64 in `/tmp/fake-b64.txt`.

- [ ] **Step 2: Write `frontend/src/js/fakes/sample-result.json`**

Inline the base64 string from step 1 into the `pdf_base64` field. Use the bbox coordinates that PyMuPDF would emit for the sample sentence (page width 612 pt, height 792 pt for letter size, but PyMuPDF defaults A4 595×842).

Bboxes below are typical text positions for the sample at 14 pt around y=100 and y=130:

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
  "pdf_base64": "REPLACE_WITH_BASE64_FROM_STEP_1"
}
```

Replace `REPLACE_WITH_BASE64_FROM_STEP_1` with the actual base64 from `/tmp/fake-b64.txt`.

- [ ] **Step 3: Manual smoke**

```bash
cat frontend/src/js/fakes/sample-result.json | python3 -c "import json, sys; d = json.load(sys.stdin); print(d.keys(), len(d['mistakes']), 'mistakes')"
```

Expected: 5 mistakes printed, JSON parses cleanly.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/js/fakes/sample-result.json
git commit -m "feat(frontend): add sample-result.json fixture for offline development"
```

---

### Task 6: State 2 layout (split 50/50 + top bar)

**Files:**
- Modify: `frontend/index.html`
- Modify: `frontend/src/js/main.js`

- [ ] **Step 1: Fill `#state-results` in `frontend/index.html`**

Replace `<!-- Filled in Task 6 -->` with:

```html
<div class="max-w-container mx-auto px-8 py-6">
  <div class="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-5 py-3 mb-5">
    <div class="flex items-center gap-2">
      <span id="result-filename" class="font-semibold">CV.pdf</span>
      <span id="result-counter" class="text-xs text-slate-500">— fautes</span>
    </div>
    <button
      id="new-pdf-btn"
      class="px-3.5 py-1.5 text-xs bg-slate-900 text-white rounded-md hover:bg-slate-800"
    >
      ↻ Nouveau PDF
    </button>
  </div>

  <div class="flex gap-5" style="height: calc(100vh - 160px);">
    <div
      id="pdf-panel"
      class="flex-1 overflow-y-auto bg-white border border-slate-200 rounded-xl p-6"
    >
      <p class="text-xs text-slate-400">Panneau PDF (rendu en Task 7)</p>
    </div>
    <div
      id="mistakes-panel"
      class="flex-1 overflow-y-auto bg-white border border-slate-200 rounded-xl p-5"
    >
      <p class="text-xs text-slate-400">Liste de fautes (rendue en Task 9)</p>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Wire the file name + reset in `frontend/src/js/main.js`**

Replace the body of `onFileAccepted` with:

```javascript
  onFileAccepted: async (file) => {
    showState("loading");
    await new Promise((r) => setTimeout(r, 1000));
    document.getElementById("result-filename").textContent = file.name;
    document.getElementById("result-counter").textContent = "— en cours de rendu";
    showState("results");
  },
```

Add at the very bottom of `main.js`:

```javascript
document.getElementById("new-pdf-btn").addEventListener("click", () => {
  showState("empty");
});
```

- [ ] **Step 3: Rebuild + smoke**

```bash
cd frontend && npm run build
```

Reload page. Upload a PDF → loader → results layout visible with file name in the top bar, two empty panels, "Nouveau PDF" returns to state-empty.

- [ ] **Step 4: Commit**

```bash
git add frontend/index.html frontend/src/js/main.js
git commit -m "feat(frontend): state 2 layout — top bar + 50/50 split panels"
```

---

### Task 7: PDF.js setup + page rendering

**Files:**
- Download: `frontend/public/pdfjs/build/pdf.mjs`, `frontend/public/pdfjs/build/pdf.worker.mjs`
- Create: `frontend/src/js/render.js`
- Modify: `frontend/src/js/main.js`
- Modify: `frontend/index.html` (add import map for PDF.js)

- [ ] **Step 1: Download pdfjs-dist 4.x static**

Run from `piighost-proofreader/`:

```bash
curl -L -o /tmp/pdfjs.zip https://github.com/mozilla/pdf.js/releases/download/v4.6.82/pdfjs-4.6.82-legacy-dist.zip
unzip -o /tmp/pdfjs.zip -d /tmp/pdfjs-unpack
cp /tmp/pdfjs-unpack/build/pdf.mjs frontend/public/pdfjs/build/pdf.mjs
cp /tmp/pdfjs-unpack/build/pdf.worker.mjs frontend/public/pdfjs/build/pdf.worker.mjs
ls -lh frontend/public/pdfjs/build/
```

Expected: both `.mjs` files present, each between 0.5–2 MB.

- [ ] **Step 2: Add import map to `frontend/index.html`**

Inside `<head>` before the `<title>` tag, add:

```html
<script type="importmap">
  {
    "imports": {
      "pdfjs-dist": "/public/pdfjs/build/pdf.mjs"
    }
  }
</script>
```

- [ ] **Step 3: Write `frontend/src/js/render.js`**

```javascript
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = "/public/pdfjs/build/pdf.worker.mjs";

/** Decode a base64-encoded PDF string into a Uint8Array. */
export function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Render every page of the PDF into the target element.
 *  Returns an array of { page, canvas, viewport } for later overlay positioning. */
export async function renderPdfTo(target, bytes) {
  target.innerHTML = "";
  const loadingTask = pdfjsLib.getDocument({ data: bytes });
  const pdf = await loadingTask.promise;
  const pages = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.25 });
    const wrapper = document.createElement("div");
    wrapper.className = "pdf-page";
    wrapper.dataset.pageIndex = String(i - 1);
    wrapper.style.width = `${viewport.width}px`;
    wrapper.style.height = `${viewport.height}px`;

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    wrapper.appendChild(canvas);
    target.appendChild(wrapper);

    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;
    pages.push({ pageIndex: i - 1, canvas, viewport, wrapper });
  }

  return pages;
}
```

- [ ] **Step 4: Wire it in `frontend/src/js/main.js`**

Add imports at the top:

```javascript
import { base64ToBytes, renderPdfTo } from "./render.js";
```

Replace the `onFileAccepted` body with:

```javascript
  onFileAccepted: async (file) => {
    showState("loading");
    // Phase 1: always render the fake fixture, ignoring the uploaded file content.
    const response = await fetch("./src/js/fakes/sample-result.json");
    const data = await response.json();
    document.getElementById("result-filename").textContent = file.name;
    document.getElementById("result-counter").textContent = `· ${data.mistakes.length} fautes`;
    showState("results");

    const pdfPanel = document.getElementById("pdf-panel");
    const bytes = base64ToBytes(data.pdf_base64);
    await renderPdfTo(pdfPanel, bytes);
    window.__lastResult = { data, pages: [], pdfPanel }; // exposed for next tasks
  },
```

- [ ] **Step 5: Manual smoke**

```bash
cd frontend && npm run build
python3 -m http.server 5173
```

Reload `http://localhost:5173`. Upload any PDF → loader → state 2 → the left panel shows the SAMPLE PDF rendered (the uploaded file content is ignored in phase 1). Counter shows "· 5 fautes".

- [ ] **Step 6: Commit**

```bash
cd /home/secondary/PycharmProjects/piighost-proofreader
git add frontend/public/pdfjs/build/ frontend/src/js/render.js frontend/src/js/main.js frontend/index.html
git commit -m "feat(frontend): render PDF.js pages from fake JSON base64"
```

---

### Task 8: Highlight overlays on PDF pages

**Files:**
- Modify: `frontend/src/js/render.js`

- [ ] **Step 1: Add overlay function to `frontend/src/js/render.js`**

Append:

```javascript
/** Draw absolute-positioned overlay divs over each rendered page based on
 *  mistake bboxes. Returns a Map<mistakeIndex, HTMLElement>. */
export function drawHighlights(pages, mistakes) {
  const overlays = new Map();
  mistakes.forEach((m, idx) => {
    const target = pages.find((p) => p.pageIndex === m.page);
    if (!target) return;
    const { viewport, wrapper } = target;
    const [x0, y0, x1, y1] = m.bbox;
    // PyMuPDF bboxes are (x0, top, x1, bottom) in PDF points with y0 at the top.
    // PDF.js viewport uses the same orientation when constructed at scale.
    const scale = viewport.scale;
    const el = document.createElement("div");
    el.className = "pdf-highlight default";
    el.dataset.mistakeIndex = String(idx);
    el.style.left = `${x0 * scale}px`;
    el.style.top = `${y0 * scale}px`;
    el.style.width = `${(x1 - x0) * scale}px`;
    el.style.height = `${(y1 - y0) * scale}px`;
    wrapper.appendChild(el);
    overlays.set(idx, el);
  });
  return overlays;
}
```

- [ ] **Step 2: Call `drawHighlights` from `main.js`**

Replace `window.__lastResult = ...` in `onFileAccepted` with:

```javascript
    const pages = await renderPdfTo(pdfPanel, bytes);
    const { drawHighlights } = await import("./render.js");
    const overlays = drawHighlights(pages, data.mistakes);
    window.__lastResult = { data, pages, overlays, pdfPanel };
```

(The `renderPdfTo` call should remain capturing pages.)

Adjust the surrounding code so `renderPdfTo` result is assigned to `const pages` (it already returns the array).

Final shape of the relevant block:

```javascript
    const pdfPanel = document.getElementById("pdf-panel");
    const bytes = base64ToBytes(data.pdf_base64);
    const pages = await renderPdfTo(pdfPanel, bytes);
    const overlays = drawHighlights(pages, data.mistakes);
    window.__lastResult = { data, pages, overlays, pdfPanel };
```

Also adjust the imports at the top of `main.js`:

```javascript
import { base64ToBytes, renderPdfTo, drawHighlights } from "./render.js";
```

(Remove the dynamic `await import(...)` from step 2 above; just use the static import.)

- [ ] **Step 3: Manual smoke**

Rebuild + reload. Upload any PDF. Expected:
- PDF rendered in left panel.
- 5 red semi-transparent rectangles visible over text in the PDF (positions may not be perfectly aligned because the fixture bboxes are approximate, but they should overlap text on the page).

If highlights are visibly off (e.g. on a blank area), note the offset — this is expected for now; the fixture is approximate. The real backend will provide exact bboxes in phase 3.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/js/render.js frontend/src/js/main.js
git commit -m "feat(frontend): bbox overlays positioned over PDF.js canvas"
```

---

### Task 9: Mistakes list panel with toggle + active state

**Files:**
- Create: `frontend/src/js/mistakes.js`
- Modify: `frontend/src/js/main.js`

- [ ] **Step 1: Write `frontend/src/js/mistakes.js`**

```javascript
const TYPE_STYLES = {
  orthographe: "bg-red-100 text-red-800",
  accord: "bg-red-100 text-red-800",
  grammaire: "bg-amber-100 text-amber-800",
  conjugaison: "bg-blue-100 text-blue-800",
  ponctuation: "bg-violet-100 text-violet-800",
};

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Render the mistakes list and bind toggle + click interactions.
 *  - Checking/unchecking a row toggles the `.hidden` class on the overlay.
 *  - Clicking a row body (not the checkbox) marks it as the unique active mistake. */
export function renderMistakes({ panel, mistakes, overlays }) {
  panel.innerHTML = "";

  const header = document.createElement("div");
  header.className = "flex items-center gap-2 mb-3 pb-2 border-b border-slate-200";
  header.innerHTML = `
    <input id="toggle-all" type="checkbox" checked class="rounded">
    <span class="text-xs text-slate-500">Tout cocher / décocher</span>
    <span id="count-visible" class="text-xs text-slate-500 ml-auto"></span>
  `;
  panel.appendChild(header);

  const list = document.createElement("div");
  list.id = "mistakes-list";
  panel.appendChild(list);

  let activeIndex = null;

  const updateCounter = () => {
    const visible = mistakes.filter((_, i) => {
      const card = list.querySelector(`[data-index="${i}"] input[type="checkbox"]`);
      return card?.checked;
    }).length;
    document.getElementById("count-visible").textContent = `${visible} / ${mistakes.length} visibles`;
  };

  const setActive = (idx) => {
    if (activeIndex !== null) {
      const prev = list.querySelector(`[data-index="${activeIndex}"]`);
      if (prev) prev.classList.remove("border-amber-500", "bg-amber-50", "border-2");
      const prevBadge = prev?.querySelector("[data-active-badge]");
      if (prevBadge) prevBadge.classList.add("hidden");
      const prevEl = overlays.get(activeIndex);
      if (prevEl && !prevEl.classList.contains("hidden")) {
        prevEl.classList.remove("active");
        prevEl.classList.add("default");
      }
    }
    activeIndex = idx;
    if (idx === null) return;
    const card = list.querySelector(`[data-index="${idx}"]`);
    if (card) card.classList.add("border-amber-500", "bg-amber-50", "border-2");
    const badge = card?.querySelector("[data-active-badge]");
    if (badge) badge.classList.remove("hidden");
    const el = overlays.get(idx);
    if (el) {
      el.classList.remove("default");
      el.classList.add("active");
      // Scroll PDF panel until the highlight is visible
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  mistakes.forEach((m, i) => {
    const card = document.createElement("div");
    card.dataset.index = String(i);
    card.className = "flex items-start gap-2 p-2.5 border border-slate-200 rounded-lg mb-2 bg-white cursor-pointer";
    const typeClass = TYPE_STYLES[m.type] || "bg-slate-100 text-slate-700";
    card.innerHTML = `
      <input type="checkbox" checked class="mt-0.5 rounded" data-role="toggle">
      <div class="flex-1 text-xs">
        <div class="flex items-center justify-between mb-0.5">
          <span class="${typeClass} text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase">${m.type}</span>
          <span data-active-badge class="hidden text-[10px] text-amber-700 font-semibold">🎯 ACTIVE</span>
        </div>
        <div>
          <s class="text-red-600">${escapeHtml(m.error_text)}</s>
          → <b class="text-green-600">${escapeHtml(m.correction)}</b>
        </div>
        <div class="text-slate-500 text-[11px] mt-0.5">${escapeHtml(m.description)}</div>
      </div>
    `;
    list.appendChild(card);

    const checkbox = card.querySelector('[data-role="toggle"]');
    checkbox.addEventListener("change", (e) => {
      e.stopPropagation();
      const el = overlays.get(i);
      if (!el) return;
      if (checkbox.checked) {
        el.classList.remove("hidden");
        card.classList.remove("opacity-60", "bg-slate-50");
      } else {
        el.classList.add("hidden");
        card.classList.add("opacity-60", "bg-slate-50");
        if (activeIndex === i) setActive(null);
      }
      updateCounter();
    });

    card.addEventListener("click", (e) => {
      if (e.target.tagName === "INPUT") return; // ignore checkbox clicks
      if (!checkbox.checked) return; // can't activate a hidden one
      setActive(i === activeIndex ? null : i);
    });
  });

  document.getElementById("toggle-all").addEventListener("change", (e) => {
    const checked = e.target.checked;
    list.querySelectorAll('[data-role="toggle"]').forEach((cb) => {
      if (cb.checked !== checked) cb.click();
    });
  });

  updateCounter();
}
```

- [ ] **Step 2: Wire it in `frontend/src/js/main.js`**

Add at the top:

```javascript
import { renderMistakes } from "./mistakes.js";
```

After `drawHighlights`, append:

```javascript
    const mistakesPanel = document.getElementById("mistakes-panel");
    renderMistakes({ panel: mistakesPanel, mistakes: data.mistakes, overlays });
```

- [ ] **Step 3: Manual smoke**

Rebuild + reload. Upload any PDF. Expected:
- Right panel shows 5 cards with checkboxes, type badges, strikethrough text + correction.
- All 5 cards have red highlights on the PDF.
- Uncheck one → its red highlight disappears + card fades to ~60% opacity.
- Click one card body → border turns amber + "🎯 ACTIVE" badge appears + highlight turns yellow + PDF scrolls.
- Click another → previous loses active, new one gains it.
- Click "Tout cocher / décocher" → all cards flip in sync.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/js/mistakes.js frontend/src/js/main.js
git commit -m "feat(frontend): mistakes list with toggle, active state, and scroll-into-view"
```

---

### Task 10: Inline error states (backend down, rate limit, no text layer, 0 mistakes)

**Files:**
- Modify: `frontend/src/js/main.js`

- [ ] **Step 1: Extend `renderErrorMessage` in `frontend/src/js/main.js`**

Replace the existing `renderErrorMessage` with:

```javascript
function renderErrorMessage(reason, details = {}) {
  const errorEl = document.getElementById("state-error");
  const presets = {
    "too-large": {
      icon: "⚠️",
      title: "Fichier trop volumineux",
      body: `${(details.sizeMb || 0).toFixed(1)} Mo · limite 10 Mo`,
      tone: "red",
      action: "Choisir un autre fichier",
    },
    "not-pdf": {
      icon: "📄❌",
      title: "Format non supporté",
      body: "Uniquement les fichiers PDF sont acceptés.",
      tone: "red",
      action: "Choisir un autre fichier",
    },
    "no-text-layer": {
      icon: "📄❌",
      title: "PDF non lisible",
      body: "Aucun texte trouvé. Le PDF semble être un scan, l'OCR n'est pas supporté.",
      tone: "red",
      action: "Essayer un autre PDF",
    },
    "backend-down": {
      icon: "🔌",
      title: "Service indisponible",
      body: "Réessayez dans quelques instants. Si ça persiste, signalez sur GitHub.",
      tone: "amber",
      action: "Réessayer",
    },
    "rate-limit": {
      icon: "⏳",
      title: "Trop de requêtes",
      body: `Quota atteint pour cette IP. Réessayez dans ${details.retryInSec || 120} secondes.`,
      tone: "amber",
      action: "Réessayer (compteur)",
    },
  };
  const p = presets[reason] || {
    icon: "⚠️", title: "Erreur", body: String(reason), tone: "red", action: "Retour",
  };
  const borderTone = p.tone === "amber" ? "border-amber-300 bg-amber-50" : "border-red-300 bg-red-50";
  const textTone = p.tone === "amber" ? "text-amber-800" : "text-red-800";

  errorEl.innerHTML = `
    <div class="max-w-md mx-auto text-center p-8 border rounded-2xl ${borderTone}">
      <div class="text-4xl mb-2">${p.icon}</div>
      <div class="font-semibold ${textTone} mb-1">${p.title}</div>
      <div class="text-sm ${textTone}">${p.body}</div>
      <button id="retry-from-error" class="mt-4 px-5 py-2 bg-slate-900 text-white text-sm rounded-lg hover:bg-slate-800">
        ${p.action}
      </button>
    </div>
  `;
  document.getElementById("retry-from-error").addEventListener("click", () => {
    showState("empty");
  });
}
```

- [ ] **Step 2: Handle "0 mistakes" case (keep state 2 layout)**

In `onFileAccepted`, just after `renderMistakes(...)`, add:

```javascript
    if (data.mistakes.length === 0) {
      mistakesPanel.innerHTML = `
        <div class="h-full flex items-center justify-center px-8">
          <div class="text-center max-w-xs">
            <div class="text-5xl mb-3">✅</div>
            <div class="font-semibold text-emerald-800 mb-1">Aucune faute détectée</div>
            <div class="text-sm text-slate-500 leading-relaxed">
              Le LLM a analysé votre CV et n'a rien trouvé à corriger.
            </div>
          </div>
        </div>
      `;
      document.getElementById("result-counter").textContent = "· ✓ aucune faute";
      document.getElementById("result-counter").className = "text-xs text-emerald-700 font-semibold";
    }
```

- [ ] **Step 3: Add a temporary debug trigger to test each error case**

At the very bottom of `main.js`:

```javascript
// Phase 1 only: ?error=NAME forces an error state for testing.
const errorTrigger = new URLSearchParams(location.search).get("error");
if (errorTrigger) {
  renderErrorMessage(errorTrigger, { sizeMb: 14.3, retryInSec: 120 });
  showState("error");
}
```

- [ ] **Step 4: Manual smoke**

For each URL below, reload and confirm the matching state appears:

```
http://localhost:5173/?error=too-large       → red card "Fichier trop volumineux"
http://localhost:5173/?error=not-pdf         → red card "Format non supporté"
http://localhost:5173/?error=no-text-layer   → red card "PDF non lisible"
http://localhost:5173/?error=backend-down    → amber card "Service indisponible"
http://localhost:5173/?error=rate-limit      → amber card "Trop de requêtes"
```

Then test "0 mistakes": temporarily edit `sample-result.json` to set `"mistakes": []`, reload, upload any PDF → state 2 shows PDF on the left, ✅ message on the right. Restore the 5 mistakes after.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/js/main.js
git commit -m "feat(frontend): all error states (too large, no text layer, backend, rate limit, 0 mistakes)"
```

---

### Task 11: Debug section gated behind ?debug=1

**Files:**
- Create: `frontend/src/js/debug.js`
- Modify: `frontend/index.html`
- Modify: `frontend/src/js/main.js`

- [ ] **Step 1: Append debug section + floating button to `frontend/index.html`**

Just before `<script type="module" src="src/js/main.js"></script>` add:

```html
<aside id="debug-section" class="hidden max-w-container mx-auto px-8 pb-12">
  <div class="bg-white border border-slate-200 rounded-xl p-5 mt-2">
    <div class="flex items-center justify-between mb-3">
      <h2 class="text-sm font-semibold">Debug</h2>
      <button
        id="download-dump-btn"
        class="px-3 py-1.5 text-xs bg-slate-900 text-white rounded-md hover:bg-slate-800"
      >
        ⬇ Download pipeline dump (JSON)
      </button>
    </div>
    <p id="debug-stats" class="text-xs text-slate-500 mb-3"></p>
    <details class="mb-2">
      <summary class="text-xs font-semibold cursor-pointer">Markdown extracted</summary>
      <pre id="debug-md-raw" class="text-[11px] bg-slate-50 p-2 mt-1 rounded overflow-auto max-h-60"></pre>
    </details>
    <details class="mb-2">
      <summary class="text-xs font-semibold cursor-pointer">Anonymized Markdown (LLM input)</summary>
      <pre id="debug-md-anon" class="text-[11px] bg-slate-50 p-2 mt-1 rounded overflow-auto max-h-60"></pre>
    </details>
    <details class="mb-2">
      <summary class="text-xs font-semibold cursor-pointer">Raw LLM mistakes</summary>
      <pre id="debug-raw" class="text-[11px] bg-slate-50 p-2 mt-1 rounded overflow-auto max-h-60"></pre>
    </details>
    <details>
      <summary class="text-xs font-semibold cursor-pointer">Word stream (PyMuPDF)</summary>
      <pre id="debug-words" class="text-[11px] bg-slate-50 p-2 mt-1 rounded overflow-auto max-h-60"></pre>
    </details>
  </div>
</aside>

<button
  id="debug-toggle"
  title="Toggle debug"
  class="fixed bottom-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-slate-900 text-white opacity-40 hover:opacity-100 transition-opacity text-base"
>
  🔧
</button>
```

- [ ] **Step 2: Write `frontend/src/js/debug.js`**

```javascript
let isVisible = false;

export function isDebugEnabled() {
  return new URLSearchParams(location.search).get("debug") === "1";
}

export function attachDebug() {
  const section = document.getElementById("debug-section");
  const toggle = document.getElementById("debug-toggle");
  if (isDebugEnabled()) section.classList.remove("hidden");
  toggle.addEventListener("click", () => {
    isVisible = !isVisible;
    section.classList.toggle("hidden", !isVisible);
  });
}

export function renderDebug(data) {
  const section = document.getElementById("debug-section");
  if (!section) return;
  document.getElementById("debug-stats").textContent =
    `language=${data.language || "?"} · pages=${data.page_count || "?"} · mistakes=${data.mistakes?.length || 0}`;
  document.getElementById("debug-md-raw").textContent = data.markdown_raw || "(not provided in phase 1)";
  document.getElementById("debug-md-anon").textContent = data.markdown_anonymized || "(not provided in phase 1)";
  document.getElementById("debug-raw").textContent = JSON.stringify(data.mistakes || [], null, 2);
  document.getElementById("debug-words").textContent = JSON.stringify(data.word_stream || [], null, 2);
  document.getElementById("download-dump-btn").onclick = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `proofreader-dump-${Date.now()}.json`;
    a.click();
  };
}
```

- [ ] **Step 3: Wire in `frontend/src/js/main.js`**

At the top:

```javascript
import { attachDebug, renderDebug } from "./debug.js";
```

After `renderMistakes(...)`:

```javascript
    renderDebug(data);
```

At the very bottom of the file:

```javascript
attachDebug();
```

- [ ] **Step 4: Manual smoke**

1. Reload `http://localhost:5173/` → debug section hidden, but the 🔧 button is visible bottom-right.
2. Click 🔧 → debug section appears below the results.
3. Reload `http://localhost:5173/?debug=1` → debug section visible from the start.
4. Upload a PDF → debug stats populate ("language=fr · pages=1 · mistakes=5").
5. Click "Download pipeline dump (JSON)" → a JSON file downloads.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/js/debug.js frontend/index.html frontend/src/js/main.js
git commit -m "feat(frontend): debug section gated by ?debug=1 with download dump"
```

---

### Task 12: Mobile stacking under 1024 px

**Files:**
- Modify: `frontend/index.html`

- [ ] **Step 1: Replace the split container CSS classes**

Locate the block inside `#state-results`:

```html
  <div class="flex gap-5" style="height: calc(100vh - 160px);">
```

Replace with:

```html
  <div class="flex flex-col lg:flex-row gap-5 lg:h-[calc(100vh-160px)]">
```

And modify the two child panels:

```html
    <div
      id="pdf-panel"
      class="flex-1 overflow-y-auto bg-white border border-slate-200 rounded-xl p-6 min-h-[60vh] lg:min-h-0"
    >
```

```html
    <div
      id="mistakes-panel"
      class="flex-1 overflow-y-auto bg-white border border-slate-200 rounded-xl p-5 min-h-[40vh] lg:min-h-0"
    >
```

Also tighten the outer container padding on small screens. Change:

```html
<div class="max-w-container mx-auto px-8 py-6">
```

to:

```html
<div class="max-w-container mx-auto px-4 lg:px-8 py-4 lg:py-6">
```

- [ ] **Step 2: Manual smoke**

Rebuild Tailwind so the `lg:` variants compile:

```bash
cd frontend && npm run build
```

Reload page, upload a PDF.

1. At ≥ 1024 px width → PDF and list side by side (same as before).
2. Resize browser to 800 px → panels stack vertically, PDF on top, list below.
3. Both panels remain scrollable.
4. Top bar still readable at narrow widths.

- [ ] **Step 3: Commit**

```bash
git add frontend/index.html
git commit -m "feat(frontend): responsive stack under lg breakpoint (<1024 px)"
```

---

### Task 13: Fake mode (?fake=1) and final dev script

**Files:**
- Modify: `frontend/src/js/main.js`
- Modify: `frontend/package.json` (already done, just confirm)

- [ ] **Step 1: Add `?fake=1` short-circuit at the top of `main.js`**

Just after the imports, add:

```javascript
const fakeMode = new URLSearchParams(location.search).get("fake") === "1";
```

Then, at the very bottom (after `attachDebug()`):

```javascript
if (fakeMode) {
  // Bypass the file picker entirely: load and render the fake fixture.
  (async () => {
    showState("loading");
    const response = await fetch("./src/js/fakes/sample-result.json");
    const data = await response.json();
    document.getElementById("result-filename").textContent = data.filename || "fake-cv.pdf";
    document.getElementById("result-counter").textContent = `· ${data.mistakes.length} fautes`;
    showState("results");

    const pdfPanel = document.getElementById("pdf-panel");
    const bytes = base64ToBytes(data.pdf_base64);
    const pages = await renderPdfTo(pdfPanel, bytes);
    const overlays = drawHighlights(pages, data.mistakes);
    const mistakesPanel = document.getElementById("mistakes-panel");
    renderMistakes({ panel: mistakesPanel, mistakes: data.mistakes, overlays });
    renderDebug(data);
    window.__lastResult = { data, pages, overlays };
  })();
}
```

- [ ] **Step 2: Manual smoke**

```bash
cd frontend && npm run build
python3 -m http.server 5173
```

Open `http://localhost:5173/?fake=1` directly → state 2 displayed immediately without any upload, PDF rendered, 5 highlights overlaid, mistakes list populated. Test toggle / active works.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/js/main.js
git commit -m "feat(frontend): ?fake=1 dev mode to bypass upload"
```

---

### Task 14: Final acceptance walkthrough

**Files:**
- None (manual validation only).

- [ ] **Step 1: Build + serve**

```bash
cd /home/secondary/PycharmProjects/piighost-proofreader/frontend
npm run build
python3 -m http.server 5173
```

- [ ] **Step 2: Walk through all 10 acceptance criteria from the spec**

For each, validate manually and tick the box:

1. **`http://localhost:5173/`** → state 1 visible, dropzone centered. Confirm at 1440 px and 1024 px widths.
2. **Drag a PDF > 10 Mo** → red error card immediate, no network upload (check DevTools Network tab is empty).
3. **Drag a valid PDF** → loader visible ~1 s → state 2 displayed.
4. **5 red highlights** visible on PDF at the correct (approximate) positions.
5. **Uncheck a faute** → its red highlight disappears.
6. **Click a card body** → amber border + amber highlight + PDF auto-scrolls.
7. **Click another card** → previous loses active.
8. **`?debug=1`** → debug section visible with stats + JSON dumps + download button.
9. **Resize < 1024 px** → vertical stack, no scroll bug.
10. **Click "↻ Nouveau PDF"** → instantly back to state 1, no confirmation.

- [ ] **Step 3: Final commit (only if you tweaked anything during validation)**

```bash
cd /home/secondary/PycharmProjects/piighost-proofreader
git status
# if dirty:
git add -p
git commit -m "chore(frontend): final acceptance tweaks"
```
