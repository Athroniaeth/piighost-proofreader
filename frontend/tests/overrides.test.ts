import { describe, it, expect } from "vitest";
import { applyOverrides } from "@/lib/overrides";
import type { PageDetection, OverrideEntry } from "@/lib/types";

const INITIAL: PageDetection[] = [
  {
    text: "Pierre", label: "PERSON",
    start_pos: 0, end_pos: 6, confidence: 0.99,
    page: 0, bbox: [10, 20, 30, 40],
  },
  {
    text: "Lyon", label: "LOCATION",
    start_pos: 30, end_pos: 34, confidence: 0.88,
    page: 0, bbox: [50, 20, 70, 40],
  },
];

describe("applyOverrides", () => {
  it("returns initial when no overrides", () => {
    expect(applyOverrides(INITIAL, [])).toEqual(INITIAL);
  });

  it("keeps removed detections out of the final list", () => {
    const ovs: OverrideEntry[] = [{ text: "Pierre", label: "PERSON", remove: true }];
    const out = applyOverrides(INITIAL, ovs);
    expect(out.find((d) => d.text === "Pierre")).toBeUndefined();
    expect(out.find((d) => d.text === "Lyon")).toBeDefined();
  });

  it("adds a synthetic manual entry per add override", () => {
    const ovs: OverrideEntry[] = [{ text: "Acme", label: "ORG" }];
    const out = applyOverrides(INITIAL, ovs);
    const added = out.find((d) => d.text === "Acme");
    expect(added).toBeDefined();
    expect(added?.manual).toBe(true);
    expect(added?.bbox).toBeNull();
  });

  it("supports relabel via remove + add", () => {
    const ovs: OverrideEntry[] = [
      { text: "Lyon", label: "LOCATION", remove: true },
      { text: "Lyon", label: "CITY" },
    ];
    const out = applyOverrides(INITIAL, ovs);
    const lyons = out.filter((d) => d.text === "Lyon");
    expect(lyons.length).toBe(1);
    expect(lyons[0].label).toBe("CITY");
    expect(lyons[0].manual).toBe(true);
  });

  it("a remove with no match is a no-op", () => {
    const ovs: OverrideEntry[] = [{ text: "Nope", label: "PERSON", remove: true }];
    expect(applyOverrides(INITIAL, ovs)).toEqual(INITIAL);
  });
});
