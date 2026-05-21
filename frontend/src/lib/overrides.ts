import type { OverrideEntry, PageDetection } from "./types";

export function applyOverrides(
  initial: PageDetection[],
  overrides: OverrideEntry[]
): PageDetection[] {
  const removeKeys = new Set(
    overrides.filter((o) => o.remove).map((o) => `${o.text}|${o.label}`)
  );
  const kept = initial.filter(
    (d) => !removeKeys.has(`${d.text}|${d.label}`)
  );
  const added: PageDetection[] = overrides
    .filter((o) => !o.remove)
    .map((o) => ({
      text: o.text,
      label: o.label,
      start_pos: -1,
      end_pos: -1,
      confidence: 1.0,
      page: o.page ?? -1,
      bbox: o.bbox ?? null,
      manual: true,
    }));
  return [...kept, ...added];
}
