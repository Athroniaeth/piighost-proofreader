import { useEffect, useState } from "react";

function readFlag(name: string): boolean {
  return new URLSearchParams(window.location.search).get(name) === "1";
}

export function useDebugMode() {
  const [visible, setVisible] = useState(() => readFlag("debug"));
  useEffect(() => {
    setVisible(readFlag("debug"));
  }, []);
  return { visible, toggle: () => setVisible((v) => !v) };
}

export type FakeMode = "off" | "normal" | "empty";

export function fakeMode(): FakeMode {
  const v = new URLSearchParams(window.location.search).get("fake");
  if (v === "1") return "normal";
  if (v === "empty") return "empty";
  return "off";
}
