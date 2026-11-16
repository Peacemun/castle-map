/**
 * Deterministic historical clock.
 *
 * Playback progress is a normalised value u ∈ [0, 1] derived from elapsed wall-clock
 * time (never from frame counts): u = u0 + (now − t0) / duration.
 * A TimeMapping converts u into a historical year. The linear mapping is the
 * chronological mode; the cinematic mapping is a data-driven, monotone, non-linear
 * mapping that gives more screen time to years with significant recorded events.
 * Both map u = 0 → AD 1000 and u = 1 → AD 2000 exactly, so playback always fits the
 * selected duration and stops precisely at AD 2000.
 */

export const YEAR_MIN = 1000;
export const YEAR_MAX = 2000;
export const SPAN = YEAR_MAX - YEAR_MIN;

export const clampYear = (y: number) => Math.min(YEAR_MAX, Math.max(YEAR_MIN, y));
const clamp01 = (u: number) => Math.min(1, Math.max(0, u));

export interface TimeMapping {
  readonly kind: 'chronological' | 'cinematic';
  yearAt(u: number): number;
  uAt(year: number): number;
}

export const linearMapping: TimeMapping = {
  kind: 'chronological',
  yearAt: (u) => YEAR_MIN + clamp01(u) * SPAN,
  uAt: (y) => (clampYear(y) - YEAR_MIN) / SPAN,
};

export interface SignificancePoint {
  year: number;
  weight: number;
}

export interface CinematicOptions {
  /** Share of total screen time spread uniformly across all years (keeps quiet centuries visible). */
  baseShare?: number;
  /** Gaussian smoothing of event weight in years. */
  sigmaYears?: number;
  /** Number of one-year-or-finer bins. */
  bins?: number;
}

/**
 * Build a cinematic mapping from event significance.
 * density(y) = baseShare/span + (1 − baseShare) · normalised Σ weight·G(y − year_i).
 * The cumulative density is the fraction of screen time elapsed at year y; it is
 * strictly increasing because baseShare > 0, so its inverse is well defined.
 */
export function buildCinematicMapping(points: SignificancePoint[], opts: CinematicOptions = {}): TimeMapping {
  const baseShare = opts.baseShare ?? 0.4;
  const sigma = opts.sigmaYears ?? 4;
  const bins = opts.bins ?? 2000;
  const binYears = SPAN / bins;
  const density = new Float64Array(bins);
  let eventMass = 0;
  for (const p of points) {
    if (!(p.weight > 0) || p.year < YEAR_MIN || p.year > YEAR_MAX) continue;
    const lo = Math.max(0, Math.floor((p.year - 4 * sigma - YEAR_MIN) / binYears));
    const hi = Math.min(bins - 1, Math.ceil((p.year + 4 * sigma - YEAR_MIN) / binYears));
    for (let i = lo; i <= hi; i++) {
      const centre = YEAR_MIN + (i + 0.5) * binYears;
      const g = Math.exp(-((centre - p.year) ** 2) / (2 * sigma * sigma));
      density[i] += p.weight * g;
      eventMass += p.weight * g;
    }
  }
  const effectiveBase = eventMass > 0 ? baseShare : 1;
  const cdf = new Float64Array(bins + 1);
  for (let i = 0; i < bins; i++) {
    const d = effectiveBase / bins + (eventMass > 0 ? ((1 - effectiveBase) * density[i]) / eventMass : 0);
    cdf[i + 1] = cdf[i] + d;
  }
  const total = cdf[bins];
  for (let i = 0; i <= bins; i++) cdf[i] /= total;
  cdf[bins] = 1;

  const uAt = (year: number) => {
    const x = ((clampYear(year) - YEAR_MIN) / SPAN) * bins;
    const i = Math.min(bins - 1, Math.floor(x));
    return cdf[i] + (cdf[i + 1] - cdf[i]) * (x - i);
  };
  const yearAt = (u: number) => {
    const v = clamp01(u);
    if (v <= 0) return YEAR_MIN;
    if (v >= 1) return YEAR_MAX;
    let lo = 0;
    let hi = bins;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid] <= v) lo = mid;
      else hi = mid;
    }
    const span = cdf[hi] - cdf[lo];
    const frac = span > 0 ? (v - cdf[lo]) / span : 0;
    return YEAR_MIN + ((lo + frac) / bins) * SPAN;
  };
  return { kind: 'cinematic', yearAt, uAt };
}

export type Now = () => number;
export type Raf = (cb: (t: number) => void) => number;
export type CancelRaf = (id: number) => void;

export interface ClockState {
  year: number;
  playing: boolean;
}

/**
 * Wall-clock playback controller. Emits the current year on every animation frame
 * while playing, and once after every explicit change (seek, restart, pause).
 */
export class PlaybackController {
  private mapping: TimeMapping = linearMapping;
  private durationMs = 180_000;
  private anchorU = 0;
  private anchorTime = 0;
  private playing = false;
  private rafId: number | null = null;
  private year = YEAR_MIN;

  constructor(
    private readonly onChange: (s: ClockState) => void,
    private readonly now: Now = () => performance.now(),
    private readonly raf: Raf = (cb) => requestAnimationFrame(cb),
    private readonly cancelRaf: CancelRaf = (id) => cancelAnimationFrame(id),
  ) {}

  get state(): ClockState {
    return { year: this.year, playing: this.playing };
  }

  get duration() {
    return this.durationMs;
  }

  private currentU(): number {
    if (!this.playing) return this.mapping.uAt(this.year);
    return Math.min(1, this.anchorU + (this.now() - this.anchorTime) / this.durationMs);
  }

  private emit() {
    this.onChange({ year: this.year, playing: this.playing });
  }

  private reanchor() {
    this.anchorU = this.mapping.uAt(this.year);
    this.anchorTime = this.now();
  }

  play() {
    if (this.playing) return;
    if (this.year >= YEAR_MAX) this.year = YEAR_MIN; // pressing play at the end starts again
    this.playing = true;
    this.reanchor();
    this.emit();
    this.schedule();
  }

  pause() {
    if (!this.playing) return;
    this.year = this.mapping.yearAt(this.currentU());
    this.playing = false;
    if (this.rafId !== null) this.cancelRaf(this.rafId);
    this.rafId = null;
    this.emit();
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  /** Jump to a year. Playback continues from there if it was playing. */
  seek(year: number) {
    this.year = clampYear(year);
    if (this.playing) this.reanchor();
    this.emit();
  }

  restart() {
    this.seek(YEAR_MIN);
  }

  step(deltaYears: number) {
    this.seek(this.year + deltaYears);
  }

  setDuration(ms: number) {
    if (this.playing) this.year = this.mapping.yearAt(this.currentU());
    this.durationMs = ms;
    if (this.playing) this.reanchor();
  }

  /** Switch chronological/cinematic pacing without moving the current year. */
  setMapping(m: TimeMapping) {
    if (this.playing) this.year = this.mapping.yearAt(this.currentU());
    this.mapping = m;
    if (this.playing) this.reanchor();
  }

  /** Advance one frame. Exposed for tests; normally driven by requestAnimationFrame. */
  tick() {
    if (!this.playing) return;
    const u = this.currentU();
    if (u >= 1) {
      this.year = YEAR_MAX;
      this.playing = false;
      this.rafId = null;
      this.emit();
      return;
    }
    this.year = this.mapping.yearAt(u);
    this.emit();
    this.schedule();
  }

  private schedule() {
    this.rafId = this.raf(() => this.tick());
  }

  dispose() {
    if (this.rafId !== null) this.cancelRaf(this.rafId);
    this.rafId = null;
    this.playing = false;
  }
}
