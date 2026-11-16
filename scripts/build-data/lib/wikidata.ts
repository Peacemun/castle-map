/** Conversion of Wikidata SPARQL results into Castle Map draft records. */
import type { HistoricalDate } from '../../../src/historical-data/schemas';

export type Binding = Record<string, { value: string } | undefined>;

export function qid(uri: string): string {
  return uri.slice(uri.lastIndexOf('/') + 1);
}

export function parseWktPoint(wkt: string): [number, number] | null {
  const m = /Point\(([-\d.eE]+)\s+([-\d.eE]+)\)/.exec(wkt);
  if (!m) return null;
  return [Number(m[1]), Number(m[2])];
}

/**
 * Convert a Wikidata time value + precision into a HistoricalDate.
 * Precision: 11 day, 10 month, 9 year, 8 decade, 7 century. Coarser values are ignored.
 */
export function wikidataDate(value: string | undefined, precision: string | undefined, endValue?: string, endPrecision?: string): HistoricalDate | null {
  if (!value) return null;
  const m = /^([+-]?)(\d{1,4})-(\d{2})-(\d{2})/.exec(value);
  if (!m || m[1] === '-') return null;
  const year = Number(m[2]);
  const p = Number(precision ?? 9);
  const y4 = (n: number) => String(n);
  let date: HistoricalDate;
  if (p >= 11) date = { from: `${y4(year)}-${m[3]}-${m[4]}`, precision: 'day', approximate: false, disputed: false };
  else if (p === 10) date = { from: `${y4(year)}-${m[3]}`, precision: 'month', approximate: false, disputed: false };
  else if (p === 9) date = { from: y4(year), precision: 'year', approximate: false, disputed: false };
  else if (p === 8) {
    const d = Math.floor(year / 10) * 10;
    date = { from: y4(d), to: y4(d + 9), precision: 'decade', approximate: true, disputed: false };
  } else if (p === 7) {
    const c = year % 100 === 0 ? year / 100 : Math.ceil(year / 100);
    date = { from: y4((c - 1) * 100 + 1), to: y4(c * 100), precision: 'century', approximate: true, disputed: false };
  } else return null;
  if (date.from.length < 3) return null;
  if (endValue) {
    const end = wikidataDate(endValue, endPrecision);
    if (end) {
      const endPartial = end.to ?? end.from;
      if (endPartial > date.from) {
        date = { ...date, to: endPartial, precision: 'range' };
      }
    }
  }
  return date;
}

const CASTLE_TYPE: Record<string, string> = {
  'motte-and-bailey castle': 'motte-and-bailey',
  'tower house': 'tower-house',
  'ringwork castle': 'ringwork',
  'fortified manor house': 'fortified-manor',
  'peel tower': 'peel-tower',
  'concentric castle': 'concentric',
  'quadrangular castle': 'quadrangular',
  "welsh princes' castles": 'welsh-native',
  'enclosure castle': 'enclosure',
  'l-plan castle': 'tower-house',
  'z-plan castle': 'tower-house',
};

export function castleClassFromTypes(typeLabels: string[]): { cls: string; specific: boolean } {
  for (const t of typeLabels) {
    const c = CASTLE_TYPE[t.toLowerCase()];
    if (c) return { cls: c, specific: true };
  }
  return { cls: 'castle-unspecified', specific: false };
}

export function conditionFromLabel(label: string | undefined, demolished: boolean): 'ruin' | 'lost' | 'intact' | 'unknown' {
  const l = (label ?? '').toLowerCase();
  if (l.includes('ruin')) return 'ruin';
  if (l.includes('destroy') || l.includes('demolish') || l.includes('lost')) return 'lost';
  if (l.includes('preserved') || l.includes('intact') || l.includes('good') || l.includes('complete')) return 'intact';
  return demolished ? 'lost' : 'unknown';
}

export const CONFLICT_CLASS: Record<string, string> = {
  Q178561: 'battle',
  Q1261499: 'battle', // naval battle
  Q188055: 'siege',
  Q3199915: 'massacre',
  Q2001676: 'raid',
  Q124734: 'rebellion',
  Q831663: 'campaign',
};
