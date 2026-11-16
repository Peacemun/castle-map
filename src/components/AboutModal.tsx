import { useEffect, useRef, useState } from 'react';
import { useData } from '../app/context';
import { uiStore } from '../state/store';

const TABS = ['About', 'Heatmap method', 'Historical method', 'Sources & licences', 'Coverage', 'Shortcuts'] as const;
type Tab = (typeof TABS)[number];

export function AboutModal() {
  const [tab, setTab] = useState<Tab>('About');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div className="modal-backdrop" onClick={() => uiStore.set({ panel: null })}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="About Castle Map" tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()} data-testid="about-modal">
        <header>
          <h2>Castle Map</h2>
          <button className="close" aria-label="Close" onClick={() => uiStore.set({ panel: null })}>×</button>
        </header>
        <div className="tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>
        <div className="modal-body" role="tabpanel">
          {tab === 'About' && <About />}
          {tab === 'Heatmap method' && <HeatMethod />}
          {tab === 'Historical method' && <HistMethod />}
          {tab === 'Sources & licences' && <SourcesTab />}
          {tab === 'Coverage' && <Coverage />}
          {tab === 'Shortcuts' && <Shortcuts />}
        </div>
      </div>
    </div>
  );
}

function About() {
  return (
    <>
      <p>Castle Map is an interactive historical atlas of England, Wales and Scotland between AD 1000 and AD 2000. It shows when castles were built, where recorded battles, sieges, raids and massacres took place, how political authority changed, and how recorded warfare accumulated across the landscape.</p>
      <p>Press <strong>Play</strong> to watch a thousand years unfold, or pause and explore. Hover over a castle to see its name; click or tap any castle, event or territory for its history, casualty data and sources.</p>
      <p className="notice">This is a dataset, not a complete history. It contains a curated core of sourced records plus larger, lower-confidence imports. Many medieval casualty figures are unknown or unreliable. Absence of a record on the map is not evidence that nothing happened.</p>
      <p>The site has no accounts, tracking or advertising, and runs entirely in your browser. Basemap tiles are requested from OpenFreeMap; everything else is served with the site.</p>
    </>
  );
}

