# Castle Map

**1,000 years of castles, recorded warfare and changing political authority in England, Wales and Scotland, AD 1000–2000.**

Castle Map is a static, free, open-source web atlas. Press **Play** and watch a thousand years unfold in about three minutes: castles appear as they were built, battles, sieges, raids and massacres flare where they were recorded, political territories change at documented dates, and a dark-red stain gradually accumulates where recorded conflict and recorded deaths concentrated. Pause at any moment, hover a castle to see its name, and click anything to read its history, casualty figures, uncertainties and sources.

- No backend, accounts, tracking, advertising, API keys or paid services.
- Runs locally or from any static host (GitHub Pages workflow included).
- Every historical record carries sources, a confidence rating and a verification status. Unknown values are `null`, never zero.

> **Implemented features ≠ complete historical coverage.** The software is feature-complete against its specification. The *data* is a curated, sourced core plus larger, lower-confidence open-data imports. See [docs/data-coverage.md](docs/data-coverage.md) for exactly what is and is not covered.

## Features

| Area | What it does |
| --- | --- |
| Map | Full-screen MapLibre GL map with a custom parchment cartographic style on OpenFreeMap vector tiles (no roads or modern borders), Natural Earth relief, local coastline fallback, reset view, zoom to any record |
| Timeline | AD 1000–2000; play, pause, restart, ±1/±10-year steps, drag scrubbing, go-to-year, 2/3/5/10-minute durations, fullscreen. Driven by wall-clock time and `requestAnimationFrame`; stops exactly at AD 2000 |
| Pacing | *Chronological* (constant rate) or *Cinematic* (data-driven non-linear clock that slows around significant recorded events, same total duration) |
| Castles | 3,561 records (85 curated, 3,476 from Wikidata). Surviving / ruined / lost symbols, faded while construction is uncertain, importance-based labels, hover tooltip (name only), click for full record |
| Conflict | 575 events (264 curated with narratives and sources; 311 Wikidata imports). Battles, sieges, raids, rebellions, campaigns, massacres, air raids; uncertainty halos, disputed alternative sites, official battlefield polygons (Historic England, HES), documented campaign itineraries |
| Heatmap | Four modes — cumulative deaths, conflict frequency, fading memory (half-life), recent window — on a kilometre-based spatial model with uncertainty handling and double-count prevention; legends for every mode; pulses for major events |
| Territories | 34 dated territory periods for 11 political authorities, built from schematic zones and the coastline; boundary status (documented / schematic / disputed), 25 documented transitions |
| Frontiers & Conflict | Bold historical boundaries over the conflict surface, castles within 25 km of a frontier, castles that changed hands, and a methodological caution |
| Exploration | Client-side search (castles, events, regions, years), filters by country, century, event type and data provenance, statistics with period/region comparison, uncertain-records list, narration cards, deep-linkable URLs |
| Accessibility | Keyboard shortcuts, ARIA slider/labels, high-contrast theme, reduced-motion support, responsive mobile layout with touch |

## Quick start

Requirements: Node.js 20+ (22 recommended) and npm.

```bash
npm ci              # install exact dependency versions
npm run dev         # http://localhost:5173
```

The processed data in `public/data` is committed, so the site runs without re-downloading anything.

### All commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Type-check and build the static site into `dist/` |
| `npm run preview` | Serve the production build on http://localhost:4173 |
| `npm test` | Unit and integration tests (Vitest) |
| `npm run test:e2e` | Browser tests (Playwright; run `npx playwright install chromium` once) |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm run data:fetch` | Re-download the open datasets into `data/raw` (network) |
| `npm run data:build` | Rebuild `public/data` from curated + raw data, with review reports |
| `npm run data:validate` | Validate the published data files |
| `npm run check` | Lint, typecheck, tests and data validation |

## Deployment

Push to `main` on GitHub with Pages enabled (Settings → Pages → Source: **GitHub Actions**). `.github/workflows/deploy.yml` lints, tests, validates data, builds and publishes `dist/`. The build uses a relative base path, so it works under any repository name. Full instructions: [docs/deployment.md](docs/deployment.md).

## Project structure

```
src/
  app/               App shell, render loop, keyboard, context
  components/        Timeline, info panel, side panels, legend, narration, about
  map/               MapController (single MapLibre instance), style, icons, frontier analysis
  timeline/          Deterministic clock (linear + cinematic mappings), playback, eras
  heatmap/           Casualty accounting, spatial model, colour scaling, engine
  historical-data/   Zod schemas (data model), dates, dataset loading, statistics
  search/            Client-side search index
  state/             Stores, filters, URL deep links
  styles/            CSS
data/
  castles/ events/ casualties/ territories/ sources/   Curated, human-editable records
  raw/               Downloaded open datasets + manifest (sha256, licence, access date)
  processed/         Import report and review CSVs
scripts/
  import/            fetch-sources.ts (open data download)
  build-data/        build.ts (merge, validate, deduplicate, export)
  validate/          validate.ts
tests/unit, tests/integration, tests/e2e
docs/                Architecture, methodology, sources, coverage, deployment, adding data
```

## Documentation

- [Architecture](docs/architecture.md)
- [Heatmap methodology](docs/heatmap-methodology.md)
- [Historical methodology](docs/historical-methodology.md)
- [Data sources and licences](docs/data-sources.md)
- [Data coverage and research gaps](docs/data-coverage.md)
- [Adding castles, events and territories](docs/adding-data.md)
- [Deployment](docs/deployment.md)

## Attribution

Basemap © OpenFreeMap, © OpenMapTiles, data © OpenStreetMap contributors (ODbL). Relief and coastline: Natural Earth (public domain). Contains Historic England data © Historic England 2026; contains Ordnance Survey data © Crown copyright and database right 2026 (Open Government Licence v3.0). Contains Historic Environment Scotland and Ordnance Survey data © Historic Environment Scotland — Scottish Charity No. SC045925 © Crown copyright and database right 2026 (OGL v3.0). Wikidata (CC0). Fonts: EB Garamond and Source Sans 3 (SIL Open Font License), self-hosted.

## Licence

Code: MIT (see [LICENSE](LICENSE)). Data files retain their source licences (OGL v3.0, CC0, public domain, ODbL for map tiles); see [docs/data-sources.md](docs/data-sources.md). Curated historical records in `data/` are released under CC BY 4.0 unless a source licence requires otherwise.
