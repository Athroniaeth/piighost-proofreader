import { render, screen, act } from "@testing-library/react";
import { LanguageProvider, useT } from "@/i18n/LanguageContext";
import { plural } from "@/i18n/plural";

function Probe() {
  const { t, lang, setLang } = useT();
  return (
    <div>
      <span data-testid="lang">{lang}</span>
      <span data-testid="tagline">{t("empty_browse_button")}</span>
      <span data-testid="plural">{plural(t, 2, "mistake")}</span>
      <span data-testid="plural-one">{plural(t, 1, "entity")}</span>
      <button onClick={() => setLang("fr")}>fr</button>
    </div>
  );
}

describe("i18n", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to English when nothing is stored", () => {
    render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>
    );
    expect(screen.getByTestId("lang").textContent).toBe("en");
    expect(screen.getByTestId("tagline").textContent).toBe("Browse my files");
  });

  it("initialises from a stored language", () => {
    localStorage.setItem("lang", "fr");
    render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>
    );
    expect(screen.getByTestId("tagline").textContent).toBe("Parcourir mes fichiers");
  });

  it("switches language and persists to localStorage", () => {
    render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>
    );
    act(() => {
      screen.getByText("fr").click();
    });
    expect(screen.getByTestId("tagline").textContent).toBe("Parcourir mes fichiers");
    expect(localStorage.getItem("lang")).toBe("fr");
  });

  it("interpolates and pluralises", () => {
    render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>
    );
    expect(screen.getByTestId("plural").textContent).toBe("2 mistakes");
    expect(screen.getByTestId("plural-one").textContent).toBe("1 entity");
  });
});
