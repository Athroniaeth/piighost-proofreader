import { render, screen } from "@testing-library/react";
import { LanguageProvider } from "@/i18n/LanguageContext";
import EmptyState from "@/components/EmptyState";

function renderWith(lang: "en" | "fr") {
  localStorage.setItem("lang", lang);
  return render(
    <LanguageProvider>
      <EmptyState onFile={() => {}} onReject={() => {}} />
    </LanguageProvider>
  );
}

describe("EmptyState i18n", () => {
  beforeEach(() => localStorage.clear());

  it("renders English copy by default", () => {
    renderWith("en");
    expect(screen.getByText("Browse my files")).toBeTruthy();
  });

  it("renders French copy when lang is fr", () => {
    renderWith("fr");
    expect(screen.getByText("Parcourir mes fichiers")).toBeTruthy();
  });
});
