import { describe, it, expect } from "vitest";
import { scaleBox } from "@/lib/scaling";

describe("scaleBox", () => {
  it("scales each component by the viewport scale", () => {
    const bbox: [number, number, number, number] = [100, 200, 150, 230];
    const result = scaleBox(bbox, 1.5);
    expect(result).toEqual({
      left: 150,
      top: 300,
      width: 75,
      height: 45,
    });
  });

  it("returns zero-sized rect for a degenerate bbox", () => {
    expect(scaleBox([10, 10, 10, 10], 2)).toEqual({
      left: 20,
      top: 20,
      width: 0,
      height: 0,
    });
  });

  it("supports fractional scales", () => {
    const result = scaleBox([0, 0, 100, 50], 0.5);
    expect(result.width).toBe(50);
    expect(result.height).toBe(25);
  });
});
