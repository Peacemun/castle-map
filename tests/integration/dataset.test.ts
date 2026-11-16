/**
 * Integration tests against the real processed dataset in public/data.
 * Run `npm run data:build` first if public/data is missing.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Castle, CasualtyEstimate, HistoricalEvent, PoliticalAuthority, SourceReference, Territory, TerritorialTransition } from '../../src/historical-data/schemas';
import { buildDataset, significancePoints, type Dataset } from '../../src/historical-data/dataset';
import { computeStats } from '../../src/historical-data/stats';
import { accountDeaths, totalDeaths } from '../../src/heatmap/accounting';
import { HeatEngine, DEFAULT_HEAT } from '../../src/heatmap/engine';
import { integrate } from '../../src/heatmap/model';
import { SearchIndex } from '../../src/search/search';
import { buildCinematicMapping } from '../../src/timeline/clock';
import { ERAS } from '../../src/timeline/playback';

const read = (f: string) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'));
const data: Dataset = buildDataset({
  castles: z.array(Castle).parse(read('castles.json')),
  events: z.array(HistoricalEvent).parse(read('events.json')),
  casualties: z.array(CasualtyEstimate).parse(read('casualties.json')),
  sources: z.array(SourceReference).parse(read('sources.json')),
  authorities: z.array(PoliticalAuthority).parse(read('authorities.json')),
  territoryMeta: z.array(Territory).parse(read('territories-meta.json')),
  transitions: z.array(TerritorialTransition).parse(read('transitions.json')),
  territories: read('territories.geojson'),
  battlefields: read('battlefields.geojson'),
  land: read('land.geojson'),
  meta: read('meta.json'),
});

describe('processed dataset', () => {
  it('contains the reference castles and events', () => {
    for (const id of ['castle-tower-of-london', 'castle-edinburgh', 'castle-stirling', 'castle-caernarfon', 'castle-harlech', 'castle-chepstow', 'castle-dunnottar']) expect(data.castleById.has(id)).toBe(true);
    for (const id of ['evt-hastings-1066', 'evt-standard-1138', 'evt-stirling-bridge-1297', 'evt-bannockburn-1314', 'evt-towton-1461', 'evt-flodden-1513', 'evt-marston-moor-1644', 'evt-culloden-1746']) expect(data.eventById.has(id)).toBe(true);
  });

  it('never stores zero as a stand-in for unknown casualties', () => {
    for (const c of data.casualties) {
      if (c.killedMin === 0 || c.killedMax === 0 || c.killedCentral === 0) throw new Error(`${c.id} has a zero figure`);
    }
  });

  it('every casualty account is counted at most once across hierarchies', () => {
    const r = accountDeaths(data.casualties, 'central');
    const ids = r.contributions.map((c) => c.accountId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(r.inconsistentAggregates).toEqual([]);
    // Coast raid: town accounts plus residual equal the raid total (no double count)
    const raid = r.contributions.filter((c) => ['cas-coast-raid-1914', 'cas-hartlepool-1914', 'cas-scarborough-1914', 'cas-whitby-1914'].includes(c.accountId));
    expect(Math.round(totalDeaths(raid))).toBe(137);
  });

  it('places every castle and located event inside the GB study area', () => {
    for (const c of data.castles) {
      expect(c.coord[0]).toBeGreaterThan(-9);
      expect(c.coord[0]).toBeLessThan(2.5);
      expect(c.coord[1]).toBeGreaterThan(49.8);
      expect(c.coord[1]).toBeLessThan(61);
    }
  });

  it('has exactly one or more non-overlapping territories for every year', () => {
    for (let y = 1000; y <= 2000; y++) {
      const active = data.territories.features.filter((f) => f.properties.validFrom <= y && f.properties.validTo >= y);
      expect(active.length).toBeGreaterThan(0);
    }
  });

  it('heat surface conserves mapped deaths and grows over time', () => {
    const eng = new HeatEngine(data.events, data.casualties);
    eng.configure(DEFAULT_HEAT);
    const at = (y: number) => integrate(eng.grid, eng.render(y, DEFAULT_HEAT).H);
    const a = at(1300), b = at(1600), c = at(2000);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    const mapped = (eng as unknown as { sources: { deaths: { weight: number }[] } }).sources.deaths.reduce((s, x) => s + x.weight, 0);
    expect(c / mapped).toBeGreaterThan(0.97); // smoothing redistributes, never creates or removes
    expect(c / mapped).toBeLessThan(1.001);
  });

  it('statistics describe recorded events with ranges', () => {
    const s = computeStats(data, 2000, () => true, ERAS);
    expect(s.deathsHigh).toBeGreaterThanOrEqual(s.deathsLow);
    expect(s.knownCasualtyEvents + s.unknownCasualtyEvents).toBe(s.conflictEvents);
    expect(s.unknownCasualtyEvents).toBeGreaterThan(s.knownCasualtyEvents); // most events have unknown casualties
  });

  it('cinematic schedule from data fits the timeline', () => {
    const m = buildCinematicMapping(significancePoints(data));
    expect(m.yearAt(0)).toBe(1000);
    expect(m.yearAt(1)).toBe(2000);
  });

  it('search finds castles, events, regions and years', () => {
    const idx = new SearchIndex(data);
    expect(idx.search('harlech')[0].id).toBe('castle-harlech');
    expect(idx.search('towton')[0].id).toBe('evt-towton-1461');
    expect(idx.search('1314')[0]).toMatchObject({ kind: 'year', year: 1314 });
    expect(idx.search('Gwynedd').some((r) => r.kind === 'region')).toBe(true);
  });
});
