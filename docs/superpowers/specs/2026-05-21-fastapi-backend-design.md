# FastAPI Backend + Frontend Integration — design

**Status :** approved
**Date :** 2026-05-21
**Phase :** 2/3 (FastAPI backend) entre la phase 1 (React frontend, déjà livrée) et la phase 3 (intégration end-to-end, déploiement Coolify)
**Stack :** FastAPI + httpx + Instructor (LLM streaming) + litellm + uvicorn + nginx (reverse proxy/static) + SSE

## Goal

Remplacer le pipeline Streamlit interne (`app.py:_run_pipeline`) par un endpoint FastAPI qui streame chaque faute détectée au frontend via Server-Sent Events (SSE), au fur et à mesure que le LLM les produit. Le frontend React phase 1 est branché sur ce backend ; le mode `?fake=1` continue de fonctionner sans backend pour le dev rapide. Le Streamlit (`app.py`) est conservé en interne pour debug, plus déployé.

## Non-goals

- Pas d'authentification, pas de session, pas de cookies. App publique, rate-limit délégué à LiteLLM côté upstream.
- Pas de file d'attente / Celery / Redis. Pipeline synchrone-par-requête, async natif, single process uvicorn (workers possible mais non requis).
- Pas de WebSocket. SSE est plus simple, supporté nativement par le browser via `EventSource` ou `fetch + ReadableStream`, et le flux est uni-directionnel.
- Pas de stockage serveur du PDF. Tout en mémoire pendant la requête.
- Pas de migration de `langchain-litellm` ailleurs que dans `proofreader/llm.py`. Le module est réécrit ; les autres modules ne bougent pas.

## Architecture globale

Deux services dans `compose.yaml`, branchés au réseau Docker du sibling `piighost-api` (séparé) :

```
                                 ┌─────────────────────┐
  Browser ──HTTP──▶ nginx :80 ──▶│ /            → dist/ │   (frontend static)
                                 │ /api/*       → :8001 │   (reverse proxy)
                                 └─────────────────────┘
                                            │
                                            ▼
                                 ┌─────────────────────┐
                                 │ FastAPI :8001        │
                                 │  POST /api/proofread │
                                 │  GET  /api/health    │
                                 │  └─ proofreader/*    │
                                 └─────────────────────┘
                                            │
                                            ▼
                                 ┌─────────────────────┐
                                 │ piighost-api :8000   │   (sibling, own compose)
                                 └─────────────────────┘
```

Ports décidés :
- **piighost-api** : reste sur `:8000` (sibling repo, on ne le touche pas).
- **FastAPI backend** : `:8001` (évite le conflit avec piighost-api).
- **Frontend dev Vite** : `:5173` avec proxy `/api` → `http://localhost:8001`.
- **nginx prod** : `:80`, sert `frontend/dist/` en static, reverse proxy `/api` vers `backend:8001`.

## Contrat API

### `POST /api/proofread`

- **Request** : `multipart/form-data` avec un champ `file` (le PDF, ≤ 10 Mo). Query param optionnel `?debug=1` pour inclure les payloads de debug.
- **Validation pré-stream** :
  - `413 Payload Too Large` si > 10 Mo (body `{"reason": "too-large", "size_mb": 14.3}`)
  - `415 Unsupported Media Type` si `content_type != "application/pdf"` (body `{"reason": "not-pdf"}`)
  - `422 Unprocessable Entity` si l'extraction Markdown est vide (body `{"reason": "no-text-layer"}`)
- **Réponse en cas de succès** : `text/event-stream`, headers `Cache-Control: no-cache`, `X-Accel-Buffering: no` (sinon nginx bufferise).

### Catalogue des events SSE (dans l'ordre du stream)

```
event: meta
data: {
  "filename": "cv.pdf",
  "language": "fr",
  "page_count": 1,
  "page_sizes": [{ "page": 0, "width_pt": 595.0, "height_pt": 842.0 }],
  "thread_id": "uuid-..."
}

event: progress
data: { "step": "extracted" }       # markdown extracted from PDF

event: progress
data: { "step": "anonymized" }      # piighost-api anonymize roundtrip done

event: progress
data: { "step": "llm-started" }     # Instructor stream begins yielding mistakes

event: mistake
data: {
  "page": 0,
  "bbox": [125.7, 84.9, 178.6, 104.2],
  "error_text": "exemple",
  "correction": "exemple correct",
  "description": "...",
  "type": "orthographe",
  "context_before": "Voici un"
}
# streamed once per located mistake, in LLM arrival order

event: unlocatable
data: { "error_text": "...", "correction": "...", "description": "...",
        "type": "...", "context_before": "..." }
# streamed once per mistake the locator could not anchor (no bbox)

event: debug
data: {
  "markdown_raw": "...",
  "markdown_anonymized": "...",
  "word_stream": [{ "page": 0, "text": "Voici", "bbox": [72.0, 84.9, 102.3, 104.2] }, ...]
}
# only emitted if ?debug=1

event: done
data: { "mistake_count": 5, "unlocatable_count": 0 }
```

