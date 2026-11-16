/** Geometry helpers for the data build (Turf.js, WGS84). */
import * as turf from '@turf/turf';
import type { Feature, MultiPolygon, Polygon, Position } from 'geojson';

export type Poly = Feature<Polygon | MultiPolygon>;
export type UnitName = 'England' | 'Scotland' | 'Wales';
export type Units = Record<UnitName, Poly>;

export interface ZoneDef {
  id: string;
  label: string;
  basis: string;
  ring?: Position[];
  rings?: Position[][];
}

export function loadUnits(fc: { features: { properties: { unit: string }; geometry: Polygon | MultiPolygon }[] }): Units {
  const out: Partial<Units> = {};
  for (const f of fc.features) {
    out[f.properties.unit as UnitName] = turf.feature(f.geometry) as Poly;
  }
  for (const k of ['England', 'Scotland', 'Wales'] as UnitName[]) if (!out[k]) throw new Error(`Missing Natural Earth unit ${k}`);
  return out as Units;
}

export function countryOf(units: Units, pt: [number, number]): UnitName | null {
  const p = turf.point(pt);
  for (const k of ['England', 'Scotland', 'Wales'] as UnitName[]) {
    if (turf.booleanPointInPolygon(p, units[k])) return k;
  }
  return null;
}

/** Nearest unit and distance (km); 0 when inside. */
export function nearestUnit(units: Units, pt: [number, number]): { unit: UnitName; km: number } {
  const inside = countryOf(units, pt);
  if (inside) return { unit: inside, km: 0 };
  let best: { unit: UnitName; km: number } = { unit: 'England', km: Infinity };
  const p = turf.point(pt);
  for (const k of ['England', 'Scotland', 'Wales'] as UnitName[]) {
    const km = Math.abs(turf.pointToPolygonDistance(p, units[k], { units: 'kilometers' }));
    if (km < best.km) best = { unit: k, km };
  }
  return best;
}

export function zoneToPoly(z: ZoneDef): Poly {
  if (z.ring) return turf.polygon([z.ring]) as Poly;
  if (z.rings) return turf.multiPolygon(z.rings.map((r) => [r])) as Poly;
  throw new Error(`Zone ${z.id} has no geometry`);
}

function unionAll(polys: Poly[]): Poly | null {
  const valid = polys.filter(Boolean);
  if (valid.length === 0) return null;
  if (valid.length === 1) return valid[0];
  return turf.union(turf.featureCollection(valid)) as Poly | null;
}

function intersect2(a: Poly | null, b: Poly | null): Poly | null {
  if (!a || !b) return null;
  return turf.intersect(turf.featureCollection([a, b])) as Poly | null;
}

/** Resolve "ne:England", "zone:lothian" or an intersection such as "zone:lothian&ne:Scotland". */
export function resolveRef(ref: string, units: Units, zones: Map<string, Poly>): Poly | null {
  const parts = ref.split('&');
  let acc: Poly | null = null;
  for (const part of parts) {
    let g: Poly | undefined;
    if (part.startsWith('ne:')) g = units[part.slice(3) as UnitName];
    else if (part.startsWith('zone:')) g = zones.get(part);
    if (!g) throw new Error(`Unknown geometry reference "${part}" in "${ref}"`);
    acc = acc === null ? g : intersect2(acc, g);
  }
  return acc;
}

export function territoryGeometry(include: string[], exclude: string[], units: Units, zones: Map<string, Poly>, land: Poly): Poly | null {
  const inc = unionAll(include.map((r) => resolveRef(r, units, zones)).filter((g): g is Poly => !!g));
  if (!inc) return null;
  let geom: Poly | null = intersect2(inc, land);
  const exc = unionAll(exclude.map((r) => resolveRef(r, units, zones)).filter((g): g is Poly => !!g));
  if (geom && exc) geom = turf.difference(turf.featureCollection([geom, exc])) as Poly | null;
  return geom;
}

export function landOf(units: Units): Poly {
  return unionAll([units.England, units.Scotland, units.Wales]) as Poly;
}

/** Up to `max` evenly spread sample points inside a polygon (for spreading heat over an area). */
export function samplePolygon(poly: Poly, max = 16): [number, number][] {
  const [minX, minY, maxX, maxY] = turf.bbox(poly);
  const pts: [number, number][] = [];
  for (let n = 3; n <= 12 && pts.length < max; n++) {
    pts.length = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const x = minX + ((i + 0.5) / n) * (maxX - minX);
        const y = minY + ((j + 0.5) / n) * (maxY - minY);
        if (turf.booleanPointInPolygon(turf.point([x, y]), poly)) pts.push([round(x), round(y)]);
      }
    }
    if (pts.length >= Math.min(max, 6)) break;
  }
  if (pts.length === 0) {
    const c = turf.pointOnFeature(poly).geometry.coordinates;
    pts.push([round(c[0]), round(c[1])]);
  }
  return pts.slice(0, max);
}

export function round(n: number, dp = 5): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

export function simplifyPoly<T extends Poly>(g: T, tolerance: number): T {
  const s = turf.simplify(g, { tolerance, highQuality: true, mutate: false });
  return turf.truncate(s, { precision: 4, coordinates: 2 }) as T;
}

export function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371.0088;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
