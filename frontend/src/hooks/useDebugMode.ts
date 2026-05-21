import { useState } from "react";

function readFlag(name: string): boolean {
  return new URLSearchParams(window.location.search).get(name) === "1";
}

export function isDebugAvailable(): boolean {
  return readFlag("debug");
}

/**
 * Debug panel state. The panel is GATED by `?debug=1` — the toggle button
 * is rendered only when `available` is true, and the panel itself always
 * starts closed (toggled by the user).
 */
export function useDebugMode() {
  const [visible, setVisible] = useState(false);
  return {
    available: readFlag("debug"),
    visible,
    toggle: () => setVisible((v) => !v),
  };
}

export type FakeMode = "off" | "normal" | "empty";

export function fakeMode(): FakeMode {
  const v = new URLSearchParams(window.location.search).get("fake");
  if (v === "1") return "normal";
  if (v === "empty") return "empty";
  return "off";
}
