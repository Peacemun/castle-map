import { describe, expect, it } from 'vitest';
import { computeHeat, createGrid, eventFootprint, frequencyEligible, haversineKm, integrate, maxOf, spatialSamples, timeFactor, type HeatSource } from '../../src/heatmap/model';
import { EventLocation, HistoricalEvent } from '../../src/historical-data/schemas';
import { colourise, intensity, makeScale, valueAt } from '../../src/heatmap/colour';

const grid = createGrid({ west: -4, east: 0, south: 52, north: 56, cols: 160 });
const loc = (o: Record<string, unknown>) => EventLocation.parse(o);
const src = (id: string, lon: number, lat: number, weight: number, start: number, end = start, kind = 'verified-point'): HeatSource => {
  const sp = spatialSamples(loc({ kind, point: [lon, lat] }));
  if (!sp.ok) throw new Error('no samples');
  return { id, eventId: id, weight, start, end, footprints: eventFootprint(grid, sp.samples) };
};
const P = (mode: 'cumulative' | 'frequency' | 'fading' | 'recent') => ({ mode, halfLifeYears: 150, windowYears: 50 });

describe('spatial model', () => {
  it('uses geographic distance', () => {
    expect(haversineKm(-1.5, 54, -1.5, 55)).toBeCloseTo(111.2, 0);
  });

  it('kernel conserves the quantity (integrates to the weight)', () => {
    const H = computeHeat(grid, [src('a', -2, 54, 1000, 1100)], 1200, P('cumulative'));
    expect(integrate(grid, H)).toBeCloseTo(1000, 0);
  });

  it('uncertain locations are spread wider, not concentrated', () => {
    const exact = computeHeat(grid, [src('a', -2, 54, 100, 1100)], 1200, P('cumulative'));
    const vague = spatialSamples(loc({ kind: 'approximate-point', point: [-2, 54], uncertaintyKm: 30 }));
    if (!vague.ok) throw new Error();
    const H2 = computeHeat(grid, [{ id: 'b', eventId: 'b', weight: 100, start: 1100, end: 1100, footprints: eventFootprint(grid, vague.samples) }], 1200, P('cumulative'));
    expect(maxOf(H2)).toBeLessThan(maxOf(exact) / 3);
    expect(integrate(grid, H2)).toBeCloseTo(100, 0);
  });

  it('splits disputed locations between alternatives', () => {
    const sp = spatialSamples(loc({ kind: 'disputed', point: [-3, 53], alternatives: [{ point: [-3, 53], label: 'A' }, { point: [-1, 55], label: 'B' }] }));
    expect(sp.ok && sp.samples.map((s) => s.share)).toEqual([0.5, 0.5]);
  });

  it('excludes unknown and over-uncertain locations', () => {
    expect(spatialSamples(loc({ kind: 'unknown' })).ok).toBe(false);
    expect(spatialSamples(loc({ kind: 'area', point: [-2, 54], uncertaintyKm: 200 })).ok).toBe(false);
  });
});

describe('time behaviour', () => {
  const sources = [src('a', -2, 54, 500, 1100), src('b', -2.05, 54.02, 500, 1300)];

  it('cumulative heat grows and older events stay', () => {
    const at = (y: number) => maxOf(computeHeat(grid, sources, y, P('cumulative')));
    expect(at(1050)).toBe(0);
    expect(at(1200)).toBeGreaterThan(0);
    expect(at(1400)).toBeGreaterThan(at(1200));
  });

  it('scrubbing backward removes future events (recomputed, not painted)', () => {
    const forward = computeHeat(grid, sources, 1400, P('cumulative'));
    const back = computeHeat(grid, sources, 1150, P('cumulative'), new Float32Array(forward));
    expect(integrate(grid, back)).toBeCloseTo(500, 0);
  });

  it('is deterministic for a given year', () => {
    const a = computeHeat(grid, sources, 1333.3, P('fading'));
    const b = computeHeat(grid, sources, 1333.3, P('fading'));
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('fading halves after one half-life', () => {
    expect(timeFactor(1250, 1100, 1100, P('fading'))).toBeCloseTo(0.5);
    const H1 = integrate(grid, computeHeat(grid, [sources[0]], 1101, P('fading')));
    const H2 = integrate(grid, computeHeat(grid, [sources[0]], 1400, P('fading')));
    expect(H2).toBeLessThan(H1);
  });

  it('recent mode only shows the window', () => {
    expect(timeFactor(1140, 1100, 1100, P('recent'))).toBe(1);
    expect(timeFactor(1160, 1100, 1100, P('recent'))).toBe(0);
  });

  it('multi-year contributions accrue linearly', () => {
    expect(timeFactor(1941, 1940, 1942, P('cumulative'))).toBeCloseTo(0.5);
  });

  it('repeated events in an area increase frequency intensity', () => {
    const one = [src('a', -2, 54, 1, 1100)];
    const three = [src('a', -2, 54, 1, 1100), src('b', -2.02, 54.01, 1, 1110), src('c', -1.98, 53.99, 1, 1120)];
    expect(maxOf(computeHeat(grid, three, 1200, P('frequency')))).toBeGreaterThan(2.5 * maxOf(computeHeat(grid, one, 1200, P('frequency'))));
  });
});

describe('frequency eligibility', () => {
  const ev = (id: string, type: string, parentId: string | null = null) => HistoricalEvent.parse({ id, name: id, type, date: { from: '1300', precision: 'year' }, location: { kind: 'unknown' }, country: 'England', parentId, sources: [{ sourceId: 'src-x' }], confidence: 'low', provenance: 'curated', verification: 'compiled-unverified' });
  it('counts children, not their parent campaigns', () => {
    const ids = frequencyEligible([ev('evt-war', 'campaign'), ev('evt-b1', 'battle', 'evt-war'), ev('evt-b2', 'siege', 'evt-war'), ev('evt-t', 'political-change')]).map((e) => e.id);
    expect(ids.sort()).toEqual(['evt-b1', 'evt-b2']);
  });
});

describe('colour scaling', () => {
  const s = makeScale(1000, 1000);
  it('is logarithmic, monotone and bounded', () => {
    expect(intensity(0, s)).toBe(0);
    expect(intensity(1000, s)).toBeCloseTo(1);
    expect(intensity(5000, s)).toBe(1);
    expect(intensity(10, s)).toBeGreaterThan(0.3); // small events remain visible
    expect(valueAt(intensity(42, s), s)).toBeCloseTo(42, 6);
  });
  it('leaves negligible values transparent', () => {
    const out = colourise(new Float32Array([0, 1e-9, 1000]), s, new Uint8ClampedArray(12));
    expect(out[3]).toBe(0);
    expect(out[7]).toBe(0);
    expect(out[11]).toBeGreaterThan(150);
  });
});
