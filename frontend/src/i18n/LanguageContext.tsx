import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { en } from "./en";
import { fr } from "./fr";
import type { Lang, TranslationKey } from "./types";

const dicts = { en, fr } as const;
const STORAGE_KEY = "lang";

function readInitialLang(): Lang {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "fr" || stored === "en" ? stored : "en";
}

export interface LanguageContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(readInitialLang);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, lang);
  }, [lang]);

  const t = (
    key: TranslationKey,
    params?: Record<string, string | number>
  ): string => {
    const template = dicts[lang][key] ?? dicts.en[key] ?? key;
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (_, k) =>
      k in params ? String(params[k]) : `{${k}}`
    );
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useT(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useT must be used within a LanguageProvider");
  return ctx;
}
