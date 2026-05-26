# Dev.to article — *Comment laisser GPT-5.5 corriger un CV sans jamais lui montrer un seul nom*

Design spec for a single dev.to article showcasing `piighost-proofreader` as a real-world demo of the `piighost` anonymisation library, while diving into three concrete technical problems the project had to solve.

## Goals

- **Primary** : promote `piighost` (the library) by showing it solving a problem that regex / Presidio-out-of-the-box cannot.
- **Secondary** : surface a specific technical contribution (the locator's 4-fallback strategy) so that the article is genuinely useful to devs who hit similar problems (PDF re-anchoring after LLM round-trip).

## Audience & constraints

| Dimension | Choice |
|---|---|
| Platform | dev.to (Forem). Markdown only, no JS, native code blocks. |
| Language | French first, then adapt to English in a second pass. |
| Reader profile | Hybrid: a generalist Python/LLM dev should grasp the TL;DR; an LLM/RAG expert should learn from the deep dives. |
| Target length | ~2000–2500 words FR (dev.to read-through sweet spot ; aim for density, not padding). EN version expected ~10% shorter. |
| Tone | Technical, narrative, *story* of solving real problems. No marketing fluff. No buzzwords. |
| Code | Concrete Python snippets, no pseudocode. Snippets must compile / be runnable as-is in `piighost-proofreader`. |
| Visuals | 1 Mermaid pipeline diagram, 1–2 screenshots of the rendered PDF, no UI screenshots of the React frontend. |

## Out of scope (explicit YAGNI)

- The FastAPI / React / SSE / Coolify story — belongs to a separate article if ever.
- The Streamlit legacy UI.
- `piighost`'s internals (training of detectors, Redis cache eviction, etc.) — link to the upstream docs instead.
- Multi-tenant / scale considerations.
- Benchmarks. The article is qualitative.

## Structure

### 0. Title + hook

> **Comment laisser GPT-5.5 corriger un CV sans jamais lui montrer un seul nom**

Opening sentence sets the paradox: *un proofreader de CV doit comprendre le texte mais ne doit jamais en exposer les données perso. C'est exactement la tension que ce projet résout.*

### 1. TL;DR (200–300 words)

- One-sentence framing of the problem.
- Mermaid diagram of the loop: `PDF → Markdown → anonymise (piighost) → LLM (GPT-5.5) → de-anonymise → relocate on PDF`.
- One screenshot of the final output (PDF with red overlays).
- Teaser : *trois trucs vicieux qu'il a fallu résoudre — détaillés ci-dessous.*

### 2. Section 1 — La promesse naïve (~400 words)

- Strawman : *« anonymiser, c'est un regex sur l'email »*.
- Pourquoi ça casse : prénoms ambigus (« Paul » dans « Saint-Paul »), employeurs / dates de naissance / numéros qui n'ont pas de format unique.
- Pourquoi Presidio nu ne suffit pas : il faut **cohérence cross-occurrences** : si « Patrick » apparaît 4 fois, il doit devenir le *même* `<<PERSON:1>>` partout (sinon le LLM s'embrouille et casse l'inférence).
- Comment `piighost` résout ça via `thread_id` : mapping persistant en cache Redis, scopé par requête.
- Snippet (Python) : `client.anonymize(text, thread_id=...)`.

### 3. Section 2 — Le piège du « le LLM ne renvoie pas ce qu'on lui a donné » (~500 words)

- On a anonymisé, le LLM répond avec des `<<PERSON:1>>` partout, on dé-anonymise → tout marche ? **Non.**
- Le LLM tronque, paraphrase, déplace une virgule. Son `error_text` est *un sous-extrait* du texte anonymisé, pas une string verbatim.
- Piège : l'endpoint `/v1/deanonymize` (cache-keyed sur le texte complet) renverrait 404.
- Solution : `/v1/deanonymize/entities` qui résout au niveau des entités effectivement présentes dans le sous-extrait.
- Snippet (Python) : appel `deanonymize_entities` côté client.

### 4. Section 3 — Le retour sur PDF : 4 stratégies de fallback (~700 words)

- Constat : le LLM travaille sur du Markdown anonymisé, rend des champs *texte* (après deanon), mais **sans coordonnées**. L'utilisateur veut *voir* où sur le PDF.
- Le locator doit retrouver le mot dans le stream PyMuPDF (per-word + bbox).
- **Les 4 stratégies, dans l'ordre** :
  1. **Strict whole-word match** : `context_before` + `error_text` adjacents dans le stream.
  2. **Tolérant** : casefold + ASCII-fy (apostrophes typographiques) + ponctuation environnante ignorée.
  3. **Error-only unique match** : si `error_text` apparaît exactement une fois sur la page, on prend, peu importe `context_before` (couvre les cas où le LLM hallucine son contexte sur les CVs multi-colonnes).
  4. **Substring du stream concaténé** : pour les cas où PyMuPDF tokenise `d'une` en `d'` + `une` ; gated par `_MIN_SUBSTRING_CHARS = 5` pour éviter `une` qui matcherait dans `commune`.
- Pourquoi cet ordre exact (chaque strat *absorbe* un mode d'échec spécifique de la précédente).
- Snippet (Python) : la fonction `locate_mistake`.

### 5. Section 4 — Bilan + ouverture (~200 words)

- Récap : anonymiser pour LLM n'est pas un regex, c'est un cycle complet (anonymise cohérent + deanon par entités + relocator).
- Mini-checklist *« quand vous bricolez un pipeline LLM sur des documents »* (3-4 items).
- CTA piighost :
  - Lien repo `piighost` + 1 ligne d'install.
  - Lien repo `piighost-proofreader` (le projet de démo).
  - Appel à feedback / issues.

## Tone rules

- Pas de "easy", "simple", "just".
- Pas de "we built this revolutionary system".
- On raconte les *embûches* avant les solutions. Le lecteur doit ressentir la friction technique.
- Anecdotes de debug acceptées si elles éclairent une décision (ex. le 404 sur `/v1/deanonymize`).
- Code snippets : courts, commentés sur le **pourquoi**, jamais sur le **quoi**.

## Code snippets to include (final list)

1. `anonymise + thread_id` (section 1) — ~10 lines.
2. `deanonymize_entities` per-field loop (section 2) — ~12 lines.
3. `locate_mistake` skeleton with the 4 strategies labelled (section 3) — ~25 lines, with `# strat N: …` annotations.

All snippets must be lifted from the actual repo (`proofreader/anonymize.py`, `proofreader/locator.py`) and verified to typecheck.

## Visuals to produce

1. **Pipeline Mermaid diagram** (TL;DR) :
   ```
   flowchart LR
     PDF --> Markdown
     Markdown -->|anonymise + thread_id| Anon[Markdown anonymisé]
     Anon --> LLM[GPT-5.5]
     LLM --> Mistakes[Mistakes avec placeholders]
     Mistakes -->|deanonymize_entities| Clear[Mistakes en clair]
     Clear -->|locator + PyMuPDF bbox| PDF2[PDF + overlays rouges]
   ```
2. **Screenshot** : un PDF de CV avec les overlays rouges (à tirer d'un run sur un sample existant — `samples/cv_fr.pdf`).
3. (Optionnel) Screenshot d'une mistake non localisée (section "Non localisées") pour illustrer le fallback final.

## Delivery format

- Markdown file at `docs/blog/2026-05-26-cv-llm-sans-nom-fr.md` (FR draft).
- Tags dev.to suggérés : `python`, `llm`, `privacy`, `pdf`.
- Front-matter Forem (`title`, `published: false`, `tags`, `series` éventuel).
- EN translation à produire dans un second temps, dans `docs/blog/2026-05-26-cv-llm-without-names-en.md`.

## Success criteria

- Un dev Python qui n'a jamais touché à `piighost` peut comprendre **pourquoi** la lib existe après la lecture.
- Un dev qui hit le problème de re-relocalisation post-LLM trouve les 4 stratégies + l'explication du pourquoi de l'ordre.
- L'article tient en une session de lecture (~10 min) et ne contient aucune section "filler".

## Open questions

(none — outline approved 2026-05-26)
