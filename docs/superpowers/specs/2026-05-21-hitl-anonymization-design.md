# HITL Anonymisation Review — design

**Status :** approved
**Date :** 2026-05-21
**Phase :** 3 (HITL) après la phase 2 (FastAPI backend SSE)
**Inspiration :** pattern HITL de `piighost-chat` (`POST /api/detect` + `PUT /api/detect` + `POST /api/chat`)

## Goal

Introduire une **pause obligatoire** entre l'extraction Markdown du PDF et l'appel LLM, pour permettre à l'utilisateur de réviser ce que `piighost-api` a détecté comme PII. L'utilisateur peut :

1. Voir les détections initiales surlignées sur le PDF (highlights bleus) et listées dans un panneau latéral.
2. **Ajouter** une détection en sélectionnant du texte sur le PDF via le text layer PDF.js.
3. **Supprimer** une détection (croix sur la carte).
4. **Re-labelliser** une détection via un menu déroulant.

Une fois validé, le pipeline continue avec ces overrides : anonymisation enrichie → LLM stream → fautes localisées (comme phase 2).

## Non-goals

- Pas de modification du `?fake=1` mode existant — il sera juste étendu pour simuler aussi l'état de review.
- Pas de cache server-side du PDF entre les deux requêtes HTTP — le frontend ré-uploade le file. Optimisation possible plus tard.
- Pas de support pour la sélection multi-occurrences avec choix de l'occurrence — quand l'user ajoute "Acme", **toutes** les occurrences sont anonymisées. Documenté.
- Pas de persistance des overrides entre uploads — chaque PDF démarre vierge.

## Architecture globale

Pipeline coupé en deux requêtes HTTP séquentielles :

```
1. POST /api/detect-pii  (multipart file)
   └─ extract markdown via opendataloader
   └─ detect via piighost-api
   └─ map start_pos/end_pos to PDF bboxes via PyMuPDF word stream
   └─ return JSON { thread_id, markdown, detections, page_sizes, … }

2. UI review (frontend state "reviewing")
   └─ PDF rendu + text layer PDF.js
   └─ highlights bleus pour détections
   └─ user édite (ajoute / supprime / re-labellise)

3. POST /api/proofread  (multipart file + thread_id + overrides JSON)
   └─ piighost-api override_detections avec la liste finale
   └─ anonymize → LLM stream → deanonymize → locate
   └─ SSE stream identique phase 2
```

Les ports + le déploiement nginx + FastAPI restent identiques à la phase 2. Aucun nouveau service.

## Contrat API

### `POST /api/detect-pii` (nouveau)

- **Request** : `multipart/form-data` avec `file` (PDF, ≤ 10 Mo).
- **Validation pré-traitement** (identique à `/api/proofread`) :
  - `413` si > 10 Mo
  - `415` si `content_type != "application/pdf"`
  - `422` si extraction Markdown vide (PDF scanné)
