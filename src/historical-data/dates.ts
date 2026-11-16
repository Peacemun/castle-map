/**
 * Historical date helpers.
 *
 * Dates are stored as partial ISO strings ("1066", "1066-10", "1066-10-14") inside a
 * HistoricalDate object. The timeline works in *decimal years* (e.g. 1066.784 for
 * 14 October 1066) so that playback can move smoothly within a year.
 *
 * Shorthand used in curated source files (expanded by the build):
 *   "1066-10-14"        exact day
 *   "1066-10" / "1066"  month / year precision
 *   "c.1070"            approximate year
 *   "1283/1289"         range (any partial dates on either side)
 *   "c.1068/1070"       approximate range
 *   "c.1270s"           approximate decade (1270–1279)
 *   "13C"               century (1201–1300), approximate
 */
import type { HistoricalDate } from './schemas';

const PARTIAL = /^(\d{3,4})(?:-(\d{2})(?:-(\d{2}))?)?$/;

const MONTH_START_DAY = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365];

function isLeap(y: number) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export interface ParsedPartial {
  year: number;
  month: number | null;
  day: number | null;
}

export function parsePartial(s: string): ParsedPartial {
  const m = PARTIAL.exec(s);
  if (!m) throw new Error(`Invalid partial date "${s}"`);
  const year = Number(m[1]);
  const month = m[2] ? Number(m[2]) : null;
  const day = m[3] ? Number(m[3]) : null;
  if (month !== null && (month < 1 || month > 12)) throw new Error(`Invalid month in "${s}"`);
  if (day !== null && (day < 1 || day > 31)) throw new Error(`Invalid day in "${s}"`);
  return { year, month, day };
}

/**
 * Convert a partial date to a decimal year.
 * edge = "start": first instant of the period; "end": last instant of the period.
 * (Julian/Gregorian calendar differences are ignored; dates are as given by sources.)
 */
export function partialToDecimal(s: string, edge: 'start' | 'end' = 'start'): number {
  const { year, month, day } = parsePartial(s);
  const daysInYear = isLeap(year) ? 366 : 365;
  const leapAdj = (mo: number) => (isLeap(year) && mo > 2 ? 1 : 0);
  if (month === null) return edge === 'start' ? year : year + 1 - 1e-6;
  if (day === null) {
    if (edge === 'start') return year + (MONTH_START_DAY[month - 1] + leapAdj(month)) / daysInYear;
    return year + (MONTH_START_DAY[month] + leapAdj(month + 1)) / daysInYear - 1e-6;
  }
  const doy = MONTH_START_DAY[month - 1] + leapAdj(month) + (day - 1);
  return year + (doy + (edge === 'start' ? 0 : 1)) / daysInYear - (edge === 'end' ? 1e-6 : 0);
}

/** Earliest decimal year covered by a historical date. */
export function startYear(d: Pick<HistoricalDate, 'from'>): number {
  return partialToDecimal(d.from, 'start');
}

/** Latest decimal year covered by a historical date (end of `to`, or end of `from`). */
export function endYear(d: Pick<HistoricalDate, 'from' | 'to'>): number {
  return partialToDecimal(d.to ?? d.from, 'end');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatPartial(s: string): string {
  const { year, month, day } = parsePartial(s);
  if (month === null) return String(year);
  if (day === null) return `${MONTHS[month - 1]} ${year}`;
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

/** Human-readable label, e.g. "c. 1070", "1283–1289", "14 Oct 1066", "13th century". */
export function formatHistoricalDate(d: HistoricalDate): string {
  if (d.display) return d.display;
  const c = d.approximate ? 'c. ' : '';
  if (d.precision === 'century') {
    // Centuries are stored as e.g. 1201–1300 for the 13th century.
    return `${ordinal(Math.ceil(parsePartial(d.from).year / 100))} century`;
  }
  if (d.precision === 'decade') return `${c}${parsePartial(d.from).year}s`;
  const from = formatPartial(d.from);
  if (!d.to || d.to === d.from) return `${c}${from}${d.disputed ? ' (disputed)' : ''}`;
  return `${c}${from} – ${formatPartial(d.to)}${d.disputed ? ' (disputed)' : ''}`;
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Expand curated shorthand (string) or pass through a full object. */
export function expandDate(input: string | Partial<HistoricalDate> & { from: string }): HistoricalDate {
  if (typeof input !== 'string') {
    return {
      precision: input.precision ?? inferPrecision(input.from, input.to),
      approximate: input.approximate ?? false,
      disputed: input.disputed ?? false,
      ...input,
    } as HistoricalDate;
  }
  let s = input.trim();
  let approximate = false;
  if (s.startsWith('c.')) {
    approximate = true;
    s = s.slice(2).trim();
  }
  const century = /^(\d{1,2})C$/.exec(s);
  if (century) {
    const n = Number(century[1]);
    return { from: String((n - 1) * 100 + 1), to: String(n * 100), precision: 'century', approximate: true, disputed: false };
  }
  const decade = /^(\d{3})0s$/.exec(s);
  if (decade) {
    const y = Number(decade[1]) * 10;
    return { from: String(y), to: String(y + 9), precision: 'decade', approximate: true, disputed: false };
  }
  const parts = s.split('/');
  if (parts.length === 2) {
    parsePartial(parts[0]);
    parsePartial(parts[1]);
    if (partialToDecimal(parts[0]) > partialToDecimal(parts[1])) throw new Error(`Date range reversed: "${input}"`);
    return { from: parts[0], to: parts[1], precision: 'range', approximate, disputed: false };
  }
  if (parts.length !== 1) throw new Error(`Cannot parse date "${input}"`);
  parsePartial(s);
  return { from: s, precision: inferPrecision(s), approximate, disputed: false };
}

function inferPrecision(from: string, to?: string): HistoricalDate['precision'] {
  if (to && to !== from) return 'range';
  const p = parsePartial(from);
  return p.day !== null ? 'day' : p.month !== null ? 'month' : 'year';
}
