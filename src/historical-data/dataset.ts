/**
 * Loads the processed data files (public/data), validates them with the same Zod
 * schemas used by the build, and derives timeline indexes.
 */
import { z } from 'zod';
import type { FeatureCollection, Geometry } from 'geojson';
import {
  Castle,
  CasualtyEstimate,
  HistoricalEvent,
  PoliticalAuthority,
  SourceReference,
  Territory,
  TerritorialTransition,
} from './schemas';
import { endYear, startYear } from './dates';
import { accountDeaths, selectEstimate } from '../heatmap/accounting';

export interface CastleView extends Castle {
  /** Decimal year the castle first appears (earliest construction), or null if undated. */
  t0: number | null;
  /** Decimal year after which construction is certain (end of the date range). */
  t1: number | null;
}

export interface EventView extends HistoricalEvent {
  t0: number;
  t1: number;
  significance: number;
  childIds: string[];
  casualtyIds: string[];
  /** Known deaths for this event (central estimate of its own leaf accounts), null if unknown. */
  knownDeaths: number | null;
}

export interface TerritoryProps {
  id: string;
  authorityId: string;
  authority: string;
  name: string;
  validFrom: number;
  validTo: number;
  boundaryStatus: string;
  confidence: string;
  color: string;
  labelLon: number;
  labelLat: number;
}

export interface Meta {
  generatedAt: string;
  counts: Record<string, number>;
  rawDatasets: { id: string; publisher: string; licence: string; attribution: string; accessed: string; records: number; url: string; notes?: string }[];
}

export interface Dataset {
  castles: CastleView[];
  castleById: Map<string, CastleView>;
  events: EventView[];
  eventById: Map<string, EventView>;
  casualties: CasualtyEstimate[];
  casualtiesByEvent: Map<string, CasualtyEstimate[]>;
  sources: Map<string, SourceReference>;
  authorities: Map<string, PoliticalAuthority>;
  territoryMeta: Map<string, Territory>;
  territories: FeatureCollection<Geometry, TerritoryProps>;
  battlefields: FeatureCollection<Geometry, { id: string; name: string; register: string; url: string | null; eventId: string | null }>;
  land: FeatureCollection;
  transitions: TerritorialTransition[];
  meta: Meta;
}

const TYPE_WEIGHT: Record<HistoricalEvent['type'], number> = {
  battle: 1,
  siege: 0.6,
  massacre: 0.9,
  raid: 0.45,
  skirmish: 0.3,
  rebellion: 0.6,
  campaign: 0.5,
  'air-raid': 0.6,
  'political-change': 0.8,
};

/**
 * Data-driven significance used for cinematic pacing, pulses and narration.
 * It depends only on recorded fields: event type, curation status, official
 * battlefield designation, linked castles and known casualty figures.
 */
export function significanceOf(e: HistoricalEvent, knownDeaths: number | null, hasChildren: boolean): number {
  let s = TYPE_WEIGHT[e.type];
  s *= e.provenance === 'curated' ? 1 : 0.35;
  if (e.location.polygonRef) s *= 1.3;
  if (knownDeaths && knownDeaths > 0) s *= 1 + 0.5 * Math.log10(1 + knownDeaths);
  s *= 1 + Math.min(3, e.castleIds.length) * 0.08;
  if (hasChildren) s *= 0.5;
  return Math.round(s * 1000) / 1000;
}

