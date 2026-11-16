/**
 * Shareable URLs. Everything is encoded in query parameters so that the site works
 * on static hosting (no server routing):
 *   ?y=1461.2&sel=e:evt-towton-1461&c=-1.27,53.83&z=9&l=11101111111111&hm=cumulative
 */
import { DEFAULT_LAYERS, type Layers, type Selection } from './store';
import type { HeatSettings } from '../heatmap/engine';

const LAYER_ORDER = Object.keys(DEFAULT_LAYERS) as (keyof Layers)[];

export interface UrlState {
  year?: number;
  selection?: Selection;
  center?: [number, number];
  zoom?: number;
  layers?: Layers;
  heatMode?: HeatSettings['mode'];
  memoryMeasure?: HeatSettings['memoryMeasure'];
  estimate?: HeatSettings['estimate'];
  influenceKm?: number;
  halfLifeYears?: number;
  windowYears?: number;
  pacing?: 'chronological' | 'cinematic';
  durationMin?: 2 | 3 | 5 | 10;
  frontiers?: boolean;
}

const num = (v: string | null, min: number, max: number): number | undefined => {
  if (v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
};

export function parseUrl(search: string): UrlState {
  const p = new URLSearchParams(search);
  const out: UrlState = {};
  out.year = num(p.get('y'), 1000, 2000);
  const sel = p.get('sel');
  if (sel) {
    const m = /^([cet]):([a-z0-9-]+)$/.exec(sel);
    if (m) out.selection = { kind: m[1] === 'c' ? 'castle' : m[1] === 'e' ? 'event' : 'territory', id: m[2] };
  }
  const c = p.get('c');
  if (c) {
    const [lon, lat] = c.split(',').map(Number);
    if (Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lon) <= 180 && Math.abs(lat) <= 90) out.center = [lon, lat];
  }
  out.zoom = num(p.get('z'), 0, 22);
  const l = p.get('l');
  if (l && /^[01]+$/.test(l)) {
    const layers = { ...DEFAULT_LAYERS };
    LAYER_ORDER.forEach((k, i) => {
      if (i < l.length) layers[k] = l[i] === '1';
    });
    out.layers = layers;
  }
  const hm = p.get('hm');
  if (hm === 'cumulative' || hm === 'frequency' || hm === 'fading' || hm === 'recent') out.heatMode = hm;
  const ms = p.get('ms');
  if (ms === 'deaths' || ms === 'events') out.memoryMeasure = ms;
  const est = p.get('est');
  if (est === 'low' || est === 'central' || est === 'high') out.estimate = est;
  out.influenceKm = num(p.get('inf'), 2, 60);
  out.halfLifeYears = num(p.get('hl'), 10, 1000);
  out.windowYears = num(p.get('win'), 5, 500);
  const pace = p.get('pace');
  if (pace === 'chronological' || pace === 'cinematic') out.pacing = pace;
  const dur = num(p.get('dur'), 2, 10);
  if (dur === 2 || dur === 3 || dur === 5 || dur === 10) out.durationMin = dur;
  if (p.get('fr') === '1') out.frontiers = true;
  for (const k of Object.keys(out) as (keyof UrlState)[]) if (out[k] === undefined) delete out[k];
  return out;
}

export function serialiseUrl(s: UrlState): string {
  const p = new URLSearchParams();
  if (s.year !== undefined) p.set('y', s.year.toFixed(1).replace(/\.0$/, ''));
  if (s.selection) p.set('sel', `${s.selection.kind[0]}:${s.selection.id}`);
  if (s.center) p.set('c', `${s.center[0].toFixed(3)},${s.center[1].toFixed(3)}`);
  if (s.zoom !== undefined) p.set('z', s.zoom.toFixed(2).replace(/\.?0+$/, ''));
  if (s.layers) p.set('l', LAYER_ORDER.map((k) => (s.layers![k] ? '1' : '0')).join(''));
  if (s.heatMode) p.set('hm', s.heatMode);
  if (s.memoryMeasure) p.set('ms', s.memoryMeasure);
  if (s.estimate) p.set('est', s.estimate);
  if (s.influenceKm !== undefined) p.set('inf', String(s.influenceKm));
  if (s.halfLifeYears !== undefined) p.set('hl', String(s.halfLifeYears));
  if (s.windowYears !== undefined) p.set('win', String(s.windowYears));
  if (s.pacing) p.set('pace', s.pacing);
  if (s.durationMin) p.set('dur', String(s.durationMin));
  if (s.frontiers) p.set('fr', '1');
  const q = p.toString();
  return q ? `?${q.replace(/%2C/g, ',').replace(/%3A/g, ':')}` : '';
}
