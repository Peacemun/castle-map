/**
 * Visual encoding of heat intensity. Quantities (H) are never modified; only their
 * mapping to colour is non-linear.
 *
 *   v = log(1 + H/h0) / log(1 + Hmax/h0),   h0 = Hmax / dynamicRange
 *
 * Hmax is a FIXED reference (the maximum of the full-dataset cumulative surface for
 * the chosen measure), so colours mean the same thing at every point on the timeline
 * and the stain visibly accumulates instead of being re-normalised each frame.
 */

export interface ColourScale {
  hMax: number;
  h0: number;
}

export function makeScale(hMax: number, dynamicRange: number): ColourScale {
  const safe = hMax > 0 ? hMax : 1;
  return { hMax: safe, h0: safe / dynamicRange };
}

export function intensity(H: number, s: ColourScale): number {
  if (!(H > 0)) return 0;
  const v = Math.log1p(H / s.h0) / Math.log1p(s.hMax / s.h0);
  return v > 1 ? 1 : v;
}

/** Inverse of `intensity`: the H value shown at a given legend position v. */
export function valueAt(v: number, s: ColourScale): number {
  return s.h0 * (Math.pow(1 + s.hMax / s.h0, v) - 1);
}

type RGB = [number, number, number];

/** Stops: transparent → pale rose → desaturated terracotta → muted dark red → burgundy → deep crimson. */
export const PALETTE: { v: number; rgb: RGB }[] = [
  { v: 0.0, rgb: [244, 224, 220] },
  { v: 0.18, rgb: [236, 196, 186] },
  { v: 0.38, rgb: [196, 120, 96] },
  { v: 0.58, rgb: [150, 58, 50] },
  { v: 0.8, rgb: [108, 28, 42] },
  { v: 1.0, rgb: [74, 8, 28] },
];

/** High-contrast palette (stronger luminance steps) for the accessible theme. */
export const PALETTE_HC: { v: number; rgb: RGB }[] = [
  { v: 0.0, rgb: [255, 230, 120] },
  { v: 0.25, rgb: [255, 150, 40] },
  { v: 0.5, rgb: [220, 40, 40] },
  { v: 0.75, rgb: [140, 0, 90] },
  { v: 1.0, rgb: [40, 0, 40] },
];

export function colourAt(v: number, palette = PALETTE): RGB {
  if (v <= palette[0].v) return palette[0].rgb;
  for (let i = 1; i < palette.length; i++) {
    const a = palette[i - 1];
    const b = palette[i];
    if (v <= b.v) {
      const f = (v - a.v) / (b.v - a.v);
      return [a.rgb[0] + (b.rgb[0] - a.rgb[0]) * f, a.rgb[1] + (b.rgb[1] - a.rgb[1]) * f, a.rgb[2] + (b.rgb[2] - a.rgb[2]) * f];
    }
  }
  return palette[palette.length - 1].rgb;
}

/** Opacity: near-transparent for negligible values, rising smoothly to `maxAlpha`. */
export function alphaAt(v: number, maxAlpha = 0.82): number {
  if (v <= 0.02) return 0;
  const x = Math.min(1, (v - 0.02) / 0.35);
  const smooth = x * x * (3 - 2 * x);
  return maxAlpha * (0.25 + 0.75 * smooth) * Math.min(1, v / 0.06);
}

/** Write RGBA pixels for a grid of H values. */
export function colourise(H: Float32Array, scale: ColourScale, out: Uint8ClampedArray, palette = PALETTE, maxAlpha = 0.82): Uint8ClampedArray {
  // Small lookup table for speed.
  const LUT = 256;
  const lut = new Uint8ClampedArray(LUT * 4);
  for (let i = 0; i < LUT; i++) {
    const v = i / (LUT - 1);
    const [r, g, b] = colourAt(v, palette);
    lut[i * 4] = r;
    lut[i * 4 + 1] = g;
    lut[i * 4 + 2] = b;
    lut[i * 4 + 3] = Math.round(alphaAt(v, maxAlpha) * 255);
  }
  const k = 1 / Math.log1p(scale.hMax / scale.h0);
  for (let i = 0; i < H.length; i++) {
    const h = H[i];
    if (!(h > 0)) {
      out[i * 4 + 3] = 0;
      continue;
    }
    let v = Math.log1p(h / scale.h0) * k;
    if (v > 1) v = 1;
    const j = Math.round(v * (LUT - 1)) * 4;
    out[i * 4] = lut[j];
    out[i * 4 + 1] = lut[j + 1];
    out[i * 4 + 2] = lut[j + 2];
    out[i * 4 + 3] = lut[j + 3];
  }
  return out;
}
