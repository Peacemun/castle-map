# Adding castles, events, casualty figures and territories

All curated data lives in human-editable JSON under `data/`. After any change run:

```bash
npm run data:build      # validates, merges, writes public/data and data/processed/import-report.md
npm run data:validate
npm test
```

The build fails with a precise message if a record breaks the schema or references something that does not exist.

## 1. Add the source first

Add an entry to `data/sources/sources.json` (IDs start with `src-`):

```json
{ "id": "src-example-book", "kind": "book", "publisher": "Example Press", "title": "Castles of the March",
  "author": "A. Historian", "publicationDate": "2004",
  "bibliographic": "A. Historian, Castles of the March (Example Press, 2004)." }
```

Use `accessDate` only for resources you actually accessed online, and `licence` for datasets.

## 2. Castles — `data/castles/curated-castles.json`

```json
{
  "id": "castle-example",
  "name": "Example Castle",
  "altNames": ["Castell Enghraifft"],
  "country": "Wales",
  "region": "Powys",
  "coord": [-3.1234, 52.5678],
  "classification": "motte-and-bailey",
  "built": "c.1090",
  "phases": [{ "date": "1220/1240", "description": "Stone tower added." }],
  "controlChanges": [{ "date": "1233", "from": "Marcher lord", "to": "Welsh prince", "description": "Taken by ...", "eventId": "evt-example-1233" }],
  "endOfUse": { "date": "1645", "kind": "slighted" },
  "condition": "ruin",
  "summary": "One or two factual sentences.",
  "sources": ["src-example-book", { "sourceId": "src-cadw", "pages": "12–14" }],
  "confidence": "medium"
}
```

- `coord` is **[longitude, latitude]**.
- `built`: shorthand `"1283"`, `"1283-04"`, `"c.1090"`, `"1268/1271"`, `"c.1270s"`, `"13C"`, or a full object `{ "from": "1093", "to": "1153", "precision": "range", "approximate": true, "note": "..." }`. Use `null` if unknown — **never** a listing date.
- `classification`: `motte-and-bailey`, `ringwork`, `stone-keep`, `enclosure`, `concentric`, `quadrangular`, `tower-house`, `peel-tower`, `fortified-manor`, `artillery-fort`, `royal-castle`, `welsh-native`, `castle-unspecified`.
- `condition`: `intact`, `altered-in-use`, `ruin`, `earthwork`, `lost`, `unknown`.
- Leave `verification` out (defaults to `compiled-unverified`) unless you have checked the cited pages, then set `"source-checked"`.
- If a Wikidata item exists for the castle, the build links it automatically (within 4 km and matching name) and adopts its identifiers.

## 3. Events — `data/events/*.json` (grouped by period)

```json
{
  "id": "evt-example-1233",
  "name": "Siege of Example Castle",
  "type": "siege",
  "date": "1233-08/1233-09",
  "country": "Wales",
  "region": "Powys",
  "parentId": "evt-some-campaign",
  "location": { "kind": "approximate-point", "point": [-3.1234, 52.5678], "uncertaintyKm": 1, "placeName": "Example" },
  "participants": ["auth-welsh:Llywelyn ab Iorwerth", "Garrison of Example"],
  "commanders": ["Llywelyn ab Iorwerth"],
  "narrative": "Short factual narrative.",
  "outcome": "Castle taken.",
  "castleIds": ["castle-example"],
  "disagreements": ["Some chroniclers date this to 1231."],
  "sources": ["src-example-book"],
  "confidence": "medium"
}
```

- `type`: `battle`, `siege`, `raid`, `skirmish`, `rebellion`, `campaign`, `massacre`, `air-raid`, `political-change`.
- `location.kind`: `verified-point`, `approximate-point` (give `uncertaintyKm`), `area` (give `uncertaintyKm`), `disputed` (give ≥ 2 `alternatives` with `point` and `label`), `multiple`, `unknown` (no point; excluded from heat, listed as uncertain).
- Participants: prefix with an authority ID (`auth-england:`, `auth-scotland:`, `auth-welsh:` …, see `data/territories/authorities.json`) when the participant acted for a polity.
- Link a castle **only** if sources say the castle itself was attacked or involved.
- Battlefields on the Historic England Register or HES Inventory are matched automatically by name and year; add an entry to `data/events/overrides/battlefield-matches.json` if matching is ambiguous.
- Campaigns may have an `itinerary` of documented places in order; it is drawn as a schematic dashed line.

## 4. Casualties — `data/casualties/casualties.json`

```json
{ "id": "cas-example-1233-garrison", "eventId": "evt-example-1233", "scope": "event",
  "killedMin": 40, "killedMax": 120, "killedCentral": null,
  "category": "military", "side": "Garrison", "captured": { "min": 30, "max": 30 },
  "method": "modern-estimate", "confidence": "low",
  "notes": "Why the range is what it is.", "sources": ["src-example-book"] }
```

- Use `null` for anything unknown. **Never enter 0 to mean unknown** (the validator rejects zeros).
- If a figure is a chronicle claim you consider unreliable, keep `killedMin`/`killedMax` null and quote the claim in `notes`.
- One account per side or group; their deaths must not overlap.
- For a campaign/war total that includes separately recorded events, use `"scope": "aggregate"` and list the child account IDs in `includesAccountIds`. Only the remainder is mapped at the aggregate's location. An account may belong to only one aggregate.
- Two competing estimates of the same deaths: mark one `"preferred": false` with `"alternativeOf": "<other id>"`.

## 5. Territories — `data/territories/`

- `authorities.json`: political authorities with a colour.
- `zones.json`: schematic clip polygons with a stated `basis`. Keep them coarse and honest.
- `territories.json`: `include`/`exclude` lists of geometry references — `ne:England`, `ne:Scotland`, `ne:Wales` (modern outlines, use only where historically comparable), `zone:<id>`, or intersections such as `zone:lothian&ne:Scotland` — plus `validFrom`/`validTo` (inclusive years), `boundaryStatus`, `confidence`, `notes`, `sources`. The build checks that territories never overlap in any year.
- `transitions.json`: documented changes (treaties, conquests, legislation) shown in narration and territory panels.

## 6. Re-importing open data

`npm run data:fetch` downloads Historic England and HES battlefield polygons, Wikidata castles and conflicts, and Natural Earth outlines into `data/raw/` and updates `manifest.json`. To add a new source, add a job to `scripts/import/fetch-sources.ts` (record publisher, licence and attribution) and a conversion step in `scripts/build-data/build.ts`. Use only openly licensed data through its published API.
