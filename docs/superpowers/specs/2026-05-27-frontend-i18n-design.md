# Frontend i18n (EN default + EN/FR switch) — Design

Add internationalization to the React frontend of `piighost-proofreader`. English becomes the default UI language; a switcher lets the user toggle EN/FR. UI language is purely cosmetic and **independent** of the proofreading language (the LLM keeps proofreading the CV in the CV's own language).

## Goals

- Every user-facing string in the UI is available in English and French.
- English is the default on first load (no browser-language detection).
- A persistent, always-visible switcher toggles EN/FR; the choice survives reloads.
- Type-safe: a missing or mistyped translation key is a compile error, not a runtime surprise.

## Non-goals (explicit YAGNI)

- No URL-based locale routing (`/en`, `/fr`). The app is a single-page tool; `localStorage` is enough.
- No browser-language auto-detection. Default is always EN until the user switches.
- No translation of LLM-produced labels (`orthographe`, `accord`, `grammaire`…) — these describe the analysed content, not the UI.
- No change to the proofreading language. The backend's language detection stays as-is.
- No third-party i18n library (react-i18next etc.). A lightweight custom layer fits 2 languages / ~50 strings.

## Architecture

A small custom i18n layer, no dependencies.

### Translation dictionaries

- `frontend/src/i18n/en.ts` — flat object `{ key: string }`, the **source of truth** for the key set.
- `frontend/src/i18n/fr.ts` — same keys, French values. Typed as `Record<TranslationKey, string>` so a missing key fails compilation.

Keys are flat, snake_case, grouped by area via prefix (e.g. `empty_dropzone_title`, `review_analyze_button`, `error_too_large_title`).

### Types

- `frontend/src/i18n/types.ts`:
  ```ts
  import { en } from "./en";
  export type TranslationKey = keyof typeof en;
  export type Lang = "en" | "fr";
  ```

### Context + hook

- `frontend/src/i18n/LanguageContext.tsx`:
  - `LanguageProvider`: holds `lang` state. Initial value read from `localStorage["lang"]`, falling back to `"en"` (and ignoring any value that isn't `"en"`/`"fr"`). Writes to `localStorage["lang"]` whenever `lang` changes (effect).
  - `useT()` hook returns `{ t, lang, setLang }`.
  - `t(key: TranslationKey, params?: Record<string, string | number>)`:
    - Looks up `dicts[lang][key]`, falling back to `dicts.en[key]` if the FR value is missing.
    - Interpolates `{name}` placeholders from `params` (simple `String.replace` over `/\{(\w+)\}/g`).
  - Throwing/console-warning behaviour: if a key is somehow missing from both dicts (shouldn't happen given typing), return the key string itself so the UI degrades visibly rather than crashing.

### Pluralization

Simple count-based, no ICU. For the two known plural strings (entité(s), faute(s)), store two keys: `entity_one` / `entity_other`, `mistake_one` / `mistake_other`. A helper:

```ts
function plural(t, n, base) {
  return t(n === 1 ? `${base}_one` : `${base}_other`, { n });
}
```

French and English share the same one/other split for these words, so the helper works for both.

## The language switcher

- `frontend/src/components/LanguageSwitcher.tsx`:
  - Minimal text toggle: `EN · FR`, the active language bold, the other muted and clickable.
  - Positioned `fixed top-4 right-4 z-50` so it sits above every screen.
  - Uses `useT()` for `setLang`/`lang`. TailGrids-consistent styling (`text-sm`, hover state, a thin separator).
- Mounted once in `App.tsx`, rendered alongside (above) the state `switch`, so it appears on empty / loading-detect / reviewing / loading-proofread / error / results without touching each state component.

## Provider wiring

- `frontend/src/main.tsx`: wrap `<App/>` in `<LanguageProvider>`.

## String migration

Components currently holding hardcoded French strings (to migrate to `t("…")`):

- `src/App.tsx` (the `message=` props on lines ~106 and ~119 → pass translation keys; `LoadingState` translates internally)
- `src/components/EmptyState.tsx`
- `src/components/TopBar.tsx`
- `src/components/ReviewTopBar.tsx`
- `src/components/DetectionsPanel.tsx`
- `src/components/MistakesPanel.tsx`
- `src/components/LoadingState.tsx`
- `src/components/ErrorState.tsx`
- `src/components/LabelPickerModal.tsx`
- `src/components/DebugPanel.tsx`
- plus any other component surfaced during implementation by a repo-wide scan for French strings (the implementer must grep, not trust this list as exhaustive).

`LoadingState` currently receives a `message` string prop from `App.tsx`. Change its contract: it receives a `messageKey: TranslationKey` (or the parent passes an already-translated string via `useT` — implementer picks the cleaner option, but the French literal must not survive in `App.tsx`).

LLM-category labels rendered from API data (`mistake.type` etc.) are **not** translated.

## Default & persistence

- First load, no stored choice → `en`.
- Manual switch → persisted in `localStorage["lang"]`.
- No browser detection.

## Testing

Vitest + Testing Library (already configured — `vite.config.ts` has the test block).

- `useT` / `LanguageContext`:
  - returns the EN string for a key when `lang === "en"`, FR string when `lang === "fr"`.
  - falls back to EN when a key is (artificially) missing from FR.
  - interpolates `{n}` from params.
  - `plural` returns the `_one` form for n=1, `_other` otherwise.
  - `setLang("fr")` writes `localStorage["lang"] === "fr"`.
  - Provider initializes from a pre-seeded `localStorage["lang"]`.
- `LanguageSwitcher`:
  - renders both labels; clicking the inactive one calls `setLang` and flips the bold state.
- One migrated component (e.g. `EmptyState`) renders its EN copy under an EN provider and its FR copy under a FR provider.

## Success criteria

- Loading the app fresh (cleared localStorage) shows English.
- Clicking FR switches every visible string to French and persists across reload.
- `tsc`/`pyrefly`-equivalent (frontend `tsc` via `npm run build` or `vitest` typecheck) passes with no missing-key errors.
- No French string literal remains in the migrated `.tsx` files (verifiable by grep).

## Open questions

(none — design approved 2026-05-27)
