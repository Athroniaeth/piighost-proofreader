import { render, screen, act } from "@testing-library/react";
import { LanguageProvider } from "@/i18n/LanguageContext";
import LanguageSwitcher from "@/components/LanguageSwitcher";

describe("LanguageSwitcher", () => {
  beforeEach(() => localStorage.clear());

  it("shows EN active by default and switches to FR on click", () => {
    render(
      <LanguageProvider>
        <LanguageSwitcher />
      </LanguageProvider>
    );
    const en = screen.getByRole("button", { name: "EN" });
    const fr = screen.getByRole("button", { name: "FR" });
    expect(en.getAttribute("aria-pressed")).toBe("true");
    expect(fr.getAttribute("aria-pressed")).toBe("false");

    act(() => fr.click());

    expect(fr.getAttribute("aria-pressed")).toBe("true");
    expect(localStorage.getItem("lang")).toBe("fr");
  });
});
