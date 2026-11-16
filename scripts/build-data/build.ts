/**
 * Castle Map data build.
 *
 *   npm run data:build
 *
 * Reads curated records (data/castles, data/events, data/casualties, data/territories,
 * data/sources) and raw open-data downloads (data/raw), then:
 *   1. expands curated shorthand and validates every record against the Zod schemas;
 *   2. converts Wikidata castles and conflicts, clips them to Great Britain and
 *      deduplicates them against curated records;
 *   3. attaches official battlefield polygons (Historic England, HES) to events;
 *   4. builds approximate territory polygons from schematic zones and the coastline;
 *   5. writes compact JSON to public/data and review reports to data/processed.
 *
 * No construction date is ever inferred from a listing or scheduling date, and no
 * casualty figure is ever invented: unknown values stay null.
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as turf from '@turf/turf';
import { z } from 'zod';
import {
  Castle,
  CasualtyEstimate,
  HistoricalEvent,
  PoliticalAuthority,
  SourceReference,
  Territory,
  TerritorialTransition,
  type Citation,
} from '../../src/historical-data/schemas';
import { expandDate, startYear } from '../../src/historical-data/dates';
import {
  countryOf,
  haversineKm,
  landOf,
  loadUnits,
  nearestUnit,
  round,
  samplePolygon,
  simplifyPoly,
  territoryGeometry,
  zoneToPoly,
  type Poly,
  type ZoneDef,
} from './lib/geo';
import { nameSimilarity, slug, yearInName } from './lib/names';
import { CONFLICT_CLASS, castleClassFromTypes, conditionFromLabel, parseWktPoint, qid, wikidataDate, type Binding } from './lib/wikidata';

const ROOT = path.resolve('.');
const OUT = path.join(ROOT, 'public/data');
const REPORT_DIR = path.join(ROOT, 'data/processed');

type Json = Record<string, unknown>;
const readJson = async <T = unknown>(p: string): Promise<T> => JSON.parse(await readFile(path.join(ROOT, p), 'utf8')) as T;

const warnings: string[] = [];
const warn = (m: string) => warnings.push(m);

/* ------------------------------------------------------------------ */
/* Curated shorthand expansion                                          */
/* ------------------------------------------------------------------ */

function cites(list: unknown): Citation[] {
  return ((list as unknown[]) ?? []).map((c) => (typeof c === 'string' ? { sourceId: c } : (c as Citation)));
}

function participant(p: unknown) {
  if (typeof p !== 'string') return p;
  const m = /^(auth-[a-z0-9-]+):(.*)$/.exec(p);
  return m ? { name: m[2].trim(), authorityId: m[1] } : { name: p };
}

function expandCastle(raw: Json): Json {
  const c: Json = { ...raw };
  c.built = raw.built == null ? null : expandDate(raw.built as string);
  c.phases = ((raw.phases as Json[]) ?? []).map((p) => ({ ...p, date: expandDate(p.date as string), citations: cites(p.citations) }));
  c.controlChanges = ((raw.controlChanges as Json[]) ?? []).map((x) => ({ ...x, date: expandDate(x.date as string) }));
  if (raw.endOfUse) c.endOfUse = { ...(raw.endOfUse as Json), date: expandDate((raw.endOfUse as Json).date as string) };
  c.sources = cites(raw.sources);
  c.locationAccuracy ??= 'approximate';
  c.provenance = 'curated';
  c.verification ??= 'compiled-unverified';
  return c;
}

function expandEvent(raw: Json): Json {
  return {
    ...raw,
    date: expandDate(raw.date as string),
    participants: ((raw.participants as unknown[]) ?? []).map(participant),
    commanders: ((raw.commanders as unknown[]) ?? []).map((c) => (typeof c === 'string' ? { name: c } : c)),
    sources: cites(raw.sources),
    provenance: 'curated',
    verification: raw.verification ?? 'compiled-unverified',
  };
}

function parseOrThrow<T>(schema: z.ZodType<T>, raw: unknown, label: string): T {
  const r = schema.safeParse(raw);
  if (!r.success) {
    throw new Error(`Validation failed for ${label}:\n${r.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')}`);
  }
  return r.data;
}

