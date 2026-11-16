/**
 * Statistics about the dataset up to a given year. Every figure describes
 * "recorded events in this dataset", never all events or deaths in British history.
 * Death totals use the same de-duplicated accounting as the heatmap and are given
 * as a low–high range.
 */
import { accountDeaths } from '../heatmap/accounting';
import { CONFLICT_TYPES } from '../heatmap/model';
import type { Dataset, EventView } from './dataset';

export interface Bucket {
  label: string;
  events: number;
  knownCasualtyEvents: number;
  deathsLow: number;
  deathsHigh: number;
}

export interface Stats {
  year: number;
  castlesDatedVisible: number;
  castlesTotal: number;
  castlesUndated: number;
  battles: number;
  sieges: number;
  events: number;
  conflictEvents: number;
  knownCasualtyEvents: number;
  unknownCasualtyEvents: number;
  deathsLow: number;
  deathsHigh: number;
  curatedEvents: number;
  importedEvents: number;
  byCountry: Bucket[];
  byEra: Bucket[];
}

export function computeStats(d: Dataset, year: number, eventFilter: (e: EventView) => boolean, eras: { label: string; from: number; to: number }[]): Stats {
  const evs = d.events.filter((e) => e.t0 <= year && eventFilter(e));
  const ids = new Set(evs.map((e) => e.id));
  const low = accountDeaths(d.casualties, 'low');
  const high = accountDeaths(d.casualties, 'high');
  const sumFor = (r: typeof low, pred: (e: EventView) => boolean) =>
    r.contributions.reduce((s, c) => {
      const e = d.eventById.get(c.eventId);
      return e && ids.has(e.id) && pred(e) ? s + c.deaths : s;
    }, 0);
  const conflict = evs.filter((e) => CONFLICT_TYPES.has(e.type) && e.childIds.length === 0);
  const known = conflict.filter((e) => low.knownEventIds.has(e.id));
  const bucket = (label: string, pred: (e: EventView) => boolean): Bucket => ({
    label,
    events: conflict.filter(pred).length,
    knownCasualtyEvents: known.filter(pred).length,
    deathsLow: Math.round(sumFor(low, pred)),
    deathsHigh: Math.round(sumFor(high, pred)),
  });
  return {
    year,
    castlesDatedVisible: d.castles.filter((c) => c.t0 !== null && c.t0 <= year).length,
    castlesTotal: d.castles.length,
    castlesUndated: d.castles.filter((c) => c.t0 === null).length,
    battles: evs.filter((e) => e.type === 'battle' || e.type === 'skirmish').length,
    sieges: evs.filter((e) => e.type === 'siege').length,
    events: evs.length,
    conflictEvents: conflict.length,
    knownCasualtyEvents: known.length,
    unknownCasualtyEvents: conflict.length - known.length,
    deathsLow: Math.round(sumFor(low, () => true)),
    deathsHigh: Math.round(sumFor(high, () => true)),
    curatedEvents: evs.filter((e) => e.provenance === 'curated').length,
    importedEvents: evs.filter((e) => e.provenance !== 'curated').length,
    byCountry: (['England', 'Scotland', 'Wales', 'Cross-border'] as const).map((c) => bucket(c, (e) => e.country === c)),
    byEra: eras.filter((er) => er.from <= year).map((er) => bucket(`${er.label} (${er.from}–${er.to})`, (e) => e.t0 >= er.from && e.t0 < er.to + 1)),
  };
}