### Erreurs en cours de stream

Si une erreur survient après que le stream a démarré (LLM down, piighost-api timeout, etc.), on émet un dernier event puis on ferme :

```
event: error
data: { "reason": "backend-down" | "rate-limit" | "internal",
        "message": "..." }
```

Mapping côté frontend : `error` event → `dispatch({type: "ERROR", reason, details})`, qui bascule la state machine sur `ErrorState` existant.

### `GET /api/health`

Retourne `200 {"status": "ok"}`. Utilisé par le healthcheck Docker.

## Backend : structure de fichiers

```
proofreader/
├── api/                          # NEW package
│   ├── __init__.py
│   ├── app.py                    # FastAPI app + CORS dev-only + lifespan
│   ├── routes.py                 # POST /api/proofread, GET /api/health
│   ├── pipeline.py               # async run_pipeline(...) → AsyncIterator[Event]
│   ├── sse.py                    # format_sse(event_name, data) → bytes
│   └── errors.py                 # PipelineError + Exception → SSE/HTTP mapping
├── anonymize.py                  # unchanged (already async via httpx)
├── language.py                   # unchanged
├── llm.py                        # MODIFIED — switch to Instructor + create_iterable
├── locator.py                    # unchanged (sync, fast)
├── models.py                     # unchanged
├── pdf_extraction.py             # unchanged (sync, called via anyio.to_thread)
└── pdf_render.py                 # unchanged
```

