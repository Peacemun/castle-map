# Architecture

Castle Map is a static single-page application (React + TypeScript + Vite) with a separate, reproducible data pipeline (Node + tsx). There is no backend: the browser downloads the processed JSON once and computes everything else locally.

```
 open datasets ──fetch-sources.ts──► data/raw/ (+ manifest: url, licence, sha256)
 curated JSON (data/castles, events, casualties, territories, sources)
        │
        └──────── build.ts ───────► public/data/*.json   (validated, deduplicated, compact)
                     │                   data/processed/  (import report, review CSVs)
                     ▼
              Zod schemas (src/historical-data/schemas.ts)  ◄── shared by build, validator and app
                                          │
 browser:  dataset.ts (load + validate) ──┤
                                          ├─► MapController (one MapLibre map)
 PlaybackController (wall clock, rAF) ──► timeStore ─┤        ├─ castles / events / itineraries (GeoJSON setData on change)
 UI (React) ──────────────────────────► uiStore ─────┘        ├─ territories (setFilter per integer year)
                                                              ├─ heat raster (HeatEngine → ImageSource.updateImage)
                                                              └─ pulses / selection
```

## Data model

`src/historical-data/schemas.ts` defines Castle, HistoricalEvent (Battle, Siege, Campaign are typed views), CasualtyEstimate, PoliticalAuthority, Territory, TerritorialTransition, SourceReference, Citation, HistoricalDate, EventLocation (location uncertainty) and Confidence/Verification enums. Conventions: stable prefixed string IDs; GeoJSON `[lon, lat]`; `null` for unknown; partial ISO dates with precision. The build writes compact JSON (nulls and empty arrays omitted); the app restores defaults by parsing with the same schemas.

## Timeline

`src/timeline/clock.ts`:
- `u ∈ [0,1]` = elapsed wall-clock time ÷ duration (2, 3, 5 or 10 minutes); `requestAnimationFrame` only triggers evaluation, so frame rate never changes speed.
- A `TimeMapping` turns `u` into a year. *Chronological* is linear. *Cinematic* is the normalised cumulative density of `baseShare` (40%, uniform) plus Gaussian-smoothed event significance (60%). Both map 0 → 1000 and 1 → 2000, so playback always fits the duration and stops exactly at AD 2000.
- Switching mapping or duration re-anchors at the current year, so the year never jumps.
- Scrubbing pauses the clock (no automatic pacing while dragging) and resumes on release if it was playing.

Event significance (`dataset.ts → significanceOf`) uses only recorded fields: event type, curation status, official battlefield designation, linked castles, known casualties and whether it is a parent campaign.

## Rendering

- **One** MapLibre map is created for the session (`MapController`). `frame()` is called from a render loop that runs only while playing, while a pulse animates, or after a state change.
- Each layer group has a change key; sources are updated only when their visible set changes (e.g. the castle source changes ~400 times across a full playback, not 10,000 times).
- MapLibre 6 runs its tile parsing in a module worker; `setWorkerUrl` points it at the worker emitted by Vite.
- Heat: `HeatEngine` caches per-event kernel footprints; a frame is ~1–2 ms. The RGBA buffer is uploaded with `ImageSource.updateImage({ image: ImageData })`.
- React re-renders only small components on clock ticks (year display, narration); the map does not go through React.

## State

`src/state/store.ts` contains two tiny external stores used with `useSyncExternalStore`: `timeStore` (year, playing, scrubbing; high frequency) and `uiStore` (layers, filters, heat settings, selection, panels, accessibility options). `filters.ts` holds the visibility rules shared by the map, statistics and lists. `url.ts` serialises state into query parameters (debounced, never during playback).

## Search

`src/search/search.ts` builds an in-memory index of castles (names and alternative names), events, regions (derived from curated records) and four-digit years. No external service.

## Testing

- **Unit/integration (Vitest)** — clock pacing and durations, cinematic monotonicity, accounting and double counting, kernel mass conservation, uncertainty spreading, decay/window behaviour, determinism, backward scrubbing, colour scaling, date parsing, import helpers, URL round-trip, frontier distances, and checks against the real processed dataset.
- **Browser (Playwright)** — desktop and mobile (touch) projects with software WebGL: map and territories load, play/pause/restart, events and castles appear at their dates and disappear when scrubbing back, hover tooltip and click panel, layer toggles, search, deep links, keyboard, slider drag, durations, heat modes, Frontiers note, sources page.

## Accessibility

Keyboard shortcuts (Space, arrows, Home/End, `/`, F, R, Esc), ARIA slider semantics for the timeline, labelled controls and panels, visible focus rings, high-contrast theme (also follows `prefers-contrast: more`), reduced motion (follows `prefers-reduced-motion` and can be toggled), and a responsive layout with touch support.
