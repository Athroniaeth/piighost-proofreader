---
title: "How to let GPT-5.5 proofread a CV without ever showing it personal data"
published: false
description: "A CV proofreader that sends zero PII to the LLM, yet still drops its corrections onto the right word in the PDF. How you find a typo in a PDF when the LLM has no idea where it is."
tags: python, llm, privacy, pdf
canonical_url:
cover_image:
---

## TL;DR

Before you send out an important CV, you can hand it to an LLM for proofreading. A few seconds later, you have a list of mistakes. Except you've also just handed your name, your address, your employers and your dates to a third-party service.

`piighost-proofreader` fixes that. The CV is anonymized locally before the LLM call, and the corrections find their way back onto the right word in the original PDF:

```mermaid
flowchart LR
  PDF[CV PDF] --> Markdown
  Markdown -->|anonymize| Anon[Anonymized Markdown]
  Anon --> LLM[GPT-5.5]
  LLM -->|stream via instructor| Mistakes[Detected mistakes]
  Mistakes -->|locator + PyMuPDF bbox| PDF2[PDF + red overlays]
```

![Final result: a CV PDF with 11 mistakes highlighted and the list of corrections suggested by GPT-5.5](./assets/2026-05-26-cv-result-desktop.png)

The LLM never sees a name, a date, an address.

Anonymization is the easy part. The painful bit is finding, back in the PDF, a word the LLM only ever saw as Markdown. And the LLM and PyMuPDF don't tokenize the same way.

## 1. Why not just a regex?

First idea: before sending the CV to the LLM, you replace the sensitive data with one big regex. That works for emails and phone numbers, which have a recognizable format. For everything else, forget it.

- A name has no distinctive syntactic shape. `Paul Martin` looks like any two capitalized words; nothing in the text tells a regex it's a name.
- `Orange` is a company. It's also a fruit. `Mars`, `Apple`, `Carrefour`, same story.
- A date in a CV can be a birth, a degree, a job change. The format is identical.

You need a trained detector, not a pattern. `piighost` provides one, and the call looks like this:

```python
# src/proofreader/anonymize.py
async def anonymize(self, text: str, *, thread_id: str) -> str:
    return await self._call(
        "/v1/anonymize", text, thread_id, response_key="anonymized_text"
    )
```

The `thread_id` is a UUID per CV. The entity→placeholder mapping stays server-side, scoped by that ID: the same name becomes the same placeholder on every occurrence.

## 2. Streaming the mistakes with `instructor`

A two-page CV holds a good fifteen mistakes, and the LLM takes several seconds to spit them out. Without streaming, the user stares at a loader the whole time. With it, the mistakes show up one by one as the model emits them.

The catch: most structured-output libs (LangChain `with_structured_output`, OpenAI Functions, Pydantic AI) return the *complete* result. You ask for a `list[Mistake]`, you get the whole list once inference is done. No object-by-object granularity.

`instructor` is built for exactly this. Its `create_iterable` method parses the LLM's streamed JSON on the fly and yields each pydantic object as soon as it's complete:

```python
# src/proofreader/llm.py
client = instructor.from_litellm(litellm.acompletion)
response = client.chat.completions.create_iterable(
    model=model,
    response_model=Mistake,   # a single object, not list[Mistake]
    messages=[
        {"role": "system", "content": SYSTEM_PROMPT_STREAM.format(language=language)},
        {"role": "user", "content": markdown},
    ],
)
async for mistake in response:
    yield mistake
```

Two complications that aren't obvious:

1. **The prompt changes with the mode.** For LangChain's `with_structured_output`, you ask the LLM to return a wrapper object with a list of Mistakes inside. For `create_iterable`, you ask it to emit a single Mistake JSON per generation turn. The two prompts aren't quite the same. The project keeps both side by side: LangChain for the one-shot Streamlit path, `instructor` for the FastAPI streaming path.

2. **The SSE streaming downstream.** Each `Mistake` emitted is immediately repackaged into a Server-Sent Events event on the FastAPI side, then pushed to the frontend. The locator from the next section runs *per-Mistake*, so the user watches each red rectangle pop up as it goes, not all at once at the end.

## 3. Back onto the PDF: four fallback strategies

For each `Mistake` `instructor` yields, I have an `error_text`, a `correction`, a `context_before`, and a `description`. The LLM, though, never saw a single pixel of the PDF: it worked on the extracted Markdown. No field carries coordinates.

