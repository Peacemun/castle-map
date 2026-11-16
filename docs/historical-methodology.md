# Historical methodology

## Principles

1. **Never fabricate.** Unknown dates, places and figures are recorded as unknown (`null`), not guessed.
2. **Cite everything.** Every castle, event, casualty account, territory, authority and transition must cite at least one entry in the source register (`data/sources/sources.json`).
3. **Grade confidence.** Each record has a `confidence` (high / medium / low / very-low) and a `verification` status.
4. **Preserve disagreement.** Disputed dates, sites and figures are recorded as such (`disputed`, `alternatives`, `disagreements`) rather than resolved silently.
5. **Separate the record from its display.** Casualty quantities are stored as ranges; colour scaling, smoothing and decay are visual choices documented in [heatmap-methodology.md](heatmap-methodology.md).

## Verification status

| Status | Meaning |
| --- | --- |
| `source-checked` | Checked page-by-page against the cited work(s). *No records have this status yet.* |
| `compiled-unverified` | Curated record compiled from standard published references (cited), but not yet checked page-by-page. All curated records currently have this status, and the UI says so. |
| `imported-unreviewed` | Imported automatically from an open dataset (Wikidata) and not reviewed by a person. |

Curated records were compiled during AI-assisted development from widely published scholarship. They are intended to be accurate at the level of detail given, but the honest status is "unverified" until a researcher checks them against the cited pages. Upgrading records to `source-checked` is the main research task outstanding (see [data-coverage.md](data-coverage.md)).

## Castles

- **Definition.** Castles in the sense used by Historic England, HES and Cadw: fortified lordly residences and royal fortresses (motte-and-bailey, ringwork, enclosure, keep, concentric, quadrangular castles; Welsh native castles; tower houses and peel towers where so classified). Hillforts, Roman forts, barracks and Martello towers are excluded by name at import. "Fortified manor houses" are kept but classified separately.
- **Appearance date.** A castle appears at the start of its earliest known construction date or range, and is faded until the end of that range. Construction dates are **never inferred from listing or scheduling dates**.
- **Undated sites** (most imported records) are not placed on the timeline; they can be shown at all dates with a distinct hollow symbol when "Undated castle records" is enabled.
- **Persistence.** A castle never disappears because it was captured, slighted or abandoned. Its symbol reflects its condition today (surviving, ruin, lost/earthworks); destruction and slighting dates appear in its record.
- **Imports.** Wikidata items classified only as generic "castle", items with inception dates after 1700 (often later houses named "castle" or rebuild dates) and items whose names suggest a house or hall are flagged for review (`reviewFlags`) and listed in `data/processed/review/castles-review.csv`.
- **Deduplication.** Curated castles are matched to Wikidata items within 4 km by name similarity; matched items contribute identifiers (Wikidata, NHLE, Canmore, Cadw) and, if within 1.5 km, coordinates. Wikidata items within 0.5 km with the same name are merged.

## Events

- Types: battle, siege, raid, skirmish, rebellion, campaign, massacre (documented violence against civilians or prisoners), air raid, political change.
- **Dates** are partial ISO dates with precision; ranges are used for multi-day sieges and campaigns. Old Style / New Style calendar differences are not normalised; dates are as given by the cited sources.
- **Locations** carry an explicit kind (verified point, approximate point with uncertainty radius, area, disputed alternatives, multiple, unknown). Where an official battlefield register polygon exists (Historic England Register of Historic Battlefields; HES Inventory of Historic Battlefields) it replaces the curated point. Numbered HES entries ("Dunbar I/II", "Falkirk II", "Inverlochy I/II") are matched by an explicit override table because the register gives no dates.
- **Castle links** are made only where sources describe an attack on, siege of, or action at that castle. A battle near a castle is not treated as an attack on it.
- **Hierarchy.** Battles and sieges link to their parent campaign/war (`parentId`) so that statistics and the heatmap can avoid double counting.
- **Itineraries** (William I in 1066, Edward I in Scotland in 1296, the Jacobite army in 1745–46) connect documented places in order. Segments are schematic straight lines, labelled as such, and are not routes.
- **Imports.** Wikidata conflicts are clipped to within 12 km of Great Britain's coast, matched to curated events (name similarity, date, distance) and otherwise imported with dates and coordinates only. Their casualty figures are not used.

## Territories and borders

- Territories are built at build time from **named geographic units**: modern Natural Earth country outlines (used as a geographic convenience only where the historical boundary approximated them) and coarse **schematic zones** (`data/territories/zones.json`) such as the Offa's Dyke frontier zone, Lothian, Strathclyde/Cumbria, the Hebrides, Caithness and the south Wales March, each with a stated basis. Every zone is intersected with the coastline.
- **Modern borders are not projected backwards.** The modern England–Scotland line is used from 1157 (return of the northern counties; confirmed by the Treaty of York, 1237); the modern England–Wales line only from the Laws in Wales Acts (1536–43). Before those dates, schematic zones are used and labelled.
- Each territory has an authority, validity years, boundary status (`documented-approximate`, `schematic`, `disputed`), confidence, notes and sources. Status is shown on the map (solid, dashed, dotted edges) and in the legend.
- **Transitions** happen at documented dates (`transitions.json`) and are shown as colour changes, not animated border movement. Short-lived or fluctuating control (the Welsh recoveries of the twelfth century, English occupation during the Wars of Independence, Glyndŵr's revolt, Berwick's many changes of hands, the Debatable Land) is described in notes rather than drawn.
- Territories never overlap in any year (checked by the build).

## Frontiers and Conflict

The analytical overlay is exploratory. Spatial association between recorded conflict and documented frontiers does not establish causation: borders were also shaped by treaties, law, succession and inheritance, church and royal administration, landholding, geography and negotiation. The UI states this whenever the overlay is active.

## Wording

The interface uses "recorded", "documented" and "in this dataset" deliberately, and never claims completeness ("all wars in Britain"). Narrative text is factual and avoids sensational language.
