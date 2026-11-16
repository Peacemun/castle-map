# Data build report

Generated: 2026-11-16T17:13:53.506Z

## Counts

- castles: 3561
- castlesCurated: 85
- castlesImported: 3476
- castlesDated: 400
- castlesUndated: 3161
- events: 575
- eventsCurated: 264
- eventsImported: 311
- casualtyAccounts: 44
- battlefieldPolygons: 87
- battlefieldPolygonsMatched: 86
- battlefieldPolygonsExcluded: 1
- territories: 34
- transitions: 25
- sources: 55

## Raw datasets

- **he-battlefields** — Historic England, Open Government Licence v3.0, accessed 2026-11-16, 47 records (sha256 3496a677cdd0…)
- **hes-battlefields** — Historic Environment Scotland, Open Government Licence v3.0, accessed 2026-11-16, 40 records (sha256 728be81ca140…)
- **ne-gb** — Natural Earth, Public domain, accessed 2026-11-16, 3 records (sha256 fead216e189b…)
- **wikidata-castles** — Wikidata / Wikimedia Foundation, CC0 1.0, accessed 2026-11-16, 4479 records (sha256 f687095f99de…)
- **wikidata-conflicts** — Wikidata / Wikimedia Foundation, CC0 1.0, accessed 2026-11-16, 1076 records (sha256 0b00c5bac3e9…)

## Warnings (1)

- Curated castle castle-y-bere has no Wikidata match

## Review files

- `review/castles-review.csv` — imported castles excluded or flagged for classification review
- `review/curated-castle-matching.csv` — curated castles matched to Wikidata items
- `review/wikidata-events.csv` — imported Wikidata conflicts and their matching/exclusion
- `review/battlefield-matching.csv` — official battlefield polygons matched to events
- `review/events-without-casualty-data.csv` — curated conflict events with no casualty account (research gaps)
