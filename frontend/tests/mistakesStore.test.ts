import { describe, it, expect } from "vitest";
import { mistakesReducer, initState } from "@/hooks/useMistakesStore";

describe("mistakesReducer", () => {
  it("initializes 3 mistakes as enabled and inactive", () => {
    expect(initState(3)).toEqual({
      enabled: [true, true, true],
      activeIndex: null,
    });
  });

  it("TOGGLE flips enabled at index", () => {
    const next = mistakesReducer(initState(2), { type: "TOGGLE", index: 0 });
    expect(next.enabled).toEqual([false, true]);
  });

  it("SET_ACTIVE sets a unique active index", () => {
    const next = mistakesReducer(initState(2), { type: "SET_ACTIVE", index: 1 });
    expect(next.activeIndex).toBe(1);
  });

  it("SET_ACTIVE with the current active index clears it (toggle off)", () => {
    const s = mistakesReducer(initState(2), { type: "SET_ACTIVE", index: 1 });
    const cleared = mistakesReducer(s, { type: "SET_ACTIVE", index: 1 });
    expect(cleared.activeIndex).toBeNull();
  });

  it("TOGGLE on the currently active index also clears active", () => {
    const s = mistakesReducer(initState(2), { type: "SET_ACTIVE", index: 0 });
    const next = mistakesReducer(s, { type: "TOGGLE", index: 0 });
    expect(next.enabled[0]).toBe(false);
    expect(next.activeIndex).toBeNull();
  });

  it("SET_ALL replaces every enabled flag with the same value", () => {
    const next = mistakesReducer(initState(3), { type: "SET_ALL", enabled: false });
    expect(next.enabled).toEqual([false, false, false]);
    expect(next.activeIndex).toBeNull();
  });
});
