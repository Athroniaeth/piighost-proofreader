import { useT } from "@/i18n/LanguageContext";
import { cn } from "@/utils/cn";

export default function LanguageSwitcher() {
  const { lang, setLang } = useT();
  const cls = (active: boolean) =>
    cn(
      "px-1 transition",
      active ? "font-bold text-text-50" : "text-text-200 hover:text-text-50"
    );
  return (
    <div className="fixed top-4 right-4 z-50 flex items-center gap-1 text-sm">
      <button
        type="button"
        aria-pressed={lang === "en"}
        onClick={() => setLang("en")}
        className={cls(lang === "en")}
      >
        EN
      </button>
      <span className="text-text-200">·</span>
      <button
        type="button"
        aria-pressed={lang === "fr"}
        onClick={() => setLang("fr")}
        className={cls(lang === "fr")}
      >
        FR
      </button>
    </div>
  );
}
