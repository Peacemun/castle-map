import { describe, expect, it } from 'vitest';
import { nameSimilarity, normaliseName, yearInName } from '../../scripts/build-data/lib/names';
import { wikidataDate, castleClassFromTypes, conditionFromLabel } from '../../scripts/build-data/lib/wikidata';

describe('import helpers', () => {
  it('normalises names for matching', () => {
    expect(normaliseName('Battle of Towton 1461')).toBe('towton');
    expect(normaliseName('Siege of Stirling Castle (1304)')).toBe('stirling');
    expect(nameSimilarity('Battle of Bosworth (Field) 1485', 'Battle of Bosworth')).toBe(1);
    expect(nameSimilarity('Conwy Castle', 'Harlech Castle')).toBe(0);
    expect(yearInName('Battle of Lewes 1264')).toBe(1264);
  });
  it('converts Wikidata dates by precision without inventing precision', () => {
    expect(wikidataDate('1283-01-01T00:00:00Z', '9')).toMatchObject({ from: '1283', precision: 'year' });
    expect(wikidataDate('1270-01-01T00:00:00Z', '8')).toMatchObject({ from: '1270', to: '1279', precision: 'decade' });
    expect(wikidataDate('1200-01-01T00:00:00Z', '7')).toMatchObject({ from: '1101', to: '1200', precision: 'century' });
    expect(wikidataDate('1250-01-01T00:00:00Z', '7')).toMatchObject({ from: '1201', to: '1300' });
    expect(wikidataDate('-0050-01-01T00:00:00Z', '9')).toBeNull();
    expect(wikidataDate('1000-01-01T00:00:00Z', '6')).toBeNull();
  });
  it('classifies castle types conservatively', () => {
    expect(castleClassFromTypes(['castle', 'motte-and-bailey castle']).cls).toBe('motte-and-bailey');
    expect(castleClassFromTypes(['castle'])).toEqual({ cls: 'castle-unspecified', specific: false });
    expect(conditionFromLabel('ruins', false)).toBe('ruin');
    expect(conditionFromLabel(undefined, false)).toBe('unknown');
  });
});