But the user wants to see the corrections on the original PDF, not flat text on a results page. So for each mistake, I have to find the word back in the PDF.

On the PDF side, I use PyMuPDF, which gives me a *word stream*: the list of every word on the page with its `bbox` (rectangles in points). The problem becomes: find the window `[word1, word2, …]` in that list. Except the LLM and PyMuPDF don't tokenize the same way, the typographic apostrophes don't line up, and on a two-column CV the LLM sometimes hallucinates its `context_before`.

Hence four strategies tried in order. Each one catches a case the previous can't handle:

```python
# src/proofreader/locator.py
def locate_mistake(mistake: Mistake, *, words: list[Word]) -> LocatedMistake | None:
    err_tokens = mistake.error_text.split()
    if not err_tokens:
        return None
    ctx_tokens = mistake.context_before.split()

    # Strategy 1: strict whole-word match.
    matched = _match_window(ctx_tokens, err_tokens, words, normalize=False)
    if matched is not None:
        return _build_located(mistake, matched)

    # Strategy 2: punctuation-tolerant (casefold + ASCII quotes + strip punct).
    matched = _match_window(ctx_tokens, err_tokens, words, normalize=True)
    if matched is not None:
        return _build_located(mistake, matched)

    # Strategy 3: error_text alone if it appears exactly once on the page.
    # Catches LLM context drift in multi-column layouts.
    matched = _find_error_alone_if_unique(err_tokens, words)
    if matched is not None:
        return _build_located(mistake, matched)

    # Strategy 4: substring of the concatenated normalised stream. Handles LLM
    # tokenisation drift like `d'une` → `d' + une`, where the standalone word
    # has no PyMuPDF token equivalent.
    matched = _find_error_as_substring_if_unique(err_tokens, words)
    if matched is not None:
        return _build_located(mistake, matched)

    return None
```

Why this exact order:

1. **Strict.** The `context_before + error_text` window matches word for word, no normalization. The happy case: the LLM quotes the PDF perfectly, exact match, zero ambiguity.

2. **Tolerant.** The LLM capitalizes the first word of a sentence, or swaps `'` for `'` (a typographic apostrophe). `_normalize` casefolds everything, replaces curly quotes and apostrophes with their ASCII version, and strips the punctuation PyMuPDF glues onto tokens.

3. **Error-only unique.** On two-column CVs, the `context_before` the LLM produces is sometimes lifted from the *wrong* column (models linearize multi-column layouts clumsily). If `error_text` appears exactly once on the page, take it, context be damned. That's enough in the vast majority of cases.

4. **Substring of the concatenated stream.** Nasty case: `d'une` is one word to the LLM, but PyMuPDF tokenizes it as `d'` + `une`. The LLM may return `error_text="une"` as a standalone word with no matching PyMuPDF token. Fix: concatenate all the page's tokens into a single string and search by substring. We gate on `_MIN_SUBSTRING_CHARS = 5`, because without it an `error_text="une"` shows up inside `commune`, `lacune`, `tribune`. Cue the false positives.

If none of the four catches anything, the mistake lands in a *"Not located"* section of the result instead of being silently dropped. A visible mistake the user can read but that has no red rectangle is less bad than a mistake we claim is somewhere it isn't.

## Takeaways

If you're hacking on something similar, three things to remember:

1. A regex doesn't detect names, companies or dates. You need a trained detector.
2. If you want to stream structured output (pydantic objects on the fly, not the whole list at the end), the usual libs won't cut it. `instructor` is built for that.
3. If the LLM works on text extracted from a document (PDF, OCR, scans), it hands you mistakes with no coordinates. You have to relocate them afterward, and accept it won't always be possible.

`piighost` handles the first point. `instructor` handles the second. The third is what made me write this project, whose code is open.

- **piighost**: [github.com/Athroniaeth/piighost](https://github.com/Athroniaeth/piighost), the anonymization lib used here.
- **piighost-proofreader**: [github.com/Athroniaeth/piighost-proofreader](https://github.com/Athroniaeth/piighost-proofreader), the full project, live demo, locator included.

Issues and PRs welcome. If you work with private text in an LLM, the three points above will probably ring a bell.

<!--
SCREENSHOT: docs/blog/assets/2026-05-26-cv-result-desktop.png (shared with the FR post; UI is in French — a French CV demo).
Before publishing on dev.to: drag-drop the PNG into the dev.to editor so Forem hosts it,
then replace the relative ./assets/... path above with the dev.to-hosted URL.
-->