- **Response** : `application/json` (pas de SSE — l'opération prend ~2-3 s : extraction + détection)

```json
{
  "thread_id": "uuid-...",
  "language": "fr",
  "page_count": 1,
  "page_sizes": [{ "page": 0, "width_pt": 595.0, "height_pt": 842.0 }],
  "markdown": "Voici un exemple…",
  "detections": [
    {
      "text": "Pierre Chaumont",
      "label": "PERSON",
      "start_pos": 0,
      "end_pos": 15,
      "page": 0,
      "bbox": [55.0, 84.0, 180.0, 104.0],
      "confidence": 0.97
    },
    {
      "text": "Lyon",
      "label": "LOCATION",
      "start_pos": 220,
      "end_pos": 224,
      "page": 0,
      "bbox": [410.0, 305.0, 450.0, 320.0],
      "confidence": 0.88
    }
  ]
}
```

Multi-occurrence : si une détection apparaît N fois dans le PDF (ex. "Pierre" en headline et en signature), elle est listée N fois — chaque entry avec son propre `bbox` + `start_pos`. Le frontend les regroupe par `text` pour l'affichage liste si pertinent.

### `POST /api/proofread` (modifié)

- **Request** : `multipart/form-data` avec :
  - `file` (PDF, identique)
  - `thread_id` (form field, optional — fourni par `/api/detect-pii`)
  - `overrides` (form field JSON-encoded string, optional)
- **Format `overrides`** :

```json
[
  { "text": "Acme Corp", "label": "ORGANIZATION" },
  { "text": "Pierre Chaumont", "label": "PERSON", "remove": true },
  { "text": "Lyon", "label": "LOCATION" }
]
```

  - **Sans `remove`** → ajout : le backend cherche toutes les occurrences de `text` dans le markdown et les ajoute à la liste finale.
  - **Avec `remove: true`** → suppression : le backend retire les Detection initiales qui matchent `text+label`.
  - **Re-label** : combinaison de remove de l'ancien + add du nouveau (deux entries).

- **Response** : SSE identique à phase 2 — `meta / progress / mistake / unlocatable / debug / done / error`. Aucun changement de contrat côté streaming.

### `GET /api/labels` (nouveau)

- **Response** :

```json
{ "labels": ["PERSON", "LOCATION", "ORGANIZATION", "EMAIL", "PHONE", "DATE", "..."] }
```

Liste fournie par piighost-api (via `client.get_labels()` → wrapper de `/v1/config`). Cachée côté frontend pour la session.

## Mapping PDF → markdown

Le challenge clé : l'user sélectionne sur le **PDF text layer** (PDF.js extrait via `page.getTextContent()`), mais piighost-api raisonne sur le **markdown extrait** par `opendataloader-pdf`. Les deux n'ont pas la même tokenisation ni la même structure.

**Solution pragmatique** : le frontend n'envoie que le **texte sélectionné** (string brute), pas de positions. Le backend fait `markdown.find(text)` pour toutes les occurrences et passe à `piighost-api.override_detections` un `Detection` par occurrence. Conséquence assumée : si l'user sélectionne "de", toutes les occurrences de "de" sont anonymisées. Pour réduire les faux positifs, le frontend impose une **longueur minimale de 2 caractères** (heuristique simple) et nettoie les whitespaces de bord.

Si le texte sélectionné est introuvable dans le markdown (par exemple à cause d'une différence de formatage), le backend log un warning et **skip** silencieusement — pas d'erreur fatale.

## Backend : structure de fichiers

```
proofreader/
├── api/
│   ├── routes.py                 # MODIFIED — add /api/detect-pii, /api/labels ; /api/proofread accepts overrides
│   ├── pipeline.py               # MODIFIED — extract_and_detect_pii() + apply_overrides() + locate_detection()
│   ├── overrides.py              # NEW — OverrideEntry model + apply_overrides() pure function
│   ├── sse.py                    # UNCHANGED
│   ├── errors.py                 # UNCHANGED
│   └── settings.py               # UNCHANGED
├── anonymize.py                  # MODIFIED — add detect(), override_detections(), get_labels() methods
├── models.py                     # MODIFIED — add Detection, PageDetection (Detection + page + bbox)
├── locator.py                    # MODIFIED — add find_all_substring_spans() (variant of unique-match strategy)
└── … (rest unchanged)
```

### `proofreader/anonymize.py` — nouvelles méthodes

```python
class AnonymizationClient:
    async def detect(self, text: str, *, thread_id: str) -> list[Detection]:
        """POST piighost-api /v1/detect ; flatten entities.detections."""

    async def override_detections(
        self, text: str, detections: list[Detection], *, thread_id: str
    ) -> None:
        """PUT piighost-api /v1/detect/override-detections."""

    async def get_labels(self) -> list[str]:
        """GET piighost-api /v1/config ; return labels list."""
```

Existing `anonymize()` and `deanonymize()` stay.

### `proofreader/api/pipeline.py` — nouveaux helpers

```python
async def extract_and_detect_pii(
    pdf_bytes: bytes, *, thread_id: str, piighost_api_url: str
) -> tuple[str, str, PdfDocument, dict, list[PageDetection]]:
    """Run extraction + language + detection. Returns (markdown, language, doc, all_words, detections_with_bbox)."""

def locate_detection(text: str, *, all_words: dict[int, list[Word]]) -> list[LocatedSpan]:
    """Find ALL (page, bbox) hits for `text` across all pages."""
```

### `proofreader/api/overrides.py` — nouveau

```python
class OverrideEntry(BaseModel):
    text: str
    label: str
    remove: bool = False


def apply_overrides(
    initial: list[Detection], overrides: list[OverrideEntry], *, markdown: str
) -> list[Detection]:
    """Return the final Detection list after applying overrides.

    For each override:
      - remove=False → search `text` in markdown, append a Detection per occurrence
      - remove=True  → filter out initial detections matching text+label

    The order of overrides doesn't matter — removes and adds commute in this
    formulation since adds always reference the markdown directly.
    """
```

### `run_pipeline` modifié

```python
async def run_pipeline(
    *, pdf_bytes, filename, debug, thread_id, overrides, ...settings
) -> AsyncIterator[bytes]:
    # ... extraction + meta ...
    yield format_sse("progress", {"step": "extracted"})

    initial_detections = await client.detect(markdown, thread_id=thread_id)
    final_detections = apply_overrides(initial_detections, overrides, markdown=markdown)
    await client.override_detections(markdown, final_detections, thread_id=thread_id)

    anonymized = await client.anonymize(markdown, thread_id=thread_id)
    yield format_sse("progress", {"step": "anonymized"})

    # ... rest identical to phase 2 ...
```

Note : on appelle `client.detect(...)` à nouveau dans `proofread` parce qu'on n'a pas confiance que piighost-api conserve l'état de détection entre requêtes — le thread_id côté API stocke des choses mais on re-détecte pour être self-contained. Cost : ~200ms d'overhead à chaque proofread (acceptable).

## Frontend : structure de fichiers

```
frontend/src/
├── App.tsx                       # MODIFIED — orchestrate detect-pii → review → proofread
├── hooks/
│   ├── useAppState.ts            # MODIFIED — add reviewing state + override actions
│   ├── useDetectPii.ts           # NEW
│   ├── useResultStream.ts        # MODIFIED — accept thread_id + overrides
│   ├── useLabels.ts              # NEW — fetch /api/labels + cache
│   └── useDebugMode.ts           # UNCHANGED
├── lib/
│   ├── types.ts                  # MODIFIED — add Detection, OverrideEntry, PageDetection
│   └── overrides.ts              # NEW — applyOverrides pure function (mirror backend)
├── components/
│   ├── ReviewState.tsx           # NEW — orchestrates review UI
│   ├── ReviewTopBar.tsx          # NEW — filename + count + Cancel + Validate
│   ├── DetectionsPanel.tsx       # NEW — right pane during review
│   ├── DetectionCard.tsx         # NEW — single detection card with actions
│   ├── LabelPickerModal.tsx      # NEW — modal to pick label after selection
│   ├── PdfPanel.tsx              # MODIFIED — add textLayer + variant prop (mistake|detection)
│   ├── HighlightOverlay.tsx      # MODIFIED — color depends on variant
│   ├── ResultsState.tsx          # UNCHANGED (mostly)
│   ├── EmptyState/LoadingState/ErrorState   # UNCHANGED
│   └── TopBar.tsx                # UNCHANGED
└── fixtures/
    ├── sample-result.json        # UNCHANGED
    ├── sample-cv.pdf             # UNCHANGED
    └── sample-detections.json    # NEW — for ?fake=1 review mode
```

### State machine

```typescript
type AppState =
  | { kind: "empty" }
  | { kind: "loading-detect"; filename: string }
  | {
      kind: "reviewing";
      filename: string;
      file: File;                       // kept to POST /api/proofread later
      pdfBytes: Uint8Array;
      thread_id: string;
      page_sizes: PageSize[];
      page_count: number;
      language: string;
      markdown: string;
      detections: PageDetection[];       // initial from piighost-api
      pendingOverrides: OverrideEntry[];
    }
  | { kind: "loading-proofread"; ... }
  | { kind: "results"; ... }             // identical phase 2
  | { kind: "error"; ... };
```

New actions :

```typescript
| { type: "UPLOAD_STARTED"; filename: string }
| { type: "DETECT_LOADED"; payload: DetectPiiResponse; file: File; pdfBytes: Uint8Array }
| { type: "OVERRIDE_ADD"; text: string; label: string }
| { type: "OVERRIDE_REMOVE_DETECTION"; index: number }      // index in finalDetections
| { type: "OVERRIDE_RELABEL"; index: number; newLabel: string }
| { type: "REVIEW_SUBMIT" }
| { type: "REVIEW_CANCEL" }
// + existing STREAM_* actions for phase 2
```

`OVERRIDE_REMOVE_DETECTION` et `OVERRIDE_RELABEL` génèrent les OverrideEntry appropriés (avec `remove: true`) en regardant `state.detections[index]` ou la projection appliquée.

### Composants

#### `ReviewState`

Orchestre la review. Récupère les labels via `useLabels()`. Calcule `finalDetections = applyOverrides(detections, pendingOverrides)`. Rend deux panneaux côte à côte (même layout que `ResultsState`) :
- **Gauche** : `PdfPanel` avec `variant="detection"` (highlights bleus) ET text layer activé pour la sélection
- **Droite** : `DetectionsPanel` avec la liste

TopBar : `[filename] [N entités] [Annuler] [Valider et analyser]`.

#### `PdfPanel` — extension pour text layer

Modifications :
- Nouveau prop `enableTextLayer?: boolean` (default false)
- Si true, en plus du canvas, on rend un `<div>` overlay par page avec le résultat de `pdfjsLib.renderTextLayer({ textContentSource: page.streamTextContent(), container, viewport })`. Le text layer a `user-select: text` et est positionné en absolute par-dessus le canvas (z-index entre le canvas et l'overlay highlights).
- Nouveau prop `variant: "mistake" | "detection"` (default `"mistake"`) qui change la couleur dans `HighlightOverlay`.
- Nouveau prop `onTextSelection?: (text: string) => void` : un listener global `mouseup` capture le `window.getSelection()`, normalise (trim + collapse whitespace + minimum 2 chars), et appelle le callback.

#### `LabelPickerModal`

Modal TailGrids (à fetcher via `mcp__tailgrids__get_component("modal")` ou similaire). Contenu :
- Texte sélectionné en grand
- Liste radio des labels disponibles (par défaut : aucun sélectionné, l'user choisit)
- Boutons "Annuler" / "Ajouter"

À la confirmation, dispatch `OVERRIDE_ADD`.

#### `DetectionsPanel` + `DetectionCard`

Style cohérent avec `MistakesPanel` mais affiche les détections :
- Texte détecté en monospace ou bold
- Badge coloré pour le label (palette par catégorie : PERSON=violet, LOCATION=orange, EMAIL=cyan, etc.)
- Icône ✋ ou badge "manuel" pour distinguer les overrides ajoutés
- Croix pour supprimer
- Click sur le label → dropdown TailGrids pour re-labelliser
- Click sur la carte → highlight celle-là en jaune sur le PDF (pattern identique au mistakes panel, géré via un `activeIndex` local au `ReviewState`)

### Hooks

#### `useDetectPii`

```typescript
export function useDetectPii(dispatch) {
  return useCallback(async (file: File) => {
    dispatch({ type: "UPLOAD_STARTED", filename: file.name });
    const pdfBytes = new Uint8Array(await file.arrayBuffer());
    const formData = new FormData();
    formData.append("file", file);
    try {
      const response = await fetch("/api/detect-pii", { method: "POST", body: formData });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        dispatch({ type: "ERROR", reason: body.reason ?? "internal", details: body });
        return;
      }
      const data = await response.json();
      dispatch({ type: "DETECT_LOADED", payload: data, file, pdfBytes });
    } catch (e) {
      dispatch({ type: "ERROR", reason: "backend-down", details: { message: String(e) } });
    }
  }, [dispatch]);
}
```

#### `useResultStream` — modifié

Accepte `file`, `thread_id`, `overrides`, `debug`. Le body de la requête devient :

```typescript
formData.append("file", file);
formData.append("thread_id", thread_id);
formData.append("overrides", JSON.stringify(overrides));
```

Le reste (SSE parsing, dispatches) reste identique à phase 2.

#### `useLabels`

Fetch `/api/labels` une fois au mount. Cache via `useRef`. Retourne `{ labels: string[]; loading: boolean }`. Utilisé par `LabelPickerModal` et `DetectionCard` dropdown.

### Types frontend (`lib/types.ts`)

```typescript
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
  manual?: boolean;     // true for user-added overrides not yet located
}

export interface OverrideEntry {
  text: string;
  label: string;
  remove?: boolean;
}

export interface DetectPiiResponse {
  thread_id: string;
  language: string;
  page_count: number;
  page_sizes: PageSize[];
  markdown: string;
  detections: PageDetection[];
}
```

### Logique d'application des overrides (frontend)

`lib/overrides.ts` :

```typescript
export function applyOverrides(
  initial: PageDetection[], overrides: OverrideEntry[]
): PageDetection[] {
  // Determine which initial detections are "removed"
  const removedKeys = new Set(
    overrides
      .filter((o) => o.remove)
      .map((o) => `${o.text}|${o.label}`)
  );
  // Keep initial detections that are not removed
  const kept = initial.filter((d) => !removedKeys.has(`${d.text}|${d.label}`));
  // Manual additions: create a synthetic PageDetection per occurrence
  // (bbox computed by the backend on the next /api/proofread call, so the
  // frontend just creates placeholder bboxes from start_pos/end_pos if known,
  // OR leaves bbox=null and renders nothing for manual entries on the PDF
  // until the user submits)
  const added = overrides
    .filter((o) => !o.remove)
    .map((o) => ({
      text: o.text,
      label: o.label,
      page: -1,         // unknown until backend resolves
      bbox: null,        // not drawn on PDF in review mode
      start_pos: -1,
      end_pos: -1,
      confidence: 1.0,
      manual: true,
    }));
  return [...kept, ...added];
}
```

Conséquence UX : les détections ajoutées manuellement n'apparaissent **pas** comme highlights sur le PDF en review (on ne connaît pas leur bbox). Elles apparaissent comme cartes dans la liste. Acceptable pour MVP. Si on veut les afficher, le frontend peut faire `markdown.indexOf(text)` puis chercher le bbox dans le word stream (mais ce n'est pas dispo côté frontend sans `/api/detect-pii` qui le renvoie).

Une amélioration possible (hors scope MVP) : ajouter un endpoint `POST /api/locate-text` qui prend `{ text }` et renvoie les bboxes. Faisable mais YAGNI pour maintenant.

### `App.tsx`

```tsx
export default function App() {
  const [state, dispatch] = useAppState();
  const startDetect = useDetectPii(dispatch);
  const startStream = useResultStream(dispatch);

  // ?fake=1 : simulate the full flow (detect-pii response then stream)
  useEffect(() => {
    if (state.kind === "empty" && fakeMode() !== "off") {
      simulateDetectThenStream(dispatch, fakeMode() === "empty");
    }
  }, [state.kind, dispatch]);

  // After REVIEW_SUBMIT, kick off the proofread call
  useEffect(() => {
    if (state.kind !== "loading-proofread") return;
    startStream(state.file, state.thread_id, state.pendingOverrides, isDebugAvailable());
  }, [state.kind, startStream]);

  switch (state.kind) {
    case "empty":
      return <EmptyState onFile={(f) => startDetect(f)} onReject={...} />;
    case "loading-detect":
      return <LoadingState message="Extraction et détection PII…" />;
    case "reviewing":
      return <ReviewState ...{state} dispatch={dispatch} />;
    case "loading-proofread":
      return <LoadingState message="Anonymisation et analyse…" />;
    case "error":
      return <ErrorState ... />;
    case "results":
      return <ResultsState ... />;
  }
}
```

### `?fake=1` mode

`simulateDetectThenStream` :
1. Fetch `sample-cv.pdf` + `sample-detections.json`
2. dispatch `UPLOAD_STARTED`
3. await 500ms
4. dispatch `DETECT_LOADED` avec les détections du fixture → state passe à `reviewing`
5. user peut tester l'UI en local
6. Quand l'user clique "Valider", dispatch `REVIEW_SUBMIT` → state `loading-proofread`
7. Le useEffect lance `simulateStream(...)` (function existante de phase 2) avec un overrides vide en mode `?fake=1`, ou skip les mistakes en mode `?fake=empty`

### Tests frontend

- `tests/overrides.test.ts` (nouveau) : pure function `applyOverrides`
  - Aucun override : retourne l'identique
  - Ajout d'un override sans `remove` : ajoute une entrée synthétique
  - Override avec `remove: true` matchant : retire l'entry initiale
  - Override remove sans match : no-op
  - Re-label (remove + add) : ancien retiré, nouveau ajouté
- `tests/appState.test.ts` étendu (+5 tests) :
  - `UPLOAD_STARTED` → `loading-detect`
  - `DETECT_LOADED` depuis `loading-detect` → `reviewing` avec les détections
  - `OVERRIDE_ADD` depuis `reviewing` → append à `pendingOverrides`
  - `OVERRIDE_REMOVE_DETECTION` depuis `reviewing` → ajoute un override remove correspondant
  - `REVIEW_SUBMIT` depuis `reviewing` → `loading-proofread`
- `tests/parseSSE.test.ts` : aucun changement (le SSE reste identique)

### Tests backend

- `tests/api/test_detect_pii.py` (nouveau)
  - Happy path : mock `AnonymizationClient.detect` retournant 2 entités, asserter le JSON
  - Multi-occurrence : un text qui apparaît 2 fois → 2 entries dans `detections`
  - 413 / 415 / 422 (mêmes patterns que `/api/proofread`)
- `tests/api/test_overrides.py` (nouveau)
  - `apply_overrides` : 5 cas (aucun, ajout, suppression, re-label, multi-occurrence d'ajout)
- `tests/api/test_pipeline.py` étendu
  - `run_pipeline` avec un override `{text: "Acme", label: "ORG"}` → assert `client.override_detections` est appelé avec une Detection contenant "Acme"
  - `run_pipeline` avec un override `{text: "X", remove: true}` → assert "X" est filtré de la liste passée à `override_detections`
- `tests/api/test_routes.py` étendu
  - `/api/proofread` accepte `thread_id` + `overrides` form fields
  - `/api/labels` happy path (mock get_labels)

## Critères d'acceptation manuels (phase 3)

1. Upload un PDF avec du contenu personnel (CV) → page de review s'affiche avec quelques highlights bleus sur le PDF + liste des entités à droite.
2. Cliquer sur une croix → l'entité disparaît de la liste et du PDF, badge top bar décrémenté.
3. Sélectionner du texte sur le PDF → modal s'ouvre avec choix de label → confirmer → nouvelle carte "manuelle" en bas de liste.
4. Cliquer sur le label d'une détection → dropdown apparaît → choisir un autre label → la carte est mise à jour.
5. Click "Valider et analyser" → bascule en `loading-proofread` → puis `results` avec le streaming SSE des fautes (le LLM voit le markdown anonymisé selon les overrides choisis).
6. Click "Debug" en mode `?debug=1` pendant la review → panneau debug montre `markdown_raw` et la liste des détections initiales (utile pour vérifier).
7. Mode `?fake=1` : même flow simulé sans backend, l'UI est testable en local.
8. PDF.js text layer n'interfère pas avec l'overlay des highlights (z-index correct).

## Hors scope, à considérer plus tard

- Endpoint `POST /api/locate-text` pour afficher les bboxes des overrides manuels sur le PDF immédiatement (avant le proofread submit).
- Cache server-side du PDF entre `/api/detect-pii` et `/api/proofread` (clé : `thread_id`) pour éviter le ré-upload.
- Persistance des overrides comme "profil utilisateur" entre uploads.
- Sélection multi-occurrences : choisir laquelle anonymiser (interface ambigüité).
- Support des labels custom (autres que ceux fournis par piighost-api).
- Streamlit `app.py` ne reçoit aucune mise à jour — il reste sur le pipeline pré-HITL (phase 1). Si HITL devient critique, il faudra soit migrer Streamlit, soit le supprimer.
