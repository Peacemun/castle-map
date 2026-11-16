# Heatmap methodology

The heatmap communicates where recorded warfare, and recorded deaths in it, concentrated across Britain over time. It is a **visualisation of a dataset**, not an estimate of all deaths in British history.

Implementation: `src/heatmap/` (`accounting.ts`, `model.ts`, `colour.ts`, `engine.ts`). Tests: `tests/unit/accounting.test.ts`, `tests/unit/heatmodel.test.ts`, `tests/integration/dataset.test.ts`.

## 1. Model

```
H(x, t) = Σ_events  W(e) · K(d(x, e)) · T(t, e)
```

| Term | Meaning |
| --- | --- |
| `H` | Heat intensity at grid cell `x` and time `t`, in deaths per km² (or events per km²) |
| `W` | Event weight: its de-duplicated selected casualty quantity (death modes), or 1 (frequency modes) |
| `K` | Spatial kernel: 2-D Gaussian in geographic kilometres, normalised to integrate to 1 over the grid |
| `T` | Time factor (see §4) |

Because `K` integrates to 1, smoothing *redistributes* a quantity and never creates or removes it: the integral of `H` over the grid equals `Σ W·T` (verified in tests to within 3% at the grid edges and 0.1% overall).

## 2. Grid and distance

- Extent 8.8°W–2.4°E, 49.8°N–61.0°N; 360 columns × 639 rows aligned to Web Mercator rows (~2 km cells), so the result can be drawn as a map image without distortion.
- Each row has its true cell area in km² (`R² cos²φ Δλ Δy`).
- Kernel distances use a local equirectangular approximation on the sphere (accurate to well under 1% at the ≤ 100 km scales involved); the kernel is truncated at 3σ.
- Rendering uses MapLibre linear resampling and zoom-dependent opacity; this does not change the analysis.

## 3. Spatial influence and uncertainty

- Default influence distance **15 km**, configurable 5–40 km; σ = influence ÷ 2. It is visual smoothing, **not** the area over which deaths occurred.
- **Verified point**: kernel σ.
- **Approximate point** with uncertainty radius `u`: σ_eff = √(σ² + (u/2)²) — a wider, lower kernel rather than a false point.
- **Area matched to an official battlefield polygon** (Historic England Register / HES Inventory): weight split evenly across up to 16 sample points inside the polygon (computed at build time).
- **Area without polygon**: as an approximate point with radius `u`.
- **Disputed**: weight split between alternative sites (equally unless sources favour one).
- **Unknown location**, or uncertainty > 75 km: excluded from the surface and listed in the *Uncertain* panel.

## 4. Modes and time factor

| Mode | Measure | `T(t, e)` |
| --- | --- | --- |
| A — Cumulative deaths (default) | Deaths | Accrues linearly from the event's start to its end date, then stays at 1 |
| B — Conflict frequency | Events | 1 from the event date (each independent event counts once) |
| C — Fading memory | Events (default) or deaths | accrued × ½^(age ÷ half-life); default half-life 150 years, configurable 25–500 |
| D — Recent period | Events (default) or deaths | 1 if the event began within the window (25, 50 or 100 years) before `t` |

Decay in mode C is a storytelling setting, not a mortality estimate. Every state is computed from scratch from the eligible events for the requested year — nothing is "painted" — so pausing, rewinding, jumping and switching modes are all deterministic (tested).

## 5. Casualty figures

Stored per **casualty account** (`data/casualties/casualties.json`): minimum, maximum, optional central value, category (military/civilian/mixed), side, wounded/captured/missing, method, confidence, notes and citations.

- Missing values are `null`. **Unknown is never zero.** Events without a usable figure contribute only to frequency modes and are counted separately as "unknown casualties".
- Contemporary claims judged unreliable are recorded in notes but carry no number (e.g. Orderic Vitalis's 100,000 for the Harrying of the North; chronicle figures for the sack of Berwick, Halidon Hill, the Standard).
- **Display estimate**: lower bound (default, conservative), central (or midpoint of the range), or upper bound. If only one figure exists it is used for all three.
- Crowd-sourced Wikidata death figures are kept only for comparison in the record panel and are never used.

## 6. Double-count prevention

1. Each account has a unique ID; only `preferred` accounts are used (alternatives of the same deaths are ignored).
2. Accounts of one event for different sides are summed (they describe disjoint groups).
3. An **aggregate** account (campaign, multi-town raid, the London Blitz, V-weapons) lists the child accounts it includes. Only the **residual** — aggregate minus the children's selected values, floored at zero — is attributed to the aggregate's own location. If the aggregate's location is unknown, the residual is reported but not mapped.
4. The build rejects an account included in two aggregates; the validator rejects aggregates smaller than their children under any estimate choice.
5. Frequency counts use only events with no child events, so a campaign and its battles are not both counted.

Example: the 1914 coast raid (137 deaths) has accounts for Hartlepool, Scarborough and Whitby; the mapped total of the three towns plus the residual is exactly 137 (tested).

## 7. Colour

`v = log(1 + H/h0) / log(1 + Hmax/h0)`, `h0 = Hmax / R`, with `R` = 1,000 for deaths and 40 for events. `Hmax` is **fixed**: the maximum of the full-dataset cumulative surface for that measure. Colours therefore mean the same thing throughout playback and the stain visibly accumulates; one very large event cannot wash out smaller ones. The palette runs from transparent through pale rose, desaturated terracotta, muted dark red and burgundy to deep crimson (a separate high-contrast palette is provided). Legends report the underlying quantities.

## 8. Totals

The statistics panel gives death totals only as a **range** (sum of lower bounds – sum of upper bounds of de-duplicated accounts), labelled "estimated reported deaths in N events of this dataset", alongside the number of events with unknown casualties. No single total for 1,000 years is presented.

## 9. Known biases

- Casualty data exists for 38 events; medieval figures are rare and the surface is dominated by better-documented later events (Towton's contemporary claim, the Civil Wars, the Jacobite risings, and twentieth-century air raids).
- The London Blitz account is a derived, very-low-confidence range (see its notes) awaiting verification against the official civil defence history.
- Event density reflects the record and the curation effort, which is uneven by period and region.

## 10. Performance

Footprints are pre-computed per event and influence distance; a frame is a sparse weighted sum plus colourisation: ~0.7–2 ms per frame for the full dataset on a laptop CPU. A Web Worker is therefore unnecessary; updates are capped at ~22 per second during playback and skipped when nothing changed.
