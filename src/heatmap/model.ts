/**
 * Spatial influence model for the conflict heatmap.
 *
 *   H(x, t) = Σ_events W(e) · K(d(x, e)) · T(t, e)
 *
 * - W: the event's selected (de-duplicated) death estimate, or 1 in frequency mode.
 * - K: a 2-D Gaussian in geographic kilometres, normalised so that it integrates to 1
 *      over the grid. H therefore has units of "deaths per km²" (or events per km²):
 *      smoothing spreads a quantity, it never creates or removes any.
 *      σ = influenceKm / 2; positional uncertainty widens it: σ_eff = √(σ² + (u/2)²).
 * - T: 1 in cumulative modes (ramping linearly across multi-day/multi-year events),
 *      ½^(age/halfLife) in fading mode, and a window indicator in recent mode.
 *
 * The grid is aligned to Web Mercator rows so it can be drawn as a map image without
 * resampling distortion; all distances are computed in kilometres on the sphere.
 */
import type { EventLocation, HistoricalEvent } from '../historical-data/schemas';

export const EARTH_R = 6371.0088;
const DEG = Math.PI / 180;

export interface GridSpec {
  west: number;
  east: number;
  south: number;
  north: number;
  cols: number;
}

export interface Grid extends GridSpec {
  rows: number;
  lons: Float64Array;
  lats: Float64Array;
  /** Cell area (km²) per row. */
  areaKm2: Float64Array;
  mercN: number;
  mercS: number;
}

export const DEFAULT_GRID: GridSpec = { west: -8.8, east: 2.4, south: 49.8, north: 61.0, cols: 360 };

const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * DEG) / 2));
const latFromMerc = (y: number) => Math.atan(Math.sinh(y)) / DEG;

export function createGrid(spec: GridSpec = DEFAULT_GRID): Grid {
  const mercN = mercY(spec.north);
  const mercS = mercY(spec.south);
  const dLon = ((spec.east - spec.west) / spec.cols) * DEG;
  const rows = Math.round((spec.cols * (mercN - mercS)) / ((spec.east - spec.west) * DEG));
  const dY = (mercN - mercS) / rows;
  const lons = new Float64Array(spec.cols);
  for (let c = 0; c < spec.cols; c++) lons[c] = spec.west + ((c + 0.5) / spec.cols) * (spec.east - spec.west);
  const lats = new Float64Array(rows);
  const areaKm2 = new Float64Array(rows);
  for (let r = 0; r < rows; r++) {
    const lat = latFromMerc(mercN - (r + 0.5) * dY);
    lats[r] = lat;
    const cos = Math.cos(lat * DEG);
    areaKm2[r] = EARTH_R * EARTH_R * cos * cos * dLon * dY;
  }
  return { ...spec, rows, lons, lats, areaKm2, mercN, mercS };
}

