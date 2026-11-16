/**
 * "Frontiers and Conflict" helpers: distance from a point to the nearest territory
 * of a DIFFERENT political authority. Coastlines therefore do not count as frontiers.
 * Distances are approximate (local equirectangular projection), adequate for the
 * tens-of-kilometres scale of the analysis.
 */
import type { Feature, Geometry, Position } from 'geojson';

const KM_PER_DEG = 111.32;

function segDistKm(px: number, py: number, a: Position, b: Position, cosLat: number): number {
  const ax = (a[0] - px) * cosLat, ay = a[1] - py;
  const bx = (b[0] - px) * cosLat, by = b[1] - py;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? -(ax * dx + ay * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const x = ax + t * dx, y = ay + t * dy;
  return Math.sqrt(x * x + y * y) * KM_PER_DEG;
}

function rings(g: Geometry): Position[][] {
  if (g.type === 'Polygon') return g.coordinates;
  if (g.type === 'MultiPolygon') return g.coordinates.flat();
  return [];
}

function pointInRing(x: number, y: number, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInGeometry(pt: [number, number], g: Geometry): boolean {
  if (g.type === 'Polygon') return pointInRing(pt[0], pt[1], g.coordinates[0]) && !g.coordinates.slice(1).some((h) => pointInRing(pt[0], pt[1], h));
  if (g.type === 'MultiPolygon') return g.coordinates.some((p) => pointInRing(pt[0], pt[1], p[0]) && !p.slice(1).some((h) => pointInRing(pt[0], pt[1], h)));
  return false;
}

export function distanceToGeometryKm(pt: [number, number], g: Geometry, maxKm = Infinity): number {
  const cosLat = Math.cos((pt[1] * Math.PI) / 180);
  let best = Infinity;
  const degLimit = maxKm / KM_PER_DEG;
  for (const ring of rings(g)) {
    for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1], b = ring[i];
      // Quick reject by bounding box
      if (Math.min(a[1], b[1]) - pt[1] > degLimit || pt[1] - Math.max(a[1], b[1]) > degLimit) continue;
      const d = segDistKm(pt[0], pt[1], a, b, cosLat);
      if (d < best) best = d;
    }
  }
  return best;
}

/**
 * Distance (km) from a point to the nearest active territory whose authority differs
 * from the authority of the territory containing the point. Infinity if none.
 */
export function frontierDistanceKm(pt: [number, number], active: Feature<Geometry, { authorityId: string }>[], maxKm = 60): number {
  const home = active.find((f) => pointInGeometry(pt, f.geometry));
  const homeAuth = home?.properties.authorityId;
  let best = Infinity;
  for (const f of active) {
    if (f.properties.authorityId === homeAuth) continue;
    const d = distanceToGeometryKm(pt, f.geometry, maxKm);
    if (d < best) best = d;
  }
  return best;
}