async function getJson(name: string): Promise<unknown> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/${name}`);
  if (!res.ok) throw new Error(`Failed to load ${name}: HTTP ${res.status}`);
  return res.json();
}

export async function loadDataset(onProgress?: (msg: string) => void): Promise<Dataset> {
  onProgress?.('Loading records');
  const [castlesRaw, eventsRaw, casRaw, srcRaw, authRaw, terrMetaRaw, transRaw, terr, bf, land, meta] = await Promise.all([
    getJson('castles.json'),
    getJson('events.json'),
    getJson('casualties.json'),
    getJson('sources.json'),
    getJson('authorities.json'),
    getJson('territories-meta.json'),
    getJson('transitions.json'),
    getJson('territories.geojson'),
    getJson('battlefields.geojson'),
    getJson('land.geojson'),
    getJson('meta.json'),
  ]);
  onProgress?.('Validating records');
  const castles = z.array(Castle).parse(castlesRaw);
  const events = z.array(HistoricalEvent).parse(eventsRaw);
  const casualties = z.array(CasualtyEstimate).parse(casRaw);
  const sources = z.array(SourceReference).parse(srcRaw);
  const authorities = z.array(PoliticalAuthority).parse(authRaw);
  const territoryMeta = z.array(Territory).parse(terrMetaRaw);
  const transitions = z.array(TerritorialTransition).parse(transRaw);
  return buildDataset({ castles, events, casualties, sources, authorities, territoryMeta, transitions, territories: terr as Dataset['territories'], battlefields: bf as Dataset['battlefields'], land: land as FeatureCollection, meta: meta as Meta });
}

export function buildDataset(input: {
  castles: Castle[];
  events: HistoricalEvent[];
  casualties: CasualtyEstimate[];
  sources: SourceReference[];
  authorities: PoliticalAuthority[];
  territoryMeta: Territory[];
  transitions: TerritorialTransition[];
  territories: Dataset['territories'];
  battlefields: Dataset['battlefields'];
  land: FeatureCollection;
  meta: Meta;
}): Dataset {
  const castles: CastleView[] = input.castles.map((c) => ({ ...c, t0: c.built ? startYear(c.built) : null, t1: c.built ? endYear(c.built) : null }));
  const casualtiesByEvent = new Map<string, CasualtyEstimate[]>();
  for (const c of input.casualties) {
    if (!casualtiesByEvent.has(c.eventId)) casualtiesByEvent.set(c.eventId, []);
    casualtiesByEvent.get(c.eventId)!.push(c);
  }
  const children = new Map<string, string[]>();
  for (const e of input.events) if (e.parentId) children.set(e.parentId, [...(children.get(e.parentId) ?? []), e.id]);
  const { contributions } = accountDeaths(input.casualties, 'central');
  const deathsByEvent = new Map<string, number>();
  for (const c of contributions) deathsByEvent.set(c.eventId, (deathsByEvent.get(c.eventId) ?? 0) + c.deaths);
  const events: EventView[] = input.events.map((e) => {
    const accounts = casualtiesByEvent.get(e.id) ?? [];
    const own = accounts.filter((a) => a.preferred !== false).map((a) => selectEstimate(a, 'central')).filter((v): v is number => v !== null);
    const knownDeaths = own.length ? own.reduce((s, v) => s + v, 0) : null;
    const childIds = children.get(e.id) ?? [];
    return {
      ...e,
      t0: startYear(e.date),
      t1: endYear(e.date),
      childIds,
      casualtyIds: accounts.map((a) => a.id),
      knownDeaths,
      significance: significanceOf(e, deathsByEvent.get(e.id) ?? knownDeaths, childIds.length > 0),
    };
  });
  events.sort((a, b) => a.t0 - b.t0 || a.id.localeCompare(b.id));
  return {
    castles,
    castleById: new Map(castles.map((c) => [c.id, c])),
    events,
    eventById: new Map(events.map((e) => [e.id, e])),
    casualties: input.casualties,
    casualtiesByEvent,
    sources: new Map(input.sources.map((s) => [s.id, s])),
    authorities: new Map(input.authorities.map((a) => [a.id, a])),
    territoryMeta: new Map(input.territoryMeta.map((t) => [t.id, t])),
    territories: input.territories,
    battlefields: input.battlefields,
    land: input.land,
    transitions: input.transitions,
    meta: input.meta,
  };
}

/** Significance points for the cinematic clock (events + documented territorial transitions). */
export function significancePoints(d: Dataset): { year: number; weight: number }[] {
  return [
    ...d.events.map((e) => ({ year: e.t0, weight: e.significance })),
    ...d.transitions.map((t) => ({ year: startYear(t.date), weight: 1.2 })),
  ];
}

export const NARRATION_THRESHOLD = 1.25;
