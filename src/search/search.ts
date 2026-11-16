/**
 * Client-side search over castles, events, regions and years.
 * A small prefix/substring index is built once; no external service is used.
 */
import type { Dataset } from '../historical-data/dataset';

export interface SearchResult {
  kind: 'castle' | 'event' | 'region' | 'year';
  id: string;
  label: string;
  sub: string;
  score: number;
  year?: number;
  coord?: [number, number];
}

interface Entry {
  kind: SearchResult['kind'];
  id: string;
  label: string;
  sub: string;
  keys: string[];
  /** Secondary keys (e.g. place names) that only count as weaker matches. */
  weakKeys?: string[];
  boost: number;
  year?: number;
  coord?: [number, number];
}

export const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export class SearchIndex {
  private entries: Entry[] = [];

  constructor(d: Dataset) {
    for (const c of d.castles) {
      this.entries.push({
        kind: 'castle',
        id: c.id,
        label: c.name,
        sub: `Castle · ${c.region ?? c.country}${c.t0 ? ` · from ${Math.floor(c.t0)}` : ' · undated'}`,
        keys: [c.name, ...c.altNames].map(fold),
        boost: c.provenance === 'curated' ? 2 : 0,
        year: c.t0 ?? undefined,
        coord: c.coord,
      });
    }
    for (const e of d.events) {
      this.entries.push({
        kind: 'event',
        id: e.id,
        label: e.name,
        sub: `${e.type.replace('-', ' ')} · ${Math.floor(e.t0)}${e.region ? ` · ${e.region}` : ''}`,
        keys: [e.name, ...e.altNames].map(fold),
        weakKeys: e.location.placeName ? [fold(e.location.placeName)] : [],
        boost: e.provenance === 'curated' ? 2.5 : 0.5,
        year: e.t0,
        coord: e.location.point ?? undefined,
      });
    }
    const regions = new Map<string, { coords: [number, number][] }>();
    for (const c of d.castles) if (c.region && c.provenance === 'curated') {
      if (!regions.has(c.region)) regions.set(c.region, { coords: [] });
      regions.get(c.region)!.coords.push(c.coord);
    }
    for (const e of d.events) if (e.region && e.location.point && e.provenance === 'curated') {
      if (!regions.has(e.region)) regions.set(e.region, { coords: [] });
      regions.get(e.region)!.coords.push(e.location.point);
    }
    for (const [name, r] of regions) {
      const lon = r.coords.reduce((s, c) => s + c[0], 0) / r.coords.length;
      const lat = r.coords.reduce((s, c) => s + c[1], 0) / r.coords.length;
      this.entries.push({ kind: 'region', id: `region:${name}`, label: name, sub: `Region · ${r.coords.length} records`, keys: [fold(name)], boost: 1, coord: [lon, lat] });
    }
  }

  search(q: string, limit = 12): SearchResult[] {
    const query = fold(q);
    if (!query) return [];
    const out: SearchResult[] = [];
    const yearMatch = /^(?:ad\s*)?(\d{4})$/.exec(query);
    if (yearMatch) {
      const y = Number(yearMatch[1]);
      if (y >= 1000 && y <= 2000) out.push({ kind: 'year', id: `year:${y}`, label: `Go to AD ${y}`, sub: 'Year', score: 100, year: y });
    }
    const words = query.split(' ');
    for (const e of this.entries) {
      let best = 0;
      for (const k of e.keys) {
        let s = 0;
        if (k === query) s = 10;
        else if (k.startsWith(query)) s = 7;
        else if (words.every((w) => k.includes(w))) s = k.split(' ').some((t) => t.startsWith(words[0])) ? 5 : 3;
        if (s > best) best = s;
      }
      for (const k of e.weakKeys ?? []) if (best < 2 && words.every((w) => k.includes(w))) best = 2;
      if (best > 0) out.push({ kind: e.kind, id: e.id, label: e.label, sub: e.sub, score: best + e.boost, year: e.year, coord: e.coord });
    }
    out.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
    return out.slice(0, limit);
  }
}
