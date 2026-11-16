# Data sources and licences

This register lists every dataset downloaded by the import pipeline and every published reference cited by records. The machine-readable register is `data/sources/sources.json`; download provenance (URL, licence, access date, SHA-256) is in `data/raw/manifest.json`.

## Downloaded open datasets

| Dataset | Publisher | Licence | Accessed | Records | Attribution required |
| --- | --- | --- | --- | --- | --- |
| he-battlefields (historic-england-registered-battlefields.geojson) | Historic England | Open Government Licence v3.0 | 2026-11-16 | 47 | Contains Historic England data © Historic England 2026. Contains Ordnance Survey data © Crown copyright and database right 2026. |
| hes-battlefields (hes-inventory-battlefields.geojson) | Historic Environment Scotland | Open Government Licence v3.0 | 2026-11-16 | 40 | Contains Historic Environment Scotland and Ordnance Survey data © Historic Environment Scotland — Scottish Charity No. SC045925 © Crown copyright and database right 2026. |
| ne-gb (naturalearth-gb-map-units.geojson) | Natural Earth | Public domain | 2026-11-16 | 3 | Made with Natural Earth. Free vector and raster map data @ naturalearthdata.com. |
| wikidata-castles (wikidata-castles.json) | Wikidata / Wikimedia Foundation | CC0 1.0 | 2026-11-16 | 4479 | Wikidata (CC0). |
| wikidata-conflicts (wikidata-conflicts.json) | Wikidata / Wikimedia Foundation | CC0 1.0 | 2026-11-16 | 1076 | Wikidata (CC0). |

Query URLs and SPARQL queries are in `scripts/import/fetch-sources.ts`.

## Map tiles and software (runtime)

| Resource | Licence / terms | Notes |
| --- | --- | --- |
| OpenFreeMap vector tiles, fonts and Natural Earth relief tiles (tiles.openfreemap.org) | Free, no API key; data © OpenMapTiles, © OpenStreetMap contributors (ODbL) | The online basemap depends on this service. If it is unavailable the app falls back to the bundled simplified coastline (`public/data/land.geojson`). |
| MapLibre GL JS | BSD-3-Clause | Bundled |
| React, Zod | MIT | Bundled |
| EB Garamond, Source Sans 3 (@fontsource) | SIL Open Font License 1.1 | Self-hosted; no requests to Google |

## Sources investigated but not bulk-imported

| Source | Reason |
| --- | --- |
| Historic England NHLE scheduled monuments / listed buildings | Open (OGL) and suitable; not yet imported because records describe designations rather than construction dates and need careful castle classification. Next step for England. |
| Canmore (HES) | Reference use only; no open bulk API terms identified for full records. Identifiers are linked via Wikidata. |
| Cadw / Cof Cymru, DataMapWales, Coflein, Heneb HERs | Not yet imported; Wales designations are available via DataMapWales (OGL) and are the recommended next import for Welsh castles. |
| HES scheduled monuments | Available (OGL) via the same HES service used for battlefields; not yet imported for the same classification reason as NHLE. |
| Battlefields Trust UK Battlefields Resource Centre | Reference only (website). |

No source was scraped, and no protected resource was accessed outside its published API.

## Reference register

### Official registers

- `src-he-nhle` — *National Heritage List for England* (Historic England) <https://historicengland.org.uk/listing/the-list/> — Open Government Licence v3.0 (data)
- `src-hes-portal` — *Historic Environment Scotland Portal (designations)* (Historic Environment Scotland) <https://portal.historicenvironment.scot/> — Open Government Licence v3.0 (data)
- `src-canmore` — *Canmore — National Record of the Historic Environment* (Historic Environment Scotland) <https://canmore.org.uk/>
- `src-coflein` — *Coflein — National Monuments Record of Wales* (Royal Commission on the Ancient and Historical Monuments of Wales) <https://coflein.gov.uk/>

### Datasets

- `src-he-battlefields` — *Registered Battlefields (NHLE open data, layer 8)* (Historic England) <https://services-eu1.arcgis.com/ZOdPfBS3aqqDYPUQ/arcgis/rest/services/National_Heritage_List_for_England_NHLE_v02_VIEW/FeatureServer/8> — Open Government Licence v3.0 — accessed 2026-11-16
- `src-hes-battlefields` — *Inventory of Historic Battlefields (HES designations, layer 3)* (Historic Environment Scotland) <https://inspire.hes.scot/arcgis/rest/services/HES/HES_Designations/MapServer/3> — Open Government Licence v3.0 — accessed 2026-11-16
- `src-wikidata` — *Wikidata* (Wikimedia Foundation) <https://www.wikidata.org/> — CC0 1.0 — accessed 2026-11-16
- `src-naturalearth` — *Admin 0 – Map Units, 1:10m* (Natural Earth) <https://www.naturalearthdata.com/> — Public domain — accessed 2026-11-16

### Primary sources and legislation

- `src-asc` — M. Swanton (trans. and ed.), The Anglo-Saxon Chronicle (London: J. M. Dent, 1996).
- `src-orderic` — M. Chibnall (ed. and trans.), The Ecclesiastical History of Orderic Vitalis, 6 vols (Oxford: Clarendon Press, 1969–80).
- `src-poitiers` — R. H. C. Davis and M. Chibnall (eds and trans.), The Gesta Guillelmi of William of Poitiers (Oxford: Clarendon Press, 1998).
- `src-cromwell-letters` — T. Carlyle (ed.), Oliver Cromwell's Letters and Speeches (London, 1845); includes Cromwell's dispatches after Dunbar (1650) and Worcester (1651).
- `src-legislation` — *legislation.gov.uk (historical Acts)* (The National Archives) <https://www.legislation.gov.uk/> — Open Government Licence v3.0

