import { describe, expect, it } from 'vitest';
import { parseUrl, serialiseUrl } from '../../src/state/url';
import { DEFAULT_LAYERS } from '../../src/state/store';
import { distanceToGeometryKm, frontierDistanceKm, pointInGeometry } from '../../src/map/frontiers';

describe('deep links', () => {
  it('round-trips state', () => {
    const s = { year: 1314.5, selection: { kind: 'event' as const, id: 'evt-bannockburn-1314' }, center: [-3.92, 56.09] as [number, number], zoom: 8.5, layers: { ...DEFAULT_LAYERS, undated: true, heatmap: false }, heatMode: 'fading' as const, halfLifeYears: 100, pacing: 'chronological' as const, durationMin: 5 as const, frontiers: true };
    const parsed = parseUrl(serialiseUrl(s));
    expect(parsed).toMatchObject({ ...s, year: 1314.5 });
  });
  it('rejects invalid values', () => {
    expect(parseUrl('?y=3000&hm=bogus&sel=x:evil&z=99')).toEqual({});
  });
});

describe('frontier distance', () => {
  const sq = (x0: number, authorityId: string) => ({ type: 'Feature' as const, properties: { authorityId }, geometry: { type: 'Polygon' as const, coordinates: [[[x0, 54], [x0 + 1, 54], [x0 + 1, 55], [x0, 55], [x0, 54]]] } });
  it('measures distance to a different authority only', () => {
    const a = sq(-3, 'auth-a');
    const b = sq(-2, 'auth-b');
    expect(pointInGeometry([-2.5, 54.5], a.geometry)).toBe(true);
    const d = frontierDistanceKm([-2.1, 54.5], [a, b]);
    expect(d).toBeGreaterThan(5);
    expect(d).toBeLessThan(8);
    expect(distanceToGeometryKm([-2.5, 54.5], a.geometry)).toBeGreaterThan(30);
    expect(frontierDistanceKm([-2.9, 54.5], [a, sq(-3, 'auth-a')])).toBe(Infinity);
  });
});