Le Streamlit (`app.py` racine) reste sur disque et reste fonctionnel (consomme `_run_pipeline` interne basé sur l'ancien `proofreader.llm`). Pour éviter de casser `app.py`, on garde `proofreader.llm.build_chain` / `proofread` (sync wrappers autour de LangChain) ET on ajoute `proofreader.llm.stream_mistakes` (async, Instructor). Deux APIs côte à côte dans `llm.py`. Le Streamlit n'a pas besoin du streaming, il continue d'utiliser l'ancienne.

Une alternative aurait été de retirer LangChain et de migrer Streamlit lui aussi vers Instructor. C'est rejeté ici : `app.py` est qualifié de "à garder de côté pour debug" et la migration LangChain → Instructor double le scope. À reconsidérer en phase 3 si on supprime définitivement Streamlit.

## Pipeline async

```python
# proofreader/api/pipeline.py

async def run_pipeline(
    pdf_bytes: bytes, *, filename: str, debug: bool
) -> AsyncIterator[Event]:
    thread_id = str(uuid.uuid4())
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as fp:
        fp.write(pdf_bytes)
        pdf_path = Path(fp.name)

    # 1. Extract markdown — JVM blocks → off-loop
    markdown = await anyio.to_thread.run_sync(extract_markdown, pdf_path)
    if not markdown.strip():
        raise NoTextLayerError()

    language = detect_language(markdown)
    doc = PdfDocument(pdf_path)
    all_words = {p: list(doc.words(p)) for p in range(doc.page_count)}

    yield meta_event(filename, language, doc, thread_id)
    yield progress_event("extracted")

    # 2. Anonymize (already async httpx)
    client = AnonymizationClient(base_url=settings.piighost_api_url)
    anonymized = await client.anonymize(markdown, thread_id=thread_id)
    yield progress_event("anonymized")

    # 3. Stream LLM via Instructor.create_iterable
    yield progress_event("llm-started")
    chain = build_async_client(model=..., api_key=..., api_base=...)
    async for raw in stream_mistakes(markdown=anonymized, language=language, client=chain):
        clean = await deanonymize_mistake(raw, client=client, thread_id=thread_id)
        located = locate_in_any_page(clean, all_words)
        if located:
            yield mistake_event(located)
        else:
            yield unlocatable_event(clean)

    if debug:
        yield debug_event(markdown, anonymized, all_words)
    yield done_event(mistake_count=..., unlocatable_count=...)
```

Notes :
- `extract_markdown` reste sync (opendataloader-pdf bloque la JVM) ; on l'appelle via `anyio.to_thread.run_sync` pour ne pas bloquer l'event loop.
- `PdfDocument` et `doc.words(p)` sont sync mais rapides ; on les laisse sur le loop principal.
- `deanonymize_mistake` exécute les 4 appels désanonymisation en parallèle via `asyncio.gather` (4 champs : `error_text`, `correction`, `description`, `context_before`).
- `locate_in_any_page` parcourt les pages dans l'ordre et retourne la première qui match, identique à la boucle dans `app.py:_run_pipeline`.

## LLM avec Instructor

`proofreader/llm.py` ajoute :

```python
import instructor
import litellm
from collections.abc import AsyncIterator
from proofreader.models import Mistake

SYSTEM_PROMPT_STREAM = (
    "You are an expert proofreader. The text below is the Markdown extraction "
    "of a CV in {language}. For each mistake you find, emit a JSON object with "
    "fields: error_text (verbatim substring), correction, description (max 15 "
    "words, in {language}), type (one of orthographe, grammaire, conjugaison, "
    "accord, ponctuation), context_before (3-5 words preceding the error)."
)

async def stream_mistakes(
    *, markdown: str, language: str, model: str, api_key: str, api_base: str | None
) -> AsyncIterator[Mistake]:
    client = instructor.from_litellm(litellm.acompletion)
    response_stream = client.chat.completions.create_iterable(
        model=model,
        api_key=api_key,
        api_base=api_base,
        response_model=Mistake,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT_STREAM.format(language=language)},
            {"role": "user", "content": markdown},
        ],
    )
    async for mistake in response_stream:
        yield mistake
```

`Mistake` est le Pydantic model existant. L'ancien `build_chain` + `proofread` reste pour Streamlit. `langchain-litellm` reste en dépendance (utilisé par Streamlit). `instructor` + `litellm` sont ajoutés au `pyproject.toml`.

## Erreurs : mapping complet

| Source | Détecté où | Côté HTTP | Côté SSE |
|---|---|---|---|
| PDF > 10 Mo | Validation request | `413` `{reason: "too-large", size_mb}` | — |
| Mauvais MIME | Validation request | `415` `{reason: "not-pdf"}` | — |
| Markdown extraction vide | Après `extract_markdown` mais avant 1er event | `422` `{reason: "no-text-layer"}` | — |
| `httpx.HTTPError` sur piighost-api | Pendant le stream | — | `event: error, data: {reason: "backend-down", message}` |
| `litellm.RateLimitError` | Pendant le stream | — | `event: error, data: {reason: "rate-limit", retry_in_sec}` |
| `Exception` non typée | Pendant le stream | — | `event: error, data: {reason: "internal", message}` + log côté backend |
| piighost-api up mais réponse invalide | Pendant le stream | — | `event: error, data: {reason: "backend-down"}` |

Implémentation : la route FastAPI est un wrapper qui :
1. Valide la requête, peut renvoyer un `JSONResponse` 4xx avant d'ouvrir le stream.
2. Lance `extract_markdown` synchronement (les 2-3s d'attente sont avant le stream). Si vide → 422.
3. Renvoie un `StreamingResponse(generator)` avec `media_type="text/event-stream"`.
4. Le generator wrappe `run_pipeline(...)` avec un `try/except` qui convertit chaque exception en event `error` + termine le stream.

## Frontend : changements

### `useAppState` reducer étendu

```typescript
export type AppState =
  | { kind: "empty" }
  | { kind: "loading"; filename: string }
  | { kind: "results";
      data: ProofreadResult;
      pdfBytes: Uint8Array;
      streaming: boolean;
      progress: "extracted" | "anonymized" | "llm-started" | "done" }
  | { kind: "error"; reason: ErrorReason; details?: ErrorDetails };

export type AppAction =
  | { type: "UPLOAD_STARTED"; filename: string }
  | { type: "STREAM_META"; meta: MetaPayload; pdfBytes: Uint8Array }
  | { type: "STREAM_PROGRESS"; step: ProgressStep }
  | { type: "STREAM_MISTAKE"; mistake: LocatedMistake }
  | { type: "STREAM_UNLOCATABLE"; mistake: Mistake }
  | { type: "STREAM_DEBUG"; debug: DebugPayload }
  | { type: "STREAM_DONE"; counts: { mistake_count: number; unlocatable_count: number } }
  | { type: "ERROR"; reason: ErrorReason; details?: ErrorDetails }
  | { type: "RESET" };
```

`ProofreadResult` perd `pdf_base64`. Le champ `unlocatable: Mistake[]` est ajouté (optionnel). `markdown_raw / markdown_anonymized / word_stream / thread_id` deviennent visibles dès `STREAM_DEBUG` (ou jamais si pas debug).

Transitions :
- `loading + STREAM_META` → `results` avec `mistakes: []`, `streaming: true`, `progress: "extracted"`, `pdfBytes` stocké.
- `results + STREAM_PROGRESS` → update `progress`.
- `results + STREAM_MISTAKE` → append à `data.mistakes`.
- `results + STREAM_UNLOCATABLE` → append à `data.unlocatable`.
- `results + STREAM_DEBUG` → merge dans `data`.
- `results + STREAM_DONE` → `streaming: false`, `progress: "done"`.
- `loading | results + ERROR` → `error`.

### Nouveau hook `useResultStream`

`src/hooks/useResultStream.ts` :

```typescript
export function useResultStream(dispatch: (action: AppAction) => void) {
  return useCallback(async (file: File, debug: boolean) => {
    dispatch({ type: "UPLOAD_STARTED", filename: file.name });
    const pdfBytes = new Uint8Array(await file.arrayBuffer());
    const formData = new FormData();
    formData.append("file", file);
    const url = `/api/proofread${debug ? "?debug=1" : ""}`;
    let response: Response;
    try {
      response = await fetch(url, { method: "POST", body: formData });
    } catch {
      dispatch({ type: "ERROR", reason: "backend-down" });
      return;
    }
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      dispatch({ type: "ERROR", reason: body.reason ?? "internal", details: body });
      return;
    }
    for await (const event of parseSSE(response.body!)) {
      handleEvent(event, dispatch, pdfBytes);
    }
  }, [dispatch]);
}
```

`parseSSE` (~30 lignes) consomme le `ReadableStream` :
- Buffer le texte décodé en UTF-8.
- Split sur `\n\n` (séparateur d'events SSE).
- Pour chaque chunk : extraire les lignes `event:` et `data:`, parser le JSON de data.
- Yield `{name, data}`.
- À la fin du stream, vide le buffer.

`handleEvent` est un switch sur `event.name` qui dispatch les bonnes actions.

### Composants UI

- **`LoadingState`** : inchangé, affiché entre POST et premier event `meta`. Court (1-2 s).
- **`ResultsState`** : ajout d'un mini-indicator de progression tant que `state.streaming === true`. Position : pied de `MistakesPanel`, après les cartes. Texte selon `progress` :
  - `extracted` → "Anonymisation…"
  - `anonymized` → "Génération des fautes…"
  - `llm-started` → "Génération des fautes…" (LLM en cours)
  - `done` → indicator retiré.
  - Un petit spinner CSS à côté (réutilise `.spinner` réduit à 12-16 px).
- **`TopBar`** : badge "X fautes" ou "X fautes · en cours…" tant que `streaming`. Au-delà, libellé final.
- **`PdfPanel`** : signature change. Avant : `pdfBase64: string`. Après : `pdfBytes: Uint8Array`. Le rendu PDF.js démarre dès `STREAM_META` même si les fautes n'arrivent pas encore.
- **`MistakesPanel`** : aucun changement structurel, juste consomme la liste qui grandit.

### `?fake=1` / `?fake=empty` mode

`sample-result.json` perd son champ `pdf_base64`. Un nouveau fichier `frontend/src/fixtures/sample-cv.pdf` (binaire, ~1.5 KB) est ajouté. App.tsx en `?fake` mode :
1. Fetch `/src/fixtures/sample-cv.pdf` → bytes
2. Dispatch `STREAM_META` avec le fixture (sans pdf_base64)
3. Pour chaque faute du fixture : `setTimeout` 100-200ms entre chaque, puis dispatch `STREAM_MISTAKE`. Simule un streaming visible.
4. `STREAM_DONE` à la fin.
5. Pour `?fake=empty` : skip les mistakes, dispatch `STREAM_DONE` direct avec counts à 0.

### Vite proxy

`vite.config.ts` :

```typescript
server: {
  port: 5173,
  proxy: { "/api": "http://localhost:8001" },
},
```

## Dev workflow

```bash
# Terminal 1 — piighost-api (sibling repo)
cd ~/PycharmProjects/piighost-api && uv run uvicorn piighost_api.app:app --port 8000

# Terminal 2 — backend FastAPI
cd ~/PycharmProjects/piighost-proofreader && uv run uvicorn proofreader.api.app:app --reload --port 8001

# Terminal 3 — frontend Vite
cd ~/PycharmProjects/piighost-proofreader/frontend && npm run dev
# → ouvre http://localhost:5173, le proxy redirige /api/* vers :8001
```

## Tests

**Backend** (Pytest async, `pytest-asyncio` déjà installé) :

- `tests/api/test_routes.py`
  - Test que `POST /api/proofread` avec body vide retourne 422
  - Test que `POST` avec un PDF de 12 Mo retourne 413
  - Test que `POST` avec un `.txt` retourne 415
  - Test du happy path avec un PDF mockmé via `respx` pour piighost-api + Instructor stub
  - Test que `GET /api/health` retourne 200
- `tests/api/test_pipeline.py`
  - Mock `AnonymizationClient`, mock `stream_mistakes` (async generator factice de 3 Mistakes)
  - Consume `run_pipeline(...)` et asserter la séquence d'events : meta, progress×3, mistake×3, done
  - Variantes : 1 mistake unlocatable → un event `unlocatable` ; ?debug → event `debug` avant `done`
- `tests/api/test_errors.py`
  - Mock anonymize qui raise `httpx.HTTPError` → asserter `event: error, reason: "backend-down"`
  - Idem pour `litellm.RateLimitError`
- Smoke test live (skipped sans `LITELLM_API_KEY`) — un vrai PDF, un vrai LLM, asserter `mistake_count > 0`.

**Frontend** (Vitest, jsdom) :

- `tests/parseSSE.test.ts`
  - Stream simulé via `ReadableStream` qui yield des chunks de texte SSE
  - Asserter que `parseSSE` yield les bons `{name, data}`
  - Cas limites : chunk au milieu d'un event, plusieurs events dans un chunk, dernier event sans `\n\n` final
- `tests/appState.test.ts` étendu
  - Couvrir les nouveaux actions `STREAM_*`
  - Asserter que `STREAM_META` depuis `loading` → `results` avec mistakes vides
  - Asserter que `STREAM_MISTAKE` depuis `results` append au tableau et préserve `streaming`
  - Asserter que `STREAM_DONE` flip `streaming` à false
- Pas de test E2E en phase 2 — manual walkthrough comme phase 1, avec un PDF d'exemple.

## Pyproject.toml — changements

Ajouter aux dependencies :
- `fastapi >= 0.115`
- `uvicorn[standard] >= 0.30`
- `instructor >= 1.6`
- `litellm >= 1.50` (déjà présent transitively via langchain-litellm, à expliciter)
- `python-multipart >= 0.0.9` (FastAPI upload)

Garder (utilisés par Streamlit) :
- `streamlit`, `pillow`, `langchain`, `langchain-litellm`

Ajouter aux dev :
- `httpx >= 0.27` (déjà présent)
- `respx` (déjà présent)

## Validation phase 2

Critères d'acceptation manuels avant phase 3 (déploiement) :

1. `uv run uvicorn proofreader.api.app:app --port 8001` démarre, `GET /api/health` retourne 200.
2. Upload d'un PDF valide via `curl -F "file=@sample.pdf" http://localhost:8001/api/proofread` → stream SSE visible en sortie.
3. Frontend Vite + backend FastAPI ensemble : upload d'un PDF dans l'UI → les fautes apparaissent **une par une** dans la liste droite, en live.
4. Bouton "Tout cocher / décocher" fonctionne pendant le streaming.
5. Bouton debug montre les payloads `markdown_raw` et `markdown_anonymized` après que `STREAM_DEBUG` est arrivé.
6. PDF > 10 Mo → erreur immédiate avec `ErrorState` "Fichier trop volumineux".
7. PDF scanné (sans texte) → erreur immédiate avec `ErrorState` "PDF non lisible".
8. piighost-api éteint avant l'upload → `ErrorState` "Service indisponible".
9. `?fake=1` continue de marcher sans backend lancé.

## Hors scope, à considérer plus tard (phase 3)

- Dockerfile multi-stage qui build dist/ frontend + backend FastAPI dans une image.
- nginx config production (gzip, caching headers, X-Accel-Buffering).
- Healthcheck Docker, restart policy, logs.
- Retirer définitivement Streamlit + LangChain + Pillow.
- Auth / quota / rate limit applicatif (au-delà de LiteLLM).
- WebSocket pour bidirectionnel si besoin de cancel mid-stream.