/* ------------------------------------------------------------------ */
/* Output helpers                                                       */
/* ------------------------------------------------------------------ */

/** Drop nulls, empty arrays and empty objects; schema defaults restore them on load. */
function compact(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(compact);
  if (v && typeof v === 'object') {
    const out: Json = {};
    for (const [k, val] of Object.entries(v)) {
      if (val === null || val === undefined) continue;
      if (Array.isArray(val) && val.length === 0) continue;
      const c = compact(val);
      if (c && typeof c === 'object' && !Array.isArray(c) && Object.keys(c).length === 0) continue;
      out[k] = c;
    }
    return out;
  }
  return v;
}

function csv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((r) => r.map((c) => {
    const s = c === null || c === undefined ? '' : String(c);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n') + '\n';
}

/* ------------------------------------------------------------------ */
/* Main                                                                 */
/* ------------------------------------------------------------------ */

async function main() {
  await mkdir(OUT, { recursive: true });
  await mkdir(path.join(REPORT_DIR, 'review'), { recursive: true });

  /* Sources */
  const sources = (await readJson<unknown[]>('data/sources/sources.json')).map((s, i) => parseOrThrow(SourceReference, s, `source #${i}`));
  const sourceIds = new Set(sources.map((s) => s.id));
  const checkCites = (cs: Citation[], label: string) => cs.forEach((c) => { if (!sourceIds.has(c.sourceId)) throw new Error(`${label}: unknown source ${c.sourceId}`); });

  /* Geography */
  const units = loadUnits(await readJson('data/raw/naturalearth-gb-map-units.geojson'));
  const land = landOf(units);
  const zoneDefs = (await readJson<{ zones: ZoneDef[] }>('data/territories/zones.json')).zones;
  const zones = new Map<string, Poly>(zoneDefs.map((z) => [z.id, zoneToPoly(z)]));

  /* Curated castles */
  const curatedCastles = (await readJson<Json[]>('data/castles/curated-castles.json')).map((raw) =>
    parseOrThrow(Castle, expandCastle(raw), `castle ${raw.id}`),
  );

  /* Curated events */
  const eventFiles = (await readdir(path.join(ROOT, 'data/events'))).filter((f) => f.endsWith('.json')).sort();
  const curatedEvents: z.infer<typeof HistoricalEvent>[] = [];
  for (const f of eventFiles) {
    for (const raw of await readJson<Json[]>(`data/events/${f}`)) curatedEvents.push(parseOrThrow(HistoricalEvent, expandEvent(raw), `event ${raw.id}`));
  }

  /* ---------------- Wikidata castles ---------------- */
  const wdCastlesRaw = await readJson<{ rows: Binding[]; altLabels: Binding[] }>('data/raw/wikidata-castles.json');
  const altByQ = new Map<string, Set<string>>();
  for (const r of wdCastlesRaw.altLabels) {
    const q = qid(r.c!.value);
    if (!altByQ.has(q)) altByQ.set(q, new Set());
    altByQ.get(q)!.add(r.alt!.value);
  }
  const grouped = new Map<string, Binding[]>();
  for (const r of wdCastlesRaw.rows) {
    const q = qid(r.c!.value);
    if (!grouped.has(q)) grouped.set(q, []);
    grouped.get(q)!.push(r);
  }
  const reviewCastles: (string | number | null)[][] = [['wikidata', 'name', 'lon', 'lat', 'country', 'classification', 'built', 'flags', 'action']];
  const wdCastles: z.infer<typeof Castle>[] = [];
  for (const [q, rows] of grouped) {
    const r0 = rows[0];
    const name = r0.cLabel?.value ?? q;
    const coord = parseWktPoint(r0.coord!.value);
    if (!coord) continue;
    if (/^Q\d+$/.test(name)) {
      reviewCastles.push([q, name, coord[0], coord[1], null, null, null, 'no English label', 'excluded']);
      continue;
    }
    if (/hill ?fort|roman fort|martello|barracks|redoubt/i.test(name)) {
      reviewCastles.push([q, name, coord[0], coord[1], null, null, null, 'not a castle by name', 'excluded']);
      continue;
    }
    const nu = nearestUnit(units, coord);
    if (nu.km > 2) continue; // outside Great Britain (Northern Ireland, Isle of Man, Channel Islands...)
    const typeLabels = [...new Set(rows.map((r) => r.typeLabel?.value ?? ''))];
    const { cls, specific } = castleClassFromTypes(typeLabels);
    const incRow = rows.find((r) => r.inc);
    const built = incRow ? wikidataDate(incRow.inc!.value, incRow.incPrec?.value) : null;
    const demRow = rows.find((r) => r.dem);
    const dem = demRow ? wikidataDate(demRow.dem!.value, demRow.demPrec?.value) : null;
    const condLabel = rows.find((r) => r.condLabel)?.condLabel?.value;
    const flags: string[] = [];
    const builtYear = built ? Number(built.from.slice(0, 4).replace(/-.*/, '')) : null;
    if (builtYear !== null && builtYear >= 1700) flags.push('inception after 1700: may be a later building named "castle" or a rebuild date');
    if (builtYear !== null && builtYear < 1000) flags.push('inception before 1000: may refer to an earlier fortification on the site');
    if (/\b(house|hall|lodge|manor)\b/i.test(name) && !specific) flags.push('possible country house');
    if (!specific) flags.push('generic "castle" classification in Wikidata');
    const article = rows.find((r) => r.article)?.article?.value;
    const ext: Record<string, string> = { wikidata: q };
    const pick = (k: string) => rows.find((r) => r[k])?.[k]?.value;
    if (pick('nhle')) ext.nhle = pick('nhle')!;
    if (pick('canmore')) ext.canmore = pick('canmore')!;
    if (pick('hesId')) ext.hesDesignation = pick('hesId')!;
    if (pick('cadw')) ext.cadw = pick('cadw')!;
    if (article) ext.wikipedia = article;
    const castle = parseOrThrow(Castle, {
      id: `castle-wd-${q.toLowerCase()}`,
      name,
      altNames: [...(altByQ.get(q) ?? [])].filter((a) => a !== name).slice(0, 6),
      country: nu.unit,
      coord: [round(coord[0]), round(coord[1])],
      locationAccuracy: 'approximate',
      classification: cls,
      classificationConfidence: specific ? 'medium' : 'low',
      built,
      endOfUse: dem ? { date: dem, kind: 'demolished' } : null,
      condition: conditionFromLabel(condLabel, !!dem),
      sources: [{ sourceId: 'src-wikidata', supports: `Wikidata item ${q}` }],
      confidence: 'low',
      provenance: 'wikidata',
      verification: 'imported-unreviewed',
      reviewFlags: flags,
      externalIds: ext,
    }, `wikidata castle ${q}`);
    wdCastles.push(castle);
    if (flags.length) reviewCastles.push([q, name, coord[0], coord[1], nu.unit, cls, built ? built.from : null, flags.join('; '), 'included, flagged']);
  }

  // Deduplicate Wikidata items against each other (same normalised name within 0.5 km)
  const wdDeduped: typeof wdCastles = [];
  for (const c of wdCastles) {
    const dup = wdDeduped.find((d) => haversineKm(d.coord, c.coord) < 0.5 && nameSimilarity(d.name, c.name) >= 0.75);
    if (dup) {
      if (!dup.built && c.built) dup.built = c.built;
      reviewCastles.push([c.externalIds.wikidata ?? '', c.name, c.coord[0], c.coord[1], c.country, c.classification, null, `duplicate of ${dup.externalIds.wikidata}`, 'merged']);
      continue;
    }
    wdDeduped.push(c);
  }

  // Match curated castles to Wikidata items
  const curatedMatch: (string | number | null)[][] = [['curated id', 'curated name', 'wikidata', 'wikidata name', 'distance km', 'similarity', 'coordinate adopted']];
  const consumed = new Set<string>();
  for (const c of curatedCastles) {
    let best: { w: (typeof wdDeduped)[number]; score: number; km: number } | null = null;
    for (const w of wdDeduped) {
      if (consumed.has(w.id)) continue;
      const km = haversineKm(c.coord, w.coord);
      if (km > 4) continue;
      const names = [w.name, ...w.altNames];
      const sim = Math.max(...names.map((n) => Math.max(nameSimilarity(c.name, n), ...c.altNames.map((a) => nameSimilarity(a, n)))));
      if (sim < 0.5) continue;
      const score = sim - km / 10;
      if (!best || score > best.score) best = { w, score, km };
    }
    if (best) {
      consumed.add(best.w.id);
      const adopt = best.km <= 1.5;
      c.externalIds = { ...best.w.externalIds, ...c.externalIds };
      if (adopt) c.coord = best.w.coord;
      c.sources.push({ sourceId: 'src-wikidata', supports: `Coordinates and identifiers from Wikidata item ${best.w.externalIds.wikidata}` });
      curatedMatch.push([c.id, c.name, best.w.externalIds.wikidata ?? '', best.w.name, best.km.toFixed(2), best.score.toFixed(2), adopt ? 'yes' : 'no']);
    } else {
      curatedMatch.push([c.id, c.name, '', '', '', '', 'no match']);
      warn(`Curated castle ${c.id} has no Wikidata match`);
    }
    const cc = countryOf(units, c.coord);
    if (cc && cc !== c.country && c.country !== 'Cross-border') warn(`Castle ${c.id} country ${c.country} but coordinates fall in ${cc}`);
  }
  const castles = [...curatedCastles, ...wdDeduped.filter((w) => !consumed.has(w.id))];

  /* ---------------- Wikidata conflicts ---------------- */
  const wdConfRaw = await readJson<{ rows: Binding[] }>('data/raw/wikidata-conflicts.json');
  const confGroups = new Map<string, Binding[]>();
  for (const r of wdConfRaw.rows) {
    const q = qid(r.e!.value);
    if (!confGroups.has(q)) confGroups.set(q, []);
    confGroups.get(q)!.push(r);
  }
  const reviewEvents: (string | number | null)[][] = [['wikidata', 'name', 'year', 'type', 'lon', 'lat', 'action', 'matched curated id']];
  const events = [...curatedEvents];
  const curatedYear = new Map(curatedEvents.map((e) => [e.id, startYear(e.date)]));
  const usedIds = new Set(events.map((e) => e.id));
  for (const [q, rows] of confGroups) {
    const r0 = rows[0];
    const name = r0.eLabel?.value ?? q;
    if (/^Q\d+$/.test(name)) continue;
    const coord = parseWktPoint(r0.coord!.value);
    if (!coord) continue;
    const dRow = rows.find((r) => r.pit) ?? rows.find((r) => r.start);
    const date = dRow ? wikidataDate((dRow.pit ?? dRow.start)!.value, (dRow.pit ? dRow.pitPrec : dRow.startPrec)?.value, rows.find((r) => r.end)?.end?.value, rows.find((r) => r.end)?.endPrec?.value) : null;
    if (!date) continue;
    const y = startYear(date);
    if (y < 1000 || y >= 2001) continue;
    const nu = nearestUnit(units, coord);
    if (nu.km > 12) {
      reviewEvents.push([q, name, Math.floor(y), null, coord[0], coord[1], 'excluded: outside Great Britain', null]);
      continue;
    }
    const type = CONFLICT_CLASS[qid(r0.cls!.value)] ?? 'battle';
    const deathsVal = rows.find((r) => r.deaths)?.deaths?.value;
    const deaths = deathsVal !== undefined && Number.isFinite(Number(deathsVal)) ? Number(deathsVal) : null;
    // Match curated events
    let match: string | null = null;
    for (const e of curatedEvents) {
      const ey = curatedYear.get(e.id)!;
      if (Math.abs(ey - y) > 1.5) continue;
      const sim = Math.max(nameSimilarity(e.name, name), ...e.altNames.map((a) => nameSimilarity(a, name)));
      const km = e.location.point ? haversineKm(e.location.point, coord) : 999;
      if (sim >= 0.75 || (sim >= 0.5 && km < 15) || (km < 3 && e.type === type && Math.abs(ey - y) < 0.5)) {
        match = e.id;
        e.externalIds = { ...e.externalIds, wikidata: q };
        if (deaths !== null) e.wikidataDeathsForComparison = deaths;
        break;
      }
    }
    if (match) {
      reviewEvents.push([q, name, Math.floor(y), type, coord[0], coord[1], 'matched to curated record', match]);
      continue;
    }
    let id = `evt-wd-${slug(name)}-${Math.floor(y)}`;
    while (usedIds.has(id)) id += '-x';
    usedIds.add(id);
    events.push(parseOrThrow(HistoricalEvent, {
      id,
      name,
      type,
      date,
      location: { kind: 'approximate-point', point: [round(coord[0]), round(coord[1])], uncertaintyKm: 2, note: 'Coordinate from Wikidata; not independently verified.' },
      country: nu.unit,
      sources: [{ sourceId: 'src-wikidata', supports: `Wikidata item ${q}` }],
      confidence: 'low',
      provenance: 'wikidata',
      verification: 'imported-unreviewed',
      externalIds: { wikidata: q },
      wikidataDeathsForComparison: deaths,
      reviewFlags: ['imported from Wikidata without narrative; casualties not imported'],
    }, `wikidata event ${q}`));
    reviewEvents.push([q, name, Math.floor(y), type, coord[0], coord[1], 'imported', id]);
  }

  /* ---------------- Official battlefield polygons ---------------- */
  type BF = { id: string; name: string; register: string; url: string | null; year: number | null; geom: Poly; sourceId: string };
  const bfs: BF[] = [];
  const he = await readJson<{ features: { properties: Json; geometry: Poly['geometry'] }[] }>('data/raw/historic-england-registered-battlefields.geojson');
  for (const f of he.features) {
    const name = String(f.properties.Name);
    bfs.push({ id: `he-${f.properties.ListEntry}`, name, register: 'Historic England Register of Historic Battlefields', url: (f.properties.hyperlink as string) ?? null, year: yearInName(name), geom: turf.feature(f.geometry) as Poly, sourceId: 'src-he-battlefields' });
  }
  const hes = await readJson<{ features: { properties: Json; geometry: Poly['geometry'] }[] }>('data/raw/hes-inventory-battlefields.geojson');
  for (const f of hes.features) {
    const name = String(f.properties.DES_TITLE);
    bfs.push({ id: `hes-${f.properties.DES_REF}`, name, register: 'HES Inventory of Historic Battlefields', url: (f.properties.LINK as string) ?? null, year: yearInName(name), geom: turf.feature(f.geometry) as Poly, sourceId: 'src-hes-battlefields' });
  }
  const bfReport: (string | number | null)[][] = [['register id', 'register name', 'matched event', 'event name', 'distance km']];
  const bfFeatures: unknown[] = [];
  const overrides = await readJson<Record<string, string | null>>('data/events/overrides/battlefield-matches.json');
  for (const bf of bfs) {
    const centre = turf.pointOnFeature(bf.geom).geometry.coordinates as [number, number];
    let best: { e: (typeof events)[number]; score: number; km: number } | null = null;
    if (bf.id in overrides) {
      const target = overrides[bf.id];
      if (target === null) {
        bfReport.push([bf.id, bf.name, 'EXCLUDED (override)', '', '']);
        continue;
      }
      const e = events.find((x) => x.id === target);
      if (!e) throw new Error(`Battlefield override ${bf.id} -> unknown event ${target}`);
      best = { e, score: 99, km: e.location.point ? haversineKm(e.location.point, centre) : 0 };
    }
    for (const e of best ? [] : events) {
      if (!['battle', 'skirmish', 'siege', 'massacre'].includes(e.type)) continue;
      const ey = Math.floor(startYear(e.date));
      if (bf.year !== null && Math.abs(ey - bf.year) > 1) continue;
      const sim = Math.max(nameSimilarity(e.name, bf.name), ...e.altNames.map((a) => nameSimilarity(a, bf.name)));
      const km = e.location.point ? haversineKm(e.location.point, centre) : 999;
      if (km > 25) continue;
      if (sim < 0.5 && km > 3) continue;
      const score = sim * 2 - km / 10 + (e.provenance === 'curated' ? 0.5 : 0);
      if (!best || score > best.score) best = { e, score, km };
    }
    const geom = simplifyPoly(bf.geom, 0.0002);
    bfFeatures.push({ type: 'Feature', geometry: geom.geometry, properties: { id: bf.id, name: bf.name, register: bf.register, url: bf.url, eventId: best?.e.id ?? null } });
    if (best) {
      const e = best.e;
      const loc = e.location;
      if (loc.kind !== 'disputed') {
        loc.kind = 'area';
        loc.point = [round(centre[0]), round(centre[1])];
        loc.uncertaintyKm = null;
      }
      loc.polygonRef = bf.id;
      loc.samples = samplePolygon(bf.geom, 16);
      loc.note = [loc.note, `Mapped from the official ${bf.register} polygon.`].filter(Boolean).join(' ');
      if (!e.sources.some((s) => s.sourceId === bf.sourceId)) e.sources.push({ sourceId: bf.sourceId, supports: `${bf.register}: ${bf.name}` });
      if (bf.id.startsWith('he-')) e.externalIds = { ...e.externalIds, heListEntry: bf.id.slice(3) };
      else e.externalIds = { ...e.externalIds, hesBattlefield: bf.id.slice(4) };
      if (e.provenance === 'wikidata') e.confidence = 'medium';
    } else warn(`Battlefield ${bf.id} "${bf.name}" not matched to any event`);
    bfReport.push([bf.id, bf.name, best?.e.id ?? 'UNMATCHED', best?.e.name ?? '', best ? best.km.toFixed(2) : '']);
  }

  /* ---------------- Integrity: castles ↔ events ---------------- */
  const castleById = new Map(castles.map((c) => [c.id, c]));
  const eventById = new Map(events.map((e) => [e.id, e]));
  for (const e of events) {
    checkCites(e.sources, e.id);
    if (e.parentId && !eventById.has(e.parentId)) throw new Error(`Event ${e.id} has unknown parent ${e.parentId}`);
    for (const cid of e.castleIds) {
      const c = castleById.get(cid);
      if (!c) throw new Error(`Event ${e.id} links unknown castle ${cid}`);
      if (!c.eventIds.includes(e.id)) c.eventIds.push(e.id);
    }
    if (e.location.kind !== 'unknown' && !e.location.point) throw new Error(`Event ${e.id} needs a point for location kind ${e.location.kind}`);
    if (e.location.kind === 'disputed' && e.location.alternatives.length < 2) throw new Error(`Event ${e.id} disputed location needs >= 2 alternatives`);
  }
  for (const c of castles) {
    checkCites(c.sources, c.id);
    for (const eid of c.eventIds) if (!eventById.has(eid)) throw new Error(`Castle ${c.id} links unknown event ${eid}`);
    for (const ch of c.controlChanges) if (ch.eventId && !eventById.has(ch.eventId)) throw new Error(`Castle ${c.id} control change links unknown event ${ch.eventId}`);
    // Importance (label priority only) derived from data
    if (c.provenance === 'curated') c.importance = Math.min(5, 3 + (c.eventIds.length >= 2 ? 1 : 0) + (c.eventIds.length >= 4 ? 1 : 0));
    else c.importance = 1 + (c.built && c.externalIds.wikipedia ? 1 : 0);
  }
  const dupCastle = castles.length - castleById.size;
  if (dupCastle) throw new Error(`${dupCastle} duplicate castle IDs`);
  if (events.length !== eventById.size) throw new Error('Duplicate event IDs');

  /* ---------------- Casualties ---------------- */
  const casualties = (await readJson<Json[]>('data/casualties/casualties.json')).map((raw) =>
    parseOrThrow(CasualtyEstimate, { ...raw, sources: cites(raw.sources) }, `casualty ${raw.id}`),
  );
  const casById = new Map(casualties.map((c) => [c.id, c]));
  if (casById.size !== casualties.length) throw new Error('Duplicate casualty account IDs');
  const childOf = new Map<string, string>();
  for (const c of casualties) {
    checkCites(c.sources, c.id);
    if (!eventById.has(c.eventId)) throw new Error(`Casualty ${c.id} references unknown event ${c.eventId}`);
    for (const inc of c.includesAccountIds) {
      if (!casById.has(inc)) throw new Error(`Casualty ${c.id} includes unknown account ${inc}`);
      if (c.scope !== 'aggregate') throw new Error(`Casualty ${c.id} includes accounts but is not an aggregate`);
      if (childOf.has(inc)) throw new Error(`Account ${inc} is included in two aggregates (${childOf.get(inc)} and ${c.id})`);
      childOf.set(inc, c.id);
    }
    if (c.alternativeOf && !casById.has(c.alternativeOf)) throw new Error(`Casualty ${c.id} alternative of unknown ${c.alternativeOf}`);
  }

  /* ---------------- Authorities, territories, transitions ---------------- */
  const authorities = (await readJson<Json[]>('data/territories/authorities.json')).map((raw) => parseOrThrow(PoliticalAuthority, { ...raw, sources: cites(raw.sources) }, `authority ${raw.id}`));
  const authById = new Map(authorities.map((a) => [a.id, a]));
  const territories = (await readJson<Json[]>('data/territories/territories.json')).map((raw) => parseOrThrow(Territory, { ...raw, sources: cites(raw.sources) }, `territory ${raw.id}`));
  const transitions = (await readJson<Json[]>('data/territories/transitions.json')).map((raw) =>
    parseOrThrow(TerritorialTransition, { ...raw, date: expandDate(raw.date as string), sources: cites(raw.sources) }, `transition ${raw.id}`),
  );
  for (const e of events) for (const p of e.participants) if (p.authorityId && !authById.has(p.authorityId)) throw new Error(`Event ${e.id} participant has unknown authority ${p.authorityId}`);
  const terrFeatures: unknown[] = [];
  for (const t of territories) {
    checkCites(t.sources, t.id);
    if (!authById.has(t.authorityId)) throw new Error(`Territory ${t.id} unknown authority ${t.authorityId}`);
    if (t.validFrom > t.validTo) throw new Error(`Territory ${t.id} has reversed dates`);
    const g = territoryGeometry(t.include, t.exclude, units, zones, land);
    if (!g) {
      warn(`Territory ${t.id} produced empty geometry`);
      continue;
    }
    const s = simplifyPoly(g, 0.004);
    const a = authById.get(t.authorityId)!;
    // One label point per territory, on its largest polygon (avoids a label on every island).
    const parts = s.geometry.type === 'Polygon' ? [s.geometry.coordinates] : s.geometry.coordinates;
    const largest = parts.map((p) => turf.polygon(p)).sort((x, y) => turf.area(y) - turf.area(x))[0];
    const lp = turf.pointOnFeature(largest).geometry.coordinates;
    terrFeatures.push({ type: 'Feature', geometry: s.geometry, properties: { id: t.id, authorityId: t.authorityId, authority: a.name, name: t.name, validFrom: t.validFrom, validTo: t.validTo, boundaryStatus: t.boundaryStatus, confidence: t.confidence, color: a.color, labelLon: round(lp[0], 4), labelLat: round(lp[1], 4) } });
  }
  // Overlap check: in any year, territories must not overlap materially.
  for (let year = 1000; year <= 2000; year += 1) {
    const active = (terrFeatures as { properties: { id: string; validFrom: number; validTo: number }; geometry: Poly['geometry'] }[]).filter((f) => f.properties.validFrom <= year && f.properties.validTo >= year);
    if (year % 25 !== 0 && !territories.some((t) => t.validFrom === year)) continue;
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const inter = turf.intersect(turf.featureCollection([turf.feature(active[i].geometry) as Poly, turf.feature(active[j].geometry) as Poly]));
        if (inter && turf.area(inter) > 5e7) warn(`Territories ${active[i].properties.id} and ${active[j].properties.id} overlap by ${(turf.area(inter) / 1e6).toFixed(0)} km² in ${year}`);
      }
    }
  }
  for (const tr of transitions) {
    checkCites(tr.sources, tr.id);
    if (tr.eventId && !eventById.has(tr.eventId)) throw new Error(`Transition ${tr.id} unknown event ${tr.eventId}`);
    for (const tid of tr.territoryIds) if (!territories.some((t) => t.id === tid)) throw new Error(`Transition ${tr.id} unknown territory ${tid}`);
  }
  for (const a of authorities) checkCites(a.sources, a.id);

  /* ---------------- Write outputs ---------------- */
  events.sort((a, b) => startYear(a.date) - startYear(b.date) || a.id.localeCompare(b.id));
  castles.sort((a, b) => (a.provenance === b.provenance ? a.name.localeCompare(b.name) : a.provenance === 'curated' ? -1 : 1));
  const manifest = await readJson<Json[]>('data/raw/manifest.json');
  const dated = castles.filter((c) => c.built).length;
  const meta = {
    generatedAt: new Date().toISOString(),
    counts: {
      castles: castles.length,
      castlesCurated: curatedCastles.length,
      castlesImported: castles.length - curatedCastles.length,
      castlesDated: dated,
      castlesUndated: castles.length - dated,
      events: events.length,
      eventsCurated: curatedEvents.length,
      eventsImported: events.length - curatedEvents.length,
      casualtyAccounts: casualties.length,
      battlefieldPolygons: bfs.length,
      battlefieldPolygonsMatched: bfReport.slice(1).filter((r) => String(r[2]).startsWith('evt-')).length,
      battlefieldPolygonsExcluded: bfReport.slice(1).filter((r) => String(r[2]).startsWith('EXCLUDED')).length,
      territories: terrFeatures.length,
      transitions: transitions.length,
      sources: sources.length,
    },
    rawDatasets: manifest,
    warnings: warnings.length,
  };
  const write = (f: string, data: unknown) => writeFile(path.join(OUT, f), JSON.stringify(data));
  await write('castles.json', compact(castles));
  await write('events.json', compact(events));
  await write('casualties.json', compact(casualties));
  await write('authorities.json', compact(authorities));
  await write('territories-meta.json', compact(territories));
  await write('transitions.json', compact(transitions));
  await write('sources.json', compact(sources));
  await write('territories.geojson', { type: 'FeatureCollection', features: terrFeatures });
  await write('battlefields.geojson', { type: 'FeatureCollection', features: bfFeatures });
  // Simplified coastline: a local fallback basemap so Britain still renders if the tile service is unreachable.
  await write('land.geojson', {
    type: 'FeatureCollection',
    features: (['England', 'Scotland', 'Wales'] as const).map((u) => ({ type: 'Feature', properties: { unit: u }, geometry: simplifyPoly(units[u], 0.003).geometry })),
  });
  await write('meta.json', meta);

  await writeFile(path.join(REPORT_DIR, 'review/castles-review.csv'), csv(reviewCastles));
  await writeFile(path.join(REPORT_DIR, 'review/curated-castle-matching.csv'), csv(curatedMatch));
  await writeFile(path.join(REPORT_DIR, 'review/wikidata-events.csv'), csv(reviewEvents));
  await writeFile(path.join(REPORT_DIR, 'review/battlefield-matching.csv'), csv(bfReport));
  const unknownCas = curatedEvents.filter((e) => !casualties.some((c) => c.eventId === e.id) && ['battle', 'siege', 'massacre', 'raid', 'air-raid'].includes(e.type));
  await writeFile(path.join(REPORT_DIR, 'review/events-without-casualty-data.csv'), csv([['event id', 'name', 'year', 'type'], ...unknownCas.map((e) => [e.id, e.name, Math.floor(startYear(e.date)), e.type])]));

  const report = [
    '# Data build report',
    '',
    `Generated: ${meta.generatedAt}`,
    '',
    '## Counts',
    '',
    ...Object.entries(meta.counts).map(([k, v]) => `- ${k}: ${v}`),
    '',
    '## Raw datasets',
    '',
    ...manifest.map((m) => `- **${m.id}** — ${m.publisher}, ${m.licence}, accessed ${m.accessed}, ${m.records} records (sha256 ${String(m.sha256).slice(0, 12)}…)`),
    '',
    `## Warnings (${warnings.length})`,
    '',
    ...warnings.map((w) => `- ${w}`),
    '',
    '## Review files',
    '',
    '- `review/castles-review.csv` — imported castles excluded or flagged for classification review',
    '- `review/curated-castle-matching.csv` — curated castles matched to Wikidata items',
    '- `review/wikidata-events.csv` — imported Wikidata conflicts and their matching/exclusion',
    '- `review/battlefield-matching.csv` — official battlefield polygons matched to events',
    '- `review/events-without-casualty-data.csv` — curated conflict events with no casualty account (research gaps)',
    '',
  ].join('\n');
  await writeFile(path.join(REPORT_DIR, 'import-report.md'), report);

  console.log(JSON.stringify(meta.counts, null, 2));
  console.log(`${warnings.length} warnings (see data/processed/import-report.md)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
