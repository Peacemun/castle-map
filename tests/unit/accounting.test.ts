import { describe, expect, it } from 'vitest';
import { accountDeaths, selectEstimate, totalDeaths } from '../../src/heatmap/accounting';
import { CasualtyEstimate } from '../../src/historical-data/schemas';

const acc = (o: Record<string, unknown>) => CasualtyEstimate.parse({ scope: 'event', category: 'military', method: 'modern-estimate', confidence: 'low', sources: [{ sourceId: 'src-x' }], ...o });

describe('selectEstimate', () => {
  it('never turns unknown into zero', () => {
    expect(selectEstimate(acc({ id: 'cas-a', eventId: 'e' }), 'low')).toBeNull();
    expect(selectEstimate(acc({ id: 'cas-a', eventId: 'e' }), 'central')).toBeNull();
  });
  it('chooses bounds as documented', () => {
    const a = acc({ id: 'cas-a', eventId: 'e', killedMin: 100, killedMax: 300 });
    expect(selectEstimate(a, 'low')).toBe(100);
    expect(selectEstimate(a, 'central')).toBe(200);
    expect(selectEstimate(a, 'high')).toBe(300);
    const b = acc({ id: 'cas-b', eventId: 'e', killedMax: 28000 });
    expect(selectEstimate(b, 'low')).toBe(28000);
  });
});

describe('accountDeaths', () => {
  it('excludes unknown accounts and reports known events', () => {
    const r = accountDeaths([acc({ id: 'cas-a', eventId: 'e1' }), acc({ id: 'cas-b', eventId: 'e2', killedCentral: 10 })], 'central');
    expect(r.contributions).toHaveLength(1);
    expect(r.knownEventIds.has('e1')).toBe(false);
    expect(r.knownEventIds.has('e2')).toBe(true);
  });

  it('does not double count an aggregate and its children', () => {
    const accounts = [
      acc({ id: 'cas-war', eventId: 'war', scope: 'aggregate', includesAccountIds: ['cas-b1', 'cas-b2'], killedCentral: 1000 }),
      acc({ id: 'cas-b1', eventId: 'b1', killedCentral: 300 }),
      acc({ id: 'cas-b2', eventId: 'b2', killedCentral: 200 }),
    ];
    const r = accountDeaths(accounts, 'central');
    expect(totalDeaths(r.contributions)).toBe(1000);
    expect(r.contributions.find((c) => c.accountId === 'cas-war')?.deaths).toBe(500);
    expect(r.contributions.find((c) => c.accountId === 'cas-war')?.kind).toBe('residual');
  });

  it('floors inconsistent residuals at zero and flags them', () => {
    const accounts = [
      acc({ id: 'cas-war', eventId: 'war', scope: 'aggregate', includesAccountIds: ['cas-b1'], killedCentral: 100 }),
      acc({ id: 'cas-b1', eventId: 'b1', killedCentral: 300 }),
    ];
    const r = accountDeaths(accounts, 'central');
    expect(totalDeaths(r.contributions)).toBe(300);
    expect(r.inconsistentAggregates).toEqual(['cas-war']);
  });

  it('ignores non-preferred alternative accounts', () => {
    const accounts = [acc({ id: 'cas-a', eventId: 'e', killedCentral: 100 }), acc({ id: 'cas-b', eventId: 'e', killedCentral: 900, alternativeOf: 'cas-a', preferred: false })];
    expect(totalDeaths(accountDeaths(accounts, 'central').contributions)).toBe(100);
  });

  it('sums per-side accounts of one event', () => {
    const accounts = [acc({ id: 'cas-a', eventId: 'e', killedCentral: 1000, side: 'A' }), acc({ id: 'cas-b', eventId: 'e', killedCentral: 100, side: 'B' })];
    expect(totalDeaths(accountDeaths(accounts, 'central').contributions)).toBe(1100);
  });
});
