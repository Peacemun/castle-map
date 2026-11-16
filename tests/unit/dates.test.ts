import { describe, expect, it } from 'vitest';
import { endYear, expandDate, formatHistoricalDate, partialToDecimal, startYear } from '../../src/historical-data/dates';

describe('dates', () => {
  it('converts partial dates to decimal years', () => {
    expect(partialToDecimal('1066')).toBe(1066);
    expect(partialToDecimal('1066-10-14')).toBeCloseTo(1066 + 286 / 365, 6);
    expect(partialToDecimal('1066', 'end')).toBeCloseTo(1067, 4);
  });
  it('expands curated shorthand', () => {
    expect(expandDate('c.1070')).toMatchObject({ from: '1070', precision: 'year', approximate: true });
    expect(expandDate('1283/1289')).toMatchObject({ from: '1283', to: '1289', precision: 'range' });
    expect(expandDate('13C')).toMatchObject({ from: '1201', to: '1300', precision: 'century' });
    expect(expandDate('c.1270s')).toMatchObject({ from: '1270', to: '1279', precision: 'decade' });
    expect(() => expandDate('1289/1283')).toThrow();
    expect(() => expandDate('next tuesday')).toThrow();
  });
  it('computes ranges and labels', () => {
    const d = expandDate('1314-06-23/1314-06-24');
    expect(endYear(d)).toBeGreaterThan(startYear(d));
    expect(formatHistoricalDate(expandDate('1066-10-14'))).toBe('14 Oct 1066');
    expect(formatHistoricalDate(expandDate('c.1068/1070'))).toBe('c. 1068 – 1070');
    expect(formatHistoricalDate(expandDate('13C'))).toBe('13th century');
  });
});