function HeatMethod() {
  return (
    <>
      <h3>Model</h3>
      <p className="formula">H(x, t) = Σ<sub>events</sub> W(e) · K(d(x, e)) · T(t, e)</p>
      <ul>
        <li><strong>W</strong> — the event's de-duplicated casualty quantity (Cumulative deaths) or 1 (Conflict frequency). The fading and recent modes can use either.</li>
        <li><strong>K</strong> — a two-dimensional Gaussian in geographic kilometres with σ = influence distance ÷ 2 (default 15 km → σ 7.5 km), normalised so it integrates to 1. Smoothing redistributes a quantity; it never creates or removes deaths. Units are deaths (or events) per km², shown per 100 km² (or 1,000 km²).</li>
        <li><strong>T</strong> — 1 in cumulative modes; ½<sup>age / half-life</sup> in fading mode (default 150 years); 1 inside the chosen window in recent mode. Events lasting more than a day accrue linearly across their dates.</li>
      </ul>
      <h3>Uncertainty</h3>
      <ul>
        <li>Verified points use the base kernel. Approximate points widen it: σ = √(σ² + (u/2)²) for an uncertainty radius u.</li>
        <li>Events matched to an official Historic England or HES battlefield polygon spread their weight evenly over sample points inside that polygon.</li>
        <li>Disputed sites split the weight between the proposed alternatives (equally unless sources favour one).</li>
        <li>Events with unknown locations, or uncertainty above 75 km, are excluded from the surface and listed under <em>Uncertain</em>.</li>
      </ul>
      <h3>Casualties</h3>
      <ul>
        <li>Figures are stored as minimum, maximum and optional central values with method, confidence and sources. Missing values are <strong>null, never zero</strong>; events with no usable figure are excluded from death layers and counted as unknown.</li>
        <li>Display estimate: lower bound (default), central (or range midpoint) or upper bound. Where only one figure exists, it is used for every choice.</li>
        <li>Contemporary claims considered unreliable (e.g. Orderic Vitalis's 100,000 for the Harrying of the North) are recorded with their text but no number.</li>
      </ul>
      <h3>Double-count prevention</h3>
      <p>Every casualty figure is a uniquely identified account. Aggregate accounts (a campaign, a raid on several towns, the London Blitz) list the child accounts they include; only the residual (aggregate minus children) is mapped at the aggregate's location. Alternative accounts of the same deaths are marked non-preferred and ignored. Frequency mode counts each independent event once and represents campaigns by their component events.</p>
      <h3>Colour</h3>
      <p>Colour intensity uses a logarithmic scale fixed for the whole timeline (the maximum of the full cumulative surface), so the stain genuinely grows as the years pass and a single large event cannot hide smaller ones. Quantities and colours are kept separate; the legend reports quantities.</p>
      <h3>Grid</h3>
      <p>The surface is computed on a ~2 km grid aligned to Web Mercator rows between 49.8°N and 61°N, using great-circle distances. Rendering at closer zoom is smoothed by linear resampling.</p>
    </>
  );
}

function HistMethod() {
  return (
    <>
      <h3>Records and confidence</h3>
      <p><strong>Curated records</strong> (castles, events, casualty accounts, territories) were compiled from the published works cited in each record. They are marked <em>compiled-unverified</em> until checked page-by-page against those works. <strong>Imported records</strong> come from Wikidata (CC0) and are labelled low confidence and unreviewed; their casualty figures are never used.</p>
      <h3>Castles</h3>
      <p>Castles appear at their earliest known construction date. Where that date is a range or approximate, the symbol is faded until the end of the range. A castle never disappears because it was captured, slighted or abandoned; its condition today is shown by its symbol. Construction dates are never inferred from listing or scheduling dates; castles without a known date are "undated" and hidden from the timeline unless you enable them. Imported items classified only as generic "castle", or with inception dates after 1700, are flagged as possible later buildings named "castle".</p>
      <h3>Events</h3>
      <p>A battle near a castle is not treated as an attack on that castle unless sources say so. Campaign itineraries join documented places in order; straight segments are schematic and are not routes.</p>
      <h3>Borders</h3>
      <p>Modern national boundaries are not projected back to AD 1000. Territories are built from coarse schematic zones (for example the Offa's Dyke frontier zone, Lothian, Strathclyde, the Hebrides) clipped to the coastline, each with a date range, authority, confidence and sources. The modern England–Scotland and England–Wales lines are used only from the dates when the historical boundary approximated them (after 1157 and after the Laws in Wales Acts respectively), and are marked approximate. Territory colours change at documented dates; borders are not animated as if moving continuously. Fluctuating control (for example the Welsh recoveries of the twelfth century or occupation during the Wars of Independence) is described in notes rather than drawn.</p>
      <h3>Disagreement</h3>
      <p>Where sources disagree about a date, site or figure, the disagreement is recorded in the event rather than resolved silently.</p>
    </>
  );
}

function SourcesTab() {
  const data = useData();
  const sources = [...data.sources.values()];
  return (
    <>
      <h3>Map data</h3>
      <ul>
        <li>Basemap tiles: <a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer">OpenFreeMap</a> (free, no key), © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener noreferrer">OpenMapTiles</a>, data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a> (ODbL). The online basemap depends on this service; a simplified local coastline is used if it is unavailable.</li>
        <li>Shaded relief and coastline: Natural Earth (public domain).</li>
        <li>Map rendering: MapLibre GL JS (BSD-3-Clause).</li>
      </ul>
      <h3>Downloaded datasets</h3>
      <ul>
        {data.meta.rawDatasets.map((r) => (
          <li key={r.id}><strong>{r.publisher}</strong> — {r.licence}; accessed {r.accessed}; {r.records} records. <span className="muted">{r.attribution}</span></li>
        ))}
      </ul>
      <h3>Reference register ({sources.length})</h3>
      <ul className="source-register">
        {sources.map((s) => (
          <li key={s.id}>
            {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a> : <cite>{s.title}</cite>}
            {s.author ? ` — ${s.author}` : ''}{s.publicationDate ? ` (${s.publicationDate})` : ''}. <span className="muted">{s.publisher}{s.licence ? ` · ${s.licence}` : ''}{s.accessDate ? ` · accessed ${s.accessDate}` : ''}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function Coverage() {
  const data = useData();
  const c = data.meta.counts;
  return (
    <>
      <p>Data build: {new Date(data.meta.generatedAt).toLocaleDateString('en-GB')}.</p>
      <ul>
        <li>{c.castles?.toLocaleString('en-GB')} castle records: {c.castlesCurated} curated, {c.castlesImported?.toLocaleString('en-GB')} imported from Wikidata; {c.castlesDated} dated, {c.castlesUndated?.toLocaleString('en-GB')} undated.</li>
        <li>{c.events} events: {c.eventsCurated} curated, {c.eventsImported} imported from Wikidata.</li>
        <li>{c.casualtyAccounts} casualty accounts.</li>
        <li>{c.battlefieldPolygonsMatched} of {c.battlefieldPolygons} official battlefield polygons linked to events{c.battlefieldPolygonsExcluded ? ` (${c.battlefieldPolygonsExcluded} outside AD 1000–2000 excluded)` : ''}.</li>
        <li>{c.territories} territory periods and {c.transitions} documented transitions.</li>
      </ul>
      <h3>Known gaps</h3>
      <ul>
        <li>Most castles have no construction date in open data; only dated castles appear on the timeline.</li>
        <li>Medieval casualty figures exist for few events; many chronicle figures are unreliable and are deliberately excluded. The death surface is therefore dominated by better-documented later events and should not be read as a measure of medieval violence.</li>
        <li>Official registers (Historic England NHLE, Canmore, Coflein, Cof Cymru) are not yet bulk-imported for castles; Wikidata provides identifiers for many.</li>
        <li>Welsh political geography before 1283 and Scottish internal lordships are shown only as coarse schematic zones.</li>
        <li>Curated records have not yet been checked page-by-page against their cited works.</li>
        <li>Conflicts outside Great Britain, at sea far offshore, and in Northern Ireland are out of scope.</li>
      </ul>
    </>
  );
}

function Shortcuts() {
  const rows = [
    ['Space', 'Play / pause'],
    ['← / →', 'Back / forward one year (Shift: ten years)'],
    ['Home / End', 'AD 1000 / AD 2000'],
    ['/', 'Search'],
    ['F', 'Fullscreen'],
    ['R', 'Reset view to the whole of Britain'],
    ['Esc', 'Close panel or selection'],
  ];
  return (
    <table className="compare">
      <tbody>{rows.map(([k, v]) => <tr key={k}><th scope="row"><kbd>{k}</kbd></th><td>{v}</td></tr>)}</tbody>
    </table>
  );
}
