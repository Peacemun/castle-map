/**
 * Validate the published data files (public/data) independently of the build.
 *
 *   npm run data:validate
 *
 * Checks every record against the Zod schemas and verifies referential integrity,
 * coordinate ranges, casualty consistency and the "unknown is not zero" rule.
 * Exits with status 1 on any error.
 */
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { Castle, CasualtyEstimate, HistoricalEvent, PoliticalAuthority, SourceReference, Territory, TerritorialTransition } from '../../src/historical-data/schemas';
import { accountDeaths } from '../../src/heatmap/accounting';

const read = (f: string) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'));
const errors: string[] = [];
const err = (m: string) => errors.push(m);

function parse<T>(schema: z.ZodType<T>, file: string): T[] {
  const r = z.array(schema).safeParse(read(file));
  if (!r.success) {
    for (const i of r.error.issues.slice(0, 20)) err(`${file}: ${i.path.join('.')}: ${i.message}`);
    return [];
  }
  return r.data;
}

const castles = parse(Castle, 'castles.json');
const events = parse(HistoricalEvent, 'events.json');
const casualties = parse(CasualtyEstimate, 'casualties.json');
const sources = parse(SourceReference, 'sources.json');
const authorities = parse(PoliticalAuthority, 'authorities.json');
const territories = parse(Territory, 'territories-meta.json');
const transitions = parse(TerritorialTransition, 'transitions.json');

const sourceIds = new Set(sources.map((s) => s.id));
const eventIds = new Set(events.map((e) => e.id));
const castleIds = new Set(castles.map((c) => c.id));
const authIds = new Set(authorities.map((a) => a.id));

const unique = (label: string, ids: string[]) => {
  if (new Set(ids).size !== ids.length) err(`${label}: duplicate IDs`);
};
unique('castles', castles.map((c) => c.id));
unique('events', events.map((e) => e.id));
unique('casualties', casualties.map((c) => c.id));
unique('sources', sources.map((s) => s.id));

const inGB = ([lon, lat]: [number, number]) => lon > -9 && lon < 2.5 && lat > 49.8 && lat < 61;

for (const c of castles) {
  if (!inGB(c.coord)) err(`${c.id}: coordinate outside Great Britain`);
  for (const s of c.sources) if (!sourceIds.has(s.sourceId)) err(`${c.id}: unknown source ${s.sourceId}`);
  for (const e of c.eventIds) if (!eventIds.has(e)) err(`${c.id}: unknown event ${e}`);
  if (c.provenance === 'curated' && c.verification === 'imported-unreviewed') err(`${c.id}: curated record marked imported`);
}
for (const e of events) {
  if (e.location.point && !inGB(e.location.point) && e.location.kind !== 'unknown') err(`${e.id}: location outside study area`);
  if (e.location.kind !== 'unknown' && !e.location.point) err(`${e.id}: missing point`);
  for (const s of e.sources) if (!sourceIds.has(s.sourceId)) err(`${e.id}: unknown source ${s.sourceId}`);
  for (const c of e.castleIds) if (!castleIds.has(c)) err(`${e.id}: unknown castle ${c}`);
  if (e.parentId && !eventIds.has(e.parentId)) err(`${e.id}: unknown parent ${e.parentId}`);
  for (const p of e.participants) if (p.authorityId && !authIds.has(p.authorityId)) err(`${e.id}: unknown authority ${p.authorityId}`);
}
for (const c of casualties) {
  if (!eventIds.has(c.eventId)) err(`${c.id}: unknown event ${c.eventId}`);
  if (c.killedMin === 0 || c.killedMax === 0 || c.killedCentral === 0) err(`${c.id}: zero used as a figure; unknown must be null`);
  if (c.killedCentral !== null && c.killedMin !== null && c.killedCentral < c.killedMin) err(`${c.id}: central below minimum`);
  if (c.killedCentral !== null && c.killedMax !== null && c.killedCentral > c.killedMax) err(`${c.id}: central above maximum`);
  for (const s of c.sources) if (!sourceIds.has(s.sourceId)) err(`${c.id}: unknown source ${s.sourceId}`);
}
for (const choice of ['low', 'central', 'high'] as const) {
  const r = accountDeaths(casualties, choice);
  if (r.inconsistentAggregates.length) err(`aggregate accounts smaller than their children (${choice}): ${r.inconsistentAggregates.join(', ')}`);
}
for (const t of territories) {
  if (!authIds.has(t.authorityId)) err(`${t.id}: unknown authority`);
  if (t.validFrom > t.validTo) err(`${t.id}: reversed validity`);
  for (const s of t.sources) if (!sourceIds.has(s.sourceId)) err(`${t.id}: unknown source ${s.sourceId}`);
}
for (let y = 1000; y <= 2000; y++) if (!territories.some((t) => t.validFrom <= y && t.validTo >= y)) err(`no territory defined for ${y}`);
for (const tr of transitions) if (tr.eventId && !eventIds.has(tr.eventId)) err(`${tr.id}: unknown event ${tr.eventId}`);

const summary = `${castles.length} castles, ${events.length} events, ${casualties.length} casualty accounts, ${territories.length} territories, ${transitions.length} transitions, ${sources.length} sources`;
if (errors.length) {
  console.error(`Validation FAILED (${errors.length} errors) — ${summary}`);
  for (const e of errors.slice(0, 100)) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`Validation passed — ${summary}`);