### Books

- `src-stenton` — F. M. Stenton, Anglo-Saxon England, 3rd edn (Oxford, 1971).
- `src-hill-atlas` — D. Hill, An Atlas of Anglo-Saxon England (Oxford: Blackwell, 1981).
- `src-woolf` — A. Woolf, From Pictland to Alba, 789–1070 (Edinburgh, 2007).
- `src-duncan` — A. A. M. Duncan, Scotland: The Making of the Kingdom (Edinburgh, 1975).
- `src-mcneill-atlas` — P. G. B. McNeill and H. L. MacQueen (eds), Atlas of Scottish History to 1707 (Edinburgh, 1996).
- `src-rees-atlas` — W. Rees, An Historical Atlas of Wales from Early to Modern Times, new edn (London: Faber, 1959).
- `src-davies-conquest` — R. R. Davies, The Age of Conquest: Wales 1063–1415 (Oxford, 1991).
- `src-davies-glyndwr` — R. R. Davies, The Revolt of Owain Glyn Dŵr (Oxford, 1995).
- `src-barrow-bruce` — G. W. S. Barrow, Robert Bruce and the Community of the Realm of Scotland, 4th edn (Edinburgh, 2005).
- `src-prestwich-edward` — M. Prestwich, Edward I (New Haven and London: Yale University Press, 1997).
- `src-taylor-welsh-castles` — A. J. Taylor, The Welsh Castles of Edward I (London: Hambledon, 1986).
- `src-king-castellarium` — D. J. Cathcart King, Castellarium Anglicanum, 2 vols (New York: Kraus, 1983).
- `src-goodall` — J. Goodall, The English Castle 1066–1650 (New Haven and London: Yale University Press, 2011).
- `src-brown-castles` — R. A. Brown, English Castles, 3rd edn (London: Batsford, 1976).
- `src-tabraham` — C. Tabraham, Scotland's Castles, rev. edn (London: Batsford, 2005).
- `src-crouch-stephen` — D. Crouch, The Reign of King Stephen, 1135–1154 (Harlow: Longman, 2000).
- `src-maddicott` — J. R. Maddicott, Simon de Montfort (Cambridge, 1994).
- `src-carpenter-minority` — D. A. Carpenter, The Minority of Henry III (London: Methuen, 1990).
- `src-goodman-wor` — A. Goodman, The Wars of the Roses: Military Activity and English Society, 1452–97 (London, 1981).
- `src-boardman-towton` — A. W. Boardman, The Battle of Towton (Stroud: Sutton, 1994).
- `src-foard-curry-bosworth` — G. Foard and A. Curry, Bosworth 1485: A Battlefield Rediscovered (Oxford: Oxbow, 2013).
- `src-barr-flodden` — N. Barr, Flodden 1513 (Stroud: Tempus, 2001).
- `src-carlton` — C. Carlton, Going to the Wars: The Experience of the British Civil Wars, 1638–1651 (London: Routledge, 1992).
- `src-woolrych` — A. Woolrych, Britain in Revolution, 1625–1660 (Oxford, 2002).
- `src-foard-naseby` — G. Foard, Naseby: The Decisive Campaign (Whitstable: Pryor, 1995).
- `src-newman-marston` — P. R. Newman and P. R. Roberts, Marston Moor 1644: The Battle of the Five Armies (Pickering: Blackthorn, 2003).
- `src-hopkins-glencoe` — P. Hopkins, Glencoe and the End of the Highland War (Edinburgh: John Donald, 1986).
- `src-duffy-45` — C. Duffy, The '45 (London: Cassell, 2003).
- `src-szechi-1715` — D. Szechi, 1715: The Great Jacobite Rebellion (New Haven and London, 2006).
- `src-poole-peterloo` — R. Poole, Peterloo: The English Uprising (Oxford, 2019).
- `src-jones-newport` — D. J. V. Jones, The Last Rising: The Newport Insurrection of 1839 (Oxford, 1985).
- `src-jones-war-in-air` — H. A. Jones, The War in the Air, vols 3 and 5 (Oxford: Clarendon Press, 1931, 1935).
- `src-corbett-naval-ops` — J. S. Corbett, Naval Operations, vol. 2 (London: Longmans, 1921).
- `src-obrien-civil-defence` — T. H. O'Brien, Civil Defence (London: HMSO, 1955).
- `src-gardiner-blitz` — J. Gardiner, The Blitz: The British Under Attack (London: HarperPress, 2010).
- `src-lynch` — M. Lynch, Scotland: A New History (London: Century, 1991).
- `src-williams-norman` — A. Williams, The English and the Norman Conquest (Woodbridge: Boydell, 1995).
- `src-kapelle` — W. E. Kapelle, The Norman Conquest of the North (Chapel Hill, 1979).

### Articles

- `src-dobson-york-1190` — R. B. Dobson, The Jews of Medieval York and the Massacre of March 1190, Borthwick Papers 45 (York, 1974).

### Websites

- `src-cadw` — *Cadw — monuments in care and Cof Cymru designations* (Cadw (Welsh Government)) <https://cadw.gov.wales/>
- `src-battlefields-trust` — *UK Battlefields Resource Centre* (The Battlefields Trust) <https://www.battlefieldstrust.com/resource-centre/>
- `src-cwgc` — *Civilian War Dead Roll of Honour* (Commonwealth War Graves Commission) <https://www.cwgc.org/>

Books and articles are cited at work level; page-level citations (`pages`) are to be added when records are verified.
