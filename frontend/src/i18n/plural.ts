import type { TranslationKey } from "./types";

type TFn = (key: TranslationKey, params?: Record<string, string | number>) => string;

export function plural(t: TFn, n: number, base: "mistake" | "entity"): string {
  const key = (n === 1 ? `${base}_one` : `${base}_other`) as TranslationKey;
  return t(key, { n });
}
