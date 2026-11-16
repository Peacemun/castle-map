/**
 * Download open datasets used by Castle Map into data/raw/, with a provenance manifest.
 *
 *   npm run data:fetch            # fetch everything
 *   npm run data:fetch -- wikidata-castles ne-gb   # fetch selected datasets
 *
 * Only openly licensed sources accessed through their published APIs are used:
 *  - Historic England Registered Battlefields (Open Government Licence v3.0)
 *  - Historic Environment Scotland Inventory of Historic Battlefields (OGL v3.0)
 *  - Wikidata castles and conflict items (CC0 1.0)
 *  - Natural Earth 1:10m admin-0 map units (public domain)
 *
 * The raw files are committed so that `npm run data:build` is reproducible offline.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const RAW_DIR = path.resolve('data/raw');
const MANIFEST = path.join(RAW_DIR, 'manifest.json');
const UA = 'CastleMapDataImport/1.0 (open-source educational historical atlas; static build script)';

interface ManifestEntry {
  id: string;
  file: string;
  url: string;
  publisher: string;
  licence: string;
  attribution: string;
  accessed: string;
  sha256: string;
  records: number;
  notes?: string;
}

async function fetchText(url: string, init: RequestInit = {}, attempts = 3): Promise<string> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { ...init, headers: { 'User-Agent': UA, ...(init.headers ?? {}) } });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
  throw lastErr;
}

async function sparql(query: string): Promise<unknown> {
  const url = 'https://query.wikidata.org/sparql?query=' + encodeURIComponent(query);
  const text = await fetchText(url, { headers: { Accept: 'application/sparql-results+json' } });
  return JSON.parse(text);
}

const WIKIDATA_CASTLES = `
SELECT ?c ?cLabel ?coord ?type ?typeLabel ?inc ?incPrec ?dem ?demPrec ?cond ?condLabel ?nhle ?canmore ?hesId ?cadw ?article WHERE {
  ?c wdt:P31 ?type . ?type wdt:P279* wd:Q23413 .
  ?c wdt:P17 wd:Q145 ; wdt:P625 ?coord .
  OPTIONAL { ?c p:P571/psv:P571 [ wikibase:timeValue ?inc ; wikibase:timePrecision ?incPrec ] }
  OPTIONAL { ?c p:P576/psv:P576 [ wikibase:timeValue ?dem ; wikibase:timePrecision ?demPrec ] }
  OPTIONAL { ?c wdt:P5816 ?cond }
  OPTIONAL { ?c wdt:P1216 ?nhle }
  OPTIONAL { ?c wdt:P718 ?canmore }
  OPTIONAL { ?c wdt:P709 ?hesId }
  OPTIONAL { ?c wdt:P1459 ?cadw }
  OPTIONAL { ?article schema:about ?c ; schema:isPartOf <https://en.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;

const WIKIDATA_CASTLE_ALTLABELS = `
SELECT ?c ?alt WHERE {
  ?c wdt:P31 ?type . ?type wdt:P279* wd:Q23413 .
  ?c wdt:P17 wd:Q145 .
  ?c skos:altLabel ?alt . FILTER(LANG(?alt) IN ("en", "cy", "gd"))
}`;

// Battles, sieges, massacres, raids, rebellions, naval battles and military campaigns
// whose country is a British state (later clipped to GB land polygons).
const WIKIDATA_CONFLICTS = `
SELECT ?e ?eLabel ?coord ?cls ?pit ?pitPrec ?start ?startPrec ?end ?endPrec ?deaths ?article WHERE {
  VALUES ?cls { wd:Q178561 wd:Q188055 wd:Q3199915 wd:Q2001676 wd:Q124734 wd:Q831663 wd:Q1261499 }
  VALUES ?country { wd:Q145 wd:Q21 wd:Q22 wd:Q25 wd:Q179876 wd:Q230791 wd:Q161885 wd:Q174193 }
  ?e wdt:P17 ?country ; wdt:P625 ?coord .
  ?e wdt:P31 ?cls .
  OPTIONAL { ?e p:P585/psv:P585 [ wikibase:timeValue ?pit ; wikibase:timePrecision ?pitPrec ] }
  OPTIONAL { ?e p:P580/psv:P580 [ wikibase:timeValue ?start ; wikibase:timePrecision ?startPrec ] }
  OPTIONAL { ?e p:P582/psv:P582 [ wikibase:timeValue ?end ; wikibase:timePrecision ?endPrec ] }
  OPTIONAL { ?e wdt:P1120 ?deaths }
  OPTIONAL { ?article schema:about ?e ; schema:isPartOf <https://en.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;

interface Job {
  id: string;
  file: string;
  url: string;
  publisher: string;
  licence: string;
  attribution: string;
  notes?: string;
  run: () => Promise<{ data: unknown; records: number }>;
}

const HE_BATTLEFIELDS =
  'https://services-eu1.arcgis.com/ZOdPfBS3aqqDYPUQ/arcgis/rest/services/National_Heritage_List_for_England_NHLE_v02_VIEW/FeatureServer/8/query?where=1%3D1&outFields=*&outSR=4326&f=geojson';
const HES_BATTLEFIELDS =
  'https://inspire.hes.scot/arcgis/rest/services/HES/HES_Designations/MapServer/3/query?where=1%3D1&outFields=*&outSR=4326&f=geojson';
const NE_MAP_UNITS =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_map_units.geojson';

const jobs: Job[] = [
  {
    id: 'he-battlefields',
    file: 'historic-england-registered-battlefields.geojson',
    url: HE_BATTLEFIELDS,
    publisher: 'Historic England',
    licence: 'Open Government Licence v3.0',
    attribution: 'Contains Historic England data © Historic England 2026. Contains Ordnance Survey data © Crown copyright and database right 2026.',
    run: async () => {
      const json = JSON.parse(await fetchText(HE_BATTLEFIELDS)) as { features: unknown[] };
      return { data: json, records: json.features.length };
    },
  },
  {
    id: 'hes-battlefields',
    file: 'hes-inventory-battlefields.geojson',
    url: HES_BATTLEFIELDS,
    publisher: 'Historic Environment Scotland',
    licence: 'Open Government Licence v3.0',
    attribution: 'Contains Historic Environment Scotland and Ordnance Survey data © Historic Environment Scotland — Scottish Charity No. SC045925 © Crown copyright and database right 2026.',
    run: async () => {
      const json = JSON.parse(await fetchText(HES_BATTLEFIELDS)) as { features: unknown[] };
      return { data: json, records: json.features.length };
    },
  },
  {
    id: 'ne-gb',
    file: 'naturalearth-gb-map-units.geojson',
    url: NE_MAP_UNITS,
    publisher: 'Natural Earth',
    licence: 'Public domain',
    attribution: 'Made with Natural Earth. Free vector and raster map data @ naturalearthdata.com.',
    notes: 'Filtered to the England, Scotland and Wales map units. Used only as a coastline and, where explicitly stated, as an approximation of later boundaries.',
    run: async () => {
      const json = JSON.parse(await fetchText(NE_MAP_UNITS)) as {
        features: { properties: Record<string, unknown>; geometry: unknown }[];
      };
      const keep = json.features
        .filter((f) => f.properties.ADM0_A3 === 'GBR' && ['England', 'Scotland', 'Wales'].includes(String(f.properties.GEOUNIT)))
        .map((f) => ({ type: 'Feature', properties: { unit: f.properties.GEOUNIT }, geometry: f.geometry }));
      return { data: { type: 'FeatureCollection', features: keep }, records: keep.length };
    },
  },
  {
    id: 'wikidata-castles',
    file: 'wikidata-castles.json',
    url: 'https://query.wikidata.org/sparql',
    publisher: 'Wikidata / Wikimedia Foundation',
    licence: 'CC0 1.0',
    attribution: 'Wikidata (CC0).',
    notes: 'Items that are instances of (subclasses of) castle (Q23413) with country United Kingdom and coordinates.',
    run: async () => {
      const main = (await sparql(WIKIDATA_CASTLES)) as { results: { bindings: unknown[] } };
      const alts = (await sparql(WIKIDATA_CASTLE_ALTLABELS)) as { results: { bindings: unknown[] } };
      return { data: { query: WIKIDATA_CASTLES, rows: main.results.bindings, altLabels: alts.results.bindings }, records: main.results.bindings.length };
    },
  },
  {
    id: 'wikidata-conflicts',
    file: 'wikidata-conflicts.json',
    url: 'https://query.wikidata.org/sparql',
    publisher: 'Wikidata / Wikimedia Foundation',
    licence: 'CC0 1.0',
    attribution: 'Wikidata (CC0).',
    notes: 'Battles, sieges, massacres, raids, rebellions and campaigns with coordinates whose country (P17) is the UK, England, Scotland, Wales or a historical British kingdom; clipped to GB land at build time.',
    run: async () => {
      const main = (await sparql(WIKIDATA_CONFLICTS)) as { results: { bindings: unknown[] } };
      return { data: { query: WIKIDATA_CONFLICTS, rows: main.results.bindings }, records: main.results.bindings.length };
    },
  },
];

async function main() {
  await mkdir(RAW_DIR, { recursive: true });
  const only = process.argv.slice(2);
  let manifest: ManifestEntry[];
  try {
    manifest = JSON.parse(await readFile(MANIFEST, 'utf8')) as ManifestEntry[];
  } catch {
    manifest = [];
  }
  const accessed = new Date().toISOString().slice(0, 10);
  for (const job of jobs) {
    if (only.length && !only.includes(job.id)) continue;
    process.stdout.write(`Fetching ${job.id} ... `);
    try {
      const { data, records } = await job.run();
      const text = JSON.stringify(data);
      await writeFile(path.join(RAW_DIR, job.file), text);
      const entry: ManifestEntry = {
        id: job.id,
        file: job.file,
        url: job.url,
        publisher: job.publisher,
        licence: job.licence,
        attribution: job.attribution,
        accessed,
        sha256: createHash('sha256').update(text).digest('hex'),
        records,
        notes: job.notes,
      };
      manifest = manifest.filter((m) => m.id !== job.id).concat(entry);
      console.log(`${records} records`);
    } catch (err) {
      // Record the blocker but keep going: the build uses the last committed raw file if present.
      console.log(`FAILED: ${(err as Error).message}`);
    }
  }
  manifest.sort((a, b) => a.id.localeCompare(b.id));
  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
