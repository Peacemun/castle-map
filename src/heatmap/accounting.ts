/**
 * Casualty accounting: turns casualty accounts into non-overlapping quantities.
 *
 * Rules (see docs/heatmap-methodology.md):
 *  1. Only preferred accounts are used; alternatives of the same deaths are ignored.
 *  2. A missing figure is unknown, never zero. Accounts whose selected estimate is
 *     null contribute nothing and their events are reported as "unknown casualties".
 *  3. Event-scope accounts are leaves. An aggregate account (campaign, war, period)
 *     contributes only its RESIDUAL: aggregate − Σ(children with known values),
 *     floored at zero. So a death can never be counted at both the child and the
 *     aggregate level.
 *  4. Several accounts for the same event (e.g. one per side) are summed; they must
 *     describe disjoint groups, which the build validates by convention.
 */
import type { CasualtyEstimate } from '../historical-data/schemas';

export type EstimateChoice = 'low' | 'central' | 'high';

/**
 * Selected display estimate for an account.
 *  low:     minimum → central → maximum (most conservative available figure)
 *  central: central → midpoint(min,max) → whichever bound exists
 *  high:    maximum → central → minimum
 */
export function selectEstimate(a: Pick<CasualtyEstimate, 'killedMin' | 'killedMax' | 'killedCentral'>, choice: EstimateChoice): number | null {
  const { killedMin: lo, killedMax: hi, killedCentral: c } = a;
  if (choice === 'low') return lo ?? c ?? hi ?? null;
  if (choice === 'high') return hi ?? c ?? lo ?? null;
  if (c !== null) return c;
  if (lo !== null && hi !== null) return (lo + hi) / 2;
  return lo ?? hi ?? null;
}

export interface DeathContribution {
  accountId: string;
  eventId: string;
  /** Deaths attributed to this contribution (already de-duplicated). */
  deaths: number;
  kind: 'leaf' | 'residual';
}

export interface AccountingResult {
  contributions: DeathContribution[];
  /** Event IDs with at least one usable (non-null) preferred account. */
  knownEventIds: Set<string>;
  /** Accounts whose children exceed the aggregate (data inconsistency flagged, residual floored at 0). */
  inconsistentAggregates: string[];
}

export function accountDeaths(accounts: CasualtyEstimate[], choice: EstimateChoice): AccountingResult {
  const preferred = accounts.filter((a) => a.preferred !== false && !a.alternativeOf);
  const byId = new Map(preferred.map((a) => [a.id, a]));
  const contributions: DeathContribution[] = [];
  const knownEventIds = new Set<string>();
  const inconsistentAggregates: string[] = [];

  for (const a of preferred) {
    const value = selectEstimate(a, choice);
    if (value === null) continue;
    knownEventIds.add(a.eventId);
    if (a.scope === 'aggregate' && a.includesAccountIds.length > 0) {
      let childSum = 0;
      for (const cid of a.includesAccountIds) {
        const child = byId.get(cid);
        if (!child) continue;
        const cv = selectEstimate(child, choice);
        if (cv !== null) childSum += cv;
      }
      const residual = value - childSum;
      if (residual < 0) inconsistentAggregates.push(a.id);
      if (residual > 0) contributions.push({ accountId: a.id, eventId: a.eventId, deaths: residual, kind: 'residual' });
    } else {
      contributions.push({ accountId: a.id, eventId: a.eventId, deaths: value, kind: 'leaf' });
    }
  }
  return { contributions, knownEventIds, inconsistentAggregates };
}

/** Total deaths across contributions (each death counted once by construction). */
export function totalDeaths(contribs: DeathContribution[]): number {
  return contribs.reduce((s, c) => s + c.deaths, 0);
}
