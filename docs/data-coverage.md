# Data coverage and research gaps

*Figures from the data build of 16 November 2026 (`public/data/meta.json`). Regenerate with `npm run data:build`; detailed review files are in `data/processed/`.*

**Software features are complete; historical coverage is not.** This page states what the dataset contains, how reliable it is, and what is missing.

## Castles — 3,561 records

| | Count |
| --- | --- |
| Curated (sourced, with summaries, phases, control changes) | 85 |
| Imported from Wikidata (CC0), unreviewed | 3,476 |
| With a construction date (placed on the timeline) | 400 |
| Undated (hidden from the timeline unless enabled) | 3,161 |
| By modern country | England 1,528 · Scotland 1,069 · Wales 964 |
| Flagged for classification review | 2,037 (mostly generic "castle" class in Wikidata) |

All 20 castles named in the specification are curated (Tower of London, Warwick, Bamburgh, Dover, Windsor, Alnwick, York; Edinburgh, Stirling, Urquhart, Dunnottar, Caerlaverock, Bothwell; Caernarfon, Conwy, Harlech, Beaumaris, Pembroke, Caerphilly, Chepstow), plus 65 others chosen for geographic spread and their roles in recorded conflicts.

**Gaps**
- Construction dates exist for only ~11% of castle records. Dating the rest requires the national registers (NHLE, Canmore, Coflein) and the standard gazetteers (King's *Castellarium Anglicanum*; Tabraham), entry by entry.
- Wikidata classification is coarse; 2,035 records are "castle (unspecified)" and some are later country houses named "castle". These are flagged, not removed.
- No bulk import yet from Historic England scheduled monuments, HES designations or Welsh designations (see [data-sources.md](data-sources.md)).
- Owners/controlling authorities and control changes are recorded only for curated castles.

## Conflict events — 575 records

| | Count |
| --- | --- |
| Curated (narrative, participants, outcome, sources) | 264 |
| — battles 126 · sieges 70 · air raids 17 · campaigns 16 · rebellions 12 · raids 10 · massacres 8 · skirmishes 4 · political change 1 |  |
| — by century (11th→20th) | 35 · 17 · 35 · 26 · 38 · 17 · 59 · 11 · 4 · 22 |
| — by country | England 146 · Scotland 70 · Wales 43 · cross-border 5 |
| Imported from Wikidata (date + coordinates only) | 311 (253 battles, 53 sieges, 4 massacres, 1 rebellion) |
| Linked to an official battlefield polygon | 85 events; all 86 Historic England / HES register polygons within AD 1000–2000 are linked (Maldon, 991, is excluded as out of range) |

All 18 reference events in the specification are included.

**Gaps**
- Many smaller documented actions (especially Anglo-Welsh warfare 1067–1283, Border reiving, Highland clan warfare) are represented only by Wikidata imports without narratives, or not at all.
- Wikidata imports have not been reviewed; some dates or coordinates may be wrong. See `data/processed/review/wikidata-events.csv`.
- 1750–2000 coverage focuses on violence within Great Britain (Fishguard, Peterloo, Merthyr, Newport, First and Second World War air raids). Terrorism, riots (beyond those listed) and wartime deaths of British people outside Britain are out of scope.

## Casualties — 44 accounts for 38 events

- Usable casualty figures exist for **38 events**; **193 curated battles, sieges, raids, massacres and air raids have no usable figure** (listed in `data/processed/review/events-without-casualty-data.csv`) and are treated as unknown.
- Medieval coverage is thin by design: chronicle figures are frequently rhetorical and are recorded as text without numbers (Harrying of the North, sack of Berwick, the Standard, Halidon Hill, Fornham). Towton's 28,000 is stored as a contemporary claim (upper bound only).
- Several twentieth-century figures and the derived London Blitz range are marked low or very low confidence and need checking against official sources (O'Brien 1955; CWGC Civilian War Dead roll).
- No account has yet been checked page-by-page.

**Consequence.** The cumulative death surface is dominated by better-documented later events. It must not be read as a measure of how violent each period was; use the conflict-frequency mode for that comparison, bearing in mind uneven curation.

## Territories — 34 periods, 11 authorities, 25 transitions

- Kingdoms of England and Scotland, Strathclyde/Cumbria, Welsh kingdoms and principalities, Anglo-Norman March, English Crown in Wales, Kingdom of the Isles, Earldom of Orkney, Commonwealth, Kingdom of Great Britain, United Kingdom.
- Before 1157 (Anglo-Scottish) and 1536 (Anglo-Welsh), boundaries are **schematic zones** with low confidence.

**Gaps**
- No internal Welsh kingdoms (Gwynedd, Powys, Deheubarth…) or individual marcher lordships; no Scottish provincial lordships (Moray, Galloway, the Lordship of the Isles as a separate polity).
- Fluctuations (Welsh recoveries, English occupation of southern Scotland 1296–1314 and 1333–c.1340s, Glyndŵr's revolt, Berwick) are described in notes, not mapped.
- Defensible polygon sources for these (e.g. digitised Rees 1959 and McNeill & MacQueen 1996 maps) would be required.

## Priority research tasks

1. Verify curated records page-by-page and add `pages` to citations; upgrade to `source-checked`.
2. Import Historic England scheduled monuments, HES designations and DataMapWales designations; classify castle records; add construction dates from authoritative descriptions.
3. Review Wikidata conflict imports and write narratives for the most significant.
4. Extend casualty accounts where modern scholarship provides defensible ranges (e.g. Civil War sieges via Carlton 1992; Second World War city totals via CWGC).
5. Digitise documented medieval boundary maps to replace schematic zones where defensible.
