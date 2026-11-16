/** Visibility rules shared by the map, statistics and lists so they always agree. */
import type { CastleView, EventView } from '../historical-data/dataset';
import type { Filters, Layers } from './store';

export function centuryOf(year: number): number {
  return Math.max(11, Math.floor((Math.floor(year) - 1) / 100) + 1);
}

export function castleCategory(c: CastleView): 'intact' | 'ruin' | 'lost' {
  if (c.condition === 'intact' || c.condition === 'altered-in-use') return 'intact';
  if (c.condition === 'ruin') return 'ruin';
  if (c.condition === 'earthwork' || c.condition === 'lost') return 'lost';
  return c.endOfUse ? 'lost' : 'ruin';
}

/** Does the castle pass the layer and filter settings (ignoring time)? */
export function castlePasses(c: CastleView, layers: Layers, f: Filters): boolean {
  if (!layers.castles) return false;
  if (!f.imported && c.provenance !== 'curated') return false;
  if (c.country !== 'Cross-border' && c.country !== 'Unknown' && !f.countries.includes(c.country)) return false;
  if (c.t0 === null) return layers.undated;
  const cat = castleCategory(c);
  if (cat === 'intact' && !layers.surviving) return false;
  if (cat !== 'intact' && !layers.ruinedLost) return false;
  return true;
}

export function eventLayerOf(e: EventView): 'battles' | 'sieges' | 'otherEvents' {
  if (e.type === 'battle' || e.type === 'skirmish') return 'battles';
  if (e.type === 'siege') return 'sieges';
  return 'otherEvents';
}

/** Does the event pass the layer and filter settings (ignoring time)? */
export function eventPasses(e: EventView, layers: Layers, f: Filters): boolean {
  if (!layers[eventLayerOf(e)]) return false;
  if (!f.imported && e.provenance !== 'curated') return false;
  if (!f.eventTypes.includes(e.type)) return false;
  if (e.country !== 'Cross-border' && e.country !== 'Unknown' && !f.countries.includes(e.country)) return false;
  const c = centuryOf(e.t0);
  return c >= f.centuries[0] && c <= f.centuries[1];
}

/** Filter used for the heatmap: same as events, but independent of the map layer toggles. */
export function heatEventPasses(e: EventView, f: Filters): boolean {
  if (!f.imported && e.provenance !== 'curated') return false;
  if (!f.eventTypes.includes(e.type)) return false;
  if (e.country !== 'Cross-border' && e.country !== 'Unknown' && !f.countries.includes(e.country)) return false;
  const c = centuryOf(e.t0);
  return c >= f.centuries[0] && c <= f.centuries[1];
}

export function filterKey(f: Filters): string {
  return `${f.countries.join()}|${f.eventTypes.join()}|${f.centuries.join('-')}|${f.imported}`;
}
