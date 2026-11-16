/**
 * HeatEngine: builds heat sources from the dataset and computes the surface for a
 * given year. Footprints are cached per event and influence distance, so per-frame
 * work is a sparse weighted sum plus colourisation (a few milliseconds).
 */
import { accountDeaths, type EstimateChoice } from './accounting';
import { colourise, makeScale, PALETTE, PALETTE_HC, type ColourScale } from './colour';
import {
  computeHeat,
  createGrid,
  eventFootprint,
  frequencyEligible,
  maxOf,
  spatialSamples,
  type Footprint,
  type Grid,
  type HeatMode,
  type HeatSource,
  type Measure,
} from './model';
import type { CasualtyEstimate, HistoricalEvent } from '../historical-data/schemas';
import { endYear, startYear } from '../historical-data/dates';

export interface HeatSettings {
  mode: HeatMode;
  /** Measure used by fading and recent modes (cumulative = deaths, frequency = events). */
  memoryMeasure: Measure;
  estimate: EstimateChoice;
  influenceKm: number;
  halfLifeYears: number;
  windowYears: number;
  highContrast: boolean;
}

export const DEFAULT_HEAT: HeatSettings = {
  mode: 'cumulative',
  memoryMeasure: 'events',
  estimate: 'low',
  influenceKm: 15,
  halfLifeYears: 150,
  windowYears: 50,
  highContrast: false,
};

export function measureFor(s: Pick<HeatSettings, 'mode' | 'memoryMeasure'>): Measure {
  if (s.mode === 'cumulative') return 'deaths';
  if (s.mode === 'frequency') return 'events';
  return s.memoryMeasure;
}

export interface UnmappedContribution {
  eventId: string;
  deaths: number;
  reason: 'unknown-location' | 'too-uncertain';
}

export class HeatEngine {
  readonly grid: Grid;
  private footprintCache = new Map<string, Footprint[] | null>();
  private cacheInfluence = -1;
  private sources: { deaths: HeatSource[]; events: HeatSource[] } = { deaths: [], events: [] };
  private scales: Record<Measure, ColourScale> = { deaths: makeScale(1, 1000), events: makeScale(1, 50) };
  private key = '';
  private H: Float32Array;
  private rgba: Uint8ClampedArray;
  unmappedDeaths: UnmappedContribution[] = [];
  unmappedEvents: { eventId: string; reason: string }[] = [];
  private readonly eventById: Map<string, HistoricalEvent>;

  constructor(
    private readonly events: HistoricalEvent[],
    private readonly casualties: CasualtyEstimate[],
    gridCols = 360,
  ) {
    this.grid = createGrid({ west: -8.8, east: 2.4, south: 49.8, north: 61.0, cols: gridCols });
    this.H = new Float32Array(this.grid.rows * this.grid.cols);
    this.rgba = new Uint8ClampedArray(this.grid.rows * this.grid.cols * 4);
    this.eventById = new Map(events.map((e) => [e.id, e]));
  }

  private footprints(e: HistoricalEvent, influenceKm: number): Footprint[] | null {
    if (this.cacheInfluence !== influenceKm) {
      this.footprintCache.clear();
      this.cacheInfluence = influenceKm;
    }
    if (!this.footprintCache.has(e.id)) {
      const sp = spatialSamples(e.location, { influenceKm, maxUncertaintyKm: 75 });
      this.footprintCache.set(e.id, sp.ok ? eventFootprint(this.grid, sp.samples) : null);
    }
    return this.footprintCache.get(e.id)!;
  }

  /** Rebuild sources and reference scales when settings or the event filter change. */
  configure(s: HeatSettings, eventFilter: (e: HistoricalEvent) => boolean = () => true, filterKey = ''): boolean {
    const key = `${s.estimate}|${s.influenceKm}|${filterKey}`;
    if (key === this.key) return false;
    this.key = key;
    const { contributions } = accountDeaths(this.casualties, s.estimate);
    const deaths: HeatSource[] = [];
    this.unmappedDeaths = [];
    for (const c of contributions) {
      const e = this.eventById.get(c.eventId);
      if (!e || !eventFilter(e)) continue;
      const fp = this.footprints(e, s.influenceKm);
      if (!fp || fp.length === 0) {
        const sp = spatialSamples(e.location, { influenceKm: s.influenceKm, maxUncertaintyKm: 75 });
        this.unmappedDeaths.push({ eventId: e.id, deaths: c.deaths, reason: sp.ok ? 'unknown-location' : sp.reason });
        continue;
      }
      deaths.push({ id: c.accountId, eventId: e.id, weight: c.deaths, start: startYear(e.date), end: endYear(e.date), footprints: fp });
    }
    const evs: HeatSource[] = [];
    this.unmappedEvents = [];
    for (const e of frequencyEligible(this.events)) {
      if (!eventFilter(e)) continue;
      const fp = this.footprints(e, s.influenceKm);
      if (!fp || fp.length === 0) {
        this.unmappedEvents.push({ eventId: e.id, reason: e.location.kind === 'unknown' ? 'unknown-location' : 'too-uncertain' });
        continue;
      }
      const st = startYear(e.date);
      evs.push({ id: e.id, eventId: e.id, weight: 1, start: st, end: st, footprints: fp });
    }
    // Deterministic order
    deaths.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
    evs.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
    this.sources = { deaths, events: evs };
    // Fixed reference scales from the unfiltered-by-time cumulative surface at AD 2000.
    const ref = (src: HeatSource[]) => maxOf(computeHeat(this.grid, src, 2001, { mode: 'cumulative', halfLifeYears: 1, windowYears: 1 }));
    this.scales = { deaths: makeScale(ref(deaths), 1000), events: makeScale(ref(evs), 40) };
    return true;
  }

  scaleFor(m: Measure): ColourScale {
    return this.scales[m];
  }

  /** Compute RGBA pixels for the given year and settings. */
  render(year: number, s: HeatSettings): { rgba: Uint8ClampedArray; width: number; height: number; measure: Measure; H: Float32Array } {
    const measure = measureFor(s);
    const src = measure === 'deaths' ? this.sources.deaths : this.sources.events;
    computeHeat(this.grid, src, year, { mode: s.mode, halfLifeYears: s.halfLifeYears, windowYears: s.windowYears }, this.H);
    colourise(this.H, this.scales[measure], this.rgba, s.highContrast ? PALETTE_HC : PALETTE, s.highContrast ? 0.9 : 0.82);
    return { rgba: this.rgba, width: this.grid.cols, height: this.grid.rows, measure, H: this.H };
  }

  /** Number of sources active at `year` (used to skip redundant redraws in step modes). */
  activeSignature(year: number, s: HeatSettings): string {
    const measure = measureFor(s);
    const src = measure === 'deaths' ? this.sources.deaths : this.sources.events;
    let n = 0;
    let ramping = 0;
    for (const x of src) {
      if (x.start <= year) {
        n++;
        if (x.end > year) ramping++;
      }
    }
    if (s.mode === 'fading') return `f${Math.round(year * 4)}`; // decays continuously
    if (s.mode === 'recent') {
      let w = 0;
      for (const x of src) if (x.start <= year && year - x.start <= s.windowYears) w++;
      return `r${n}-${w}-${ramping ? Math.round(year * 8) : 0}`;
    }
    return `c${n}-${ramping ? Math.round(year * 8) : 0}`;
  }

  get bounds(): [[number, number], [number, number], [number, number], [number, number]] {
    const g = this.grid;
    return [
      [g.west, g.north],
      [g.east, g.north],
      [g.east, g.south],
      [g.west, g.south],
    ];
  }
}
