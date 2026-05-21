export interface PixelRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function scaleBox(
  bbox: [number, number, number, number],
  scale: number
): PixelRect {
  const [x0, y0, x1, y1] = bbox;
  return {
    left: x0 * scale,
    top: y0 * scale,
    width: (x1 - x0) * scale,
    height: (y1 - y0) * scale,
  };
}