/** Great-circle distance in km. */
export function haversineKm(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const dLat = (lat2 - lat1) * DEG;
  const dLon = (lon2 - lon1) * DEG;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface SpatialSample {
  lon: number;
  lat: number;
  /** Share of the event's weight carried by this sample (shares sum to 1). */
  share: number;
  sigmaKm: number;
}

export interface SpatialOptions {
  influenceKm: number;
  /** Events whose positional uncertainty exceeds this are excluded from the quantitative surface. */
  maxUncertaintyKm: number;
}

export const DEFAULT_SPATIAL: SpatialOptions = { influenceKm: 15, maxUncertaintyKm: 75 };

export type SpatialResult = { ok: true; samples: SpatialSample[] } | { ok: false; reason: 'unknown-location' | 'too-uncertain' };

/** Uncertainty-aware spatial representation of an event location. */
export function spatialSamples(loc: EventLocation, opts: SpatialOptions = DEFAULT_SPATIAL): SpatialResult {
  const sigma = opts.influenceKm / 2;
  const widen = (u: number | null) => Math.sqrt(sigma * sigma + ((u ?? 0) / 2) ** 2);
  if (loc.kind === 'unknown' || !loc.point) return { ok: false, reason: 'unknown-location' };
  if ((loc.uncertaintyKm ?? 0) > opts.maxUncertaintyKm) return { ok: false, reason: 'too-uncertain' };
  if ((loc.kind === 'disputed' || loc.kind === 'multiple') && loc.alternatives.length > 0) {
    const total = loc.alternatives.reduce((s, a) => s + (a.weight ?? 1), 0);
    return {
      ok: true,
      samples: loc.alternatives.map((a) => ({ lon: a.point[0], lat: a.point[1], share: (a.weight ?? 1) / total, sigmaKm: widen(loc.uncertaintyKm) })),
    };
  }
  if (loc.kind === 'area' && loc.samples.length > 0) {
    return { ok: true, samples: loc.samples.map(([lon, lat]) => ({ lon, lat, share: 1 / loc.samples.length, sigmaKm: sigma })) };
  }
  return { ok: true, samples: [{ lon: loc.point[0], lat: loc.point[1], share: 1, sigmaKm: widen(loc.kind === 'verified-point' ? 0 : loc.uncertaintyKm) }] };
}

/** Sparse kernel footprint: cell indices and density weights (per km²) integrating to 1. */
export interface Footprint {
  idx: Uint32Array;
  w: Float32Array;
}

export function kernelFootprint(grid: Grid, s: SpatialSample): Footprint | null {
  const reach = 3 * s.sigmaKm;
  const cosLat = Math.cos(s.lat * DEG);
  const dLonDeg = reach / (EARTH_R * Math.max(0.05, cosLat) * DEG);
  const dLatDeg = reach / (EARTH_R * DEG);
  const colWidth = (grid.east - grid.west) / grid.cols;
  const c0 = Math.max(0, Math.floor((s.lon - dLonDeg - grid.west) / colWidth));
  const c1 = Math.min(grid.cols - 1, Math.ceil((s.lon + dLonDeg - grid.west) / colWidth));
  const dY = (grid.mercN - grid.mercS) / grid.rows;
  const r0 = Math.max(0, Math.floor((grid.mercN - mercY(Math.min(89, s.lat + dLatDeg))) / dY));
  const r1 = Math.min(grid.rows - 1, Math.ceil((grid.mercN - mercY(Math.max(-89, s.lat - dLatDeg))) / dY));
  if (c0 > c1 || r0 > r1) return null;
  const idx: number[] = [];
  const w: number[] = [];
  let mass = 0;
  const twoSig2 = 2 * s.sigmaKm * s.sigmaKm;
  for (let r = r0; r <= r1; r++) {
    const lat = grid.lats[r];
    const dyKm = (lat - s.lat) * DEG * EARTH_R;
    const cosMid = Math.cos(((lat + s.lat) / 2) * DEG);
    for (let c = c0; c <= c1; c++) {
      const dxKm = (grid.lons[c] - s.lon) * DEG * EARTH_R * cosMid;
      const d2 = dxKm * dxKm + dyKm * dyKm;
      if (d2 > reach * reach) continue;
      const g = Math.exp(-d2 / twoSig2);
      idx.push(r * grid.cols + c);
      w.push(g);
      mass += g * grid.areaKm2[r];
    }
  }
  if (mass <= 0) return null;
  const wf = new Float32Array(w.length);
  for (let i = 0; i < w.length; i++) wf[i] = (w[i] / mass) * s.share;
  return { idx: Uint32Array.from(idx), w: wf };
}

/** Footprint of a whole event (all its samples merged). */
export function eventFootprint(grid: Grid, samples: SpatialSample[]): Footprint[] {
  return samples.map((s) => kernelFootprint(grid, s)).filter((f): f is Footprint => f !== null);
}

export type HeatMode = 'cumulative' | 'frequency' | 'fading' | 'recent';
export type Measure = 'deaths' | 'events';

export interface TimeParams {
  mode: HeatMode;
  halfLifeYears: number;
  windowYears: number;
}

/**
 * Time factor T for a contribution occurring over [start, end] at time t.
 * Contributions accrue linearly across their date range (e.g. an eight-month Blitz).
 */
export function timeFactor(t: number, start: number, end: number, p: TimeParams): number {
  if (t < start) return 0;
  const accrued = end > start ? Math.min(1, (t - start) / (end - start)) : 1;
  switch (p.mode) {
    case 'cumulative':
    case 'frequency':
      return accrued;
    case 'fading':
      return accrued * Math.pow(0.5, (t - start) / p.halfLifeYears);
    case 'recent':
      return t - start <= p.windowYears ? accrued : 0;
  }
}

export interface HeatSource {
  id: string;
  eventId: string;
  weight: number;
  start: number;
  end: number;
  footprints: Footprint[];
}

/** Accumulate H on the grid at time t. Deterministic: sources are processed in a fixed order. */
export function computeHeat(grid: Grid, sources: HeatSource[], t: number, p: TimeParams, out?: Float32Array): Float32Array {
  const H = out ?? new Float32Array(grid.rows * grid.cols);
  H.fill(0);
  for (const s of sources) {
    const f = timeFactor(t, s.start, s.end, p);
    if (f <= 0) continue;
    const k = s.weight * f;
    for (const fp of s.footprints) {
      const { idx, w } = fp;
      for (let i = 0; i < idx.length; i++) H[idx[i]] += k * w[i];
    }
  }
  return H;
}

/** Integral of H over the grid (should equal Σ W·T for sources inside the grid). */
export function integrate(grid: Grid, H: Float32Array): number {
  let s = 0;
  for (let r = 0; r < grid.rows; r++) {
    const a = grid.areaKm2[r];
    for (let c = 0; c < grid.cols; c++) s += H[r * grid.cols + c] * a;
  }
  return s;
}

export function maxOf(H: Float32Array): number {
  let m = 0;
  for (let i = 0; i < H.length; i++) if (H[i] > m) m = H[i];
  return m;
}

/** Event types that count as independently recorded military/violent events. */
export const CONFLICT_TYPES: ReadonlySet<HistoricalEvent['type']> = new Set(['battle', 'siege', 'raid', 'skirmish', 'rebellion', 'campaign', 'massacre', 'air-raid']);

/**
 * Events counted in frequency mode: conflict events that have no child events in the
 * dataset. Parent campaigns/wars are represented by their children, preventing
 * double counting.
 */
export function frequencyEligible(events: HistoricalEvent[]): HistoricalEvent[] {
  const parents = new Set(events.map((e) => e.parentId).filter((x): x is string => !!x));
  return events.filter((e) => CONFLICT_TYPES.has(e.type) && !parents.has(e.id));
}
