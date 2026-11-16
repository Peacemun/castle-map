import { useMemo } from 'react';
import { useApp, useData } from '../app/context';
import { computeStats } from '../historical-data/stats';
import { spatialSamples, CONFLICT_TYPES } from '../heatmap/model';
import { selectEstimate } from '../heatmap/accounting';
import { formatHistoricalDate } from '../historical-data/dates';
import { heatEventPasses } from '../state/filters';
import {
  ALL_EVENT_TYPES,
  openPanel,
  select,
  setFilters,
  setHeat,
  setLayer,
  timeStore,
  uiStore,
  useStore,
  type Country,
  type Layers,
} from '../state/store';
import { ERAS, playback } from '../timeline/playback';
import { HeatLegend } from './Legend';
import type { HeatSettings } from '../heatmap/engine';

function Panel({ title, children, id }: { title: string; children: React.ReactNode; id: string }) {
  return (
    <aside className="side-panel" aria-label={title} data-testid={`panel-${id}`}>
      <header>
        <h2>{title}</h2>
        <button className="close" aria-label={`Close ${title}`} onClick={() => uiStore.set({ panel: null })}>×</button>
      </header>
      <div className="panel-scroll">{children}</div>
    </aside>
  );
}

function Toggle({ k, label, hint, disabled }: { k: keyof Layers; label: string; hint?: string; disabled?: boolean }) {
  const on = useStore(uiStore, (s) => s.layers[k]);
  return (
    <label className={`toggle ${disabled ? 'disabled' : ''}`}>
      <input type="checkbox" checked={on} disabled={disabled} onChange={(e) => setLayer(k, e.target.checked)} data-testid={`layer-${k}`} />
      <span>{label}</span>
      {hint && <small>{hint}</small>}
    </label>
  );
}

const TYPE_LABEL: Record<string, string> = {
  battle: 'Battles',
  siege: 'Sieges',
  raid: 'Raids',
  skirmish: 'Skirmishes',
  rebellion: 'Rebellions',
  campaign: 'Campaigns',
  massacre: 'Massacres & civilian violence',
  'air-raid': 'Air raids',
  'political-change': 'Political changes',
};

function LayersPanel() {
  const data = useData();
  const filters = useStore(uiStore, (s) => s.filters);
  const castlesOn = useStore(uiStore, (s) => s.layers.castles);
  const narration = useStore(uiStore, (s) => s.narration);
  const follow = useStore(uiStore, (s) => s.followCamera);
  const reduced = useStore(uiStore, (s) => s.reducedMotion);
  const undatedCount = data.castles.filter((c) => c.t0 === null).length;
  const toggleCountry = (c: Country) => setFilters({ countries: filters.countries.includes(c) ? filters.countries.filter((x) => x !== c) : [...filters.countries, c] });
  const toggleType = (t: (typeof ALL_EVENT_TYPES)[number]) => setFilters({ eventTypes: filters.eventTypes.includes(t) ? filters.eventTypes.filter((x) => x !== t) : [...filters.eventTypes, t] });
  return (
    <Panel title="Layers & filters" id="layers">
      <fieldset>
        <legend>Castles</legend>
        <Toggle k="castles" label="Castles" />
        <Toggle k="surviving" label="Surviving castles" disabled={!castlesOn} />
        <Toggle k="ruinedLost" label="Ruined and lost castles" disabled={!castlesOn} />
        <Toggle k="undated" label={`Undated castle records (${undatedCount.toLocaleString('en-GB')})`} hint="No known construction date; shown at every date when enabled" disabled={!castlesOn} />
        <Toggle k="castleNames" label="Castle names" disabled={!castlesOn} />
      </fieldset>
      <fieldset>
        <legend>Conflict</legend>
        <Toggle k="battles" label="Battles and skirmishes" />
        <Toggle k="sieges" label="Sieges" />
        <Toggle k="otherEvents" label="Raids, rebellions, massacres, campaigns, air raids" />
        <Toggle k="campaigns" label="Campaign itineraries" hint="Documented places only; segments are schematic" />
        <Toggle k="battlefields" label="Registered battlefield areas" hint="Visible when zoomed in" />
        <Toggle k="majorEvents" label="Major event labels and narration" />
      </fieldset>
      <fieldset>
        <legend>Authority and heat</legend>
        <Toggle k="territories" label="Political territories" />
        <Toggle k="boundaries" label="Historical boundaries" />
        <Toggle k="heatmap" label="Casualty / conflict heatmap" />
      </fieldset>
      <fieldset>
        <legend>Filter by country (modern)</legend>
        {(['England', 'Scotland', 'Wales'] as Country[]).map((c) => (
          <label key={c} className="toggle"><input type="checkbox" checked={filters.countries.includes(c)} onChange={() => toggleCountry(c)} /><span>{c}</span></label>
        ))}
        <p className="muted small">Uses the modern country in which a site lies, for convenience only.</p>
      </fieldset>
      <fieldset>
        <legend>Filter by event type</legend>
        {ALL_EVENT_TYPES.map((t) => (
          <label key={t} className="toggle"><input type="checkbox" checked={filters.eventTypes.includes(t)} onChange={() => toggleType(t)} /><span>{TYPE_LABEL[t]}</span></label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Filter by century</legend>
        <div className="row">
          <label>From
            <select value={filters.centuries[0]} onChange={(e) => setFilters({ centuries: [Number(e.target.value), Math.max(Number(e.target.value), filters.centuries[1])] })}>
              {Array.from({ length: 10 }, (_, i) => 11 + i).map((c) => <option key={c} value={c}>{c}th c.</option>)}
            </select>
          </label>
          <label>To
            <select value={filters.centuries[1]} onChange={(e) => setFilters({ centuries: [Math.min(Number(e.target.value), filters.centuries[0]), Number(e.target.value)] })}>
              {Array.from({ length: 10 }, (_, i) => 11 + i).map((c) => <option key={c} value={c}>{c}th c.</option>)}
            </select>
          </label>
        </div>
      </fieldset>
      <fieldset>
        <legend>Data</legend>
        <label className="toggle"><input type="checkbox" checked={filters.imported} onChange={(e) => setFilters({ imported: e.target.checked })} /><span>Include unreviewed imported records (Wikidata)</span></label>
      </fieldset>
      <fieldset>
        <legend>Presentation</legend>
        <label className="toggle"><input type="checkbox" checked={narration} onChange={(e) => uiStore.set({ narration: e.target.checked })} /><span>Narration cards</span></label>
        <label className="toggle"><input type="checkbox" checked={follow} onChange={(e) => uiStore.set({ followCamera: e.target.checked })} /><span>Move camera to major events during playback</span></label>
        <label className="toggle"><input type="checkbox" checked={reduced} onChange={(e) => uiStore.set({ reducedMotion: e.target.checked })} /><span>Reduce motion</span></label>
      </fieldset>
    </Panel>
  );
}

function HeatmapPanel() {
  const heat = useStore(uiStore, (s) => s.heat);
  const frontiers = useStore(uiStore, (s) => s.frontiers);
  const modes: { id: HeatSettings['mode']; label: string; desc: string }[] = [
    { id: 'cumulative', label: 'A · Cumulative deaths', desc: 'Accumulated recorded or estimated deaths up to the current year. Earlier deaths remain.' },
    { id: 'frequency', label: 'B · Conflict frequency', desc: 'Where recorded military events concentrate. Each independent event counts once; campaigns are represented by their component events. Not a death count.' },
    { id: 'fading', label: 'C · Fading memory', desc: 'Intensity halves every half-life. A storytelling setting, not a mortality estimate.' },
    { id: 'recent', label: 'D · Recent period', desc: 'Only events within a window before the current date.' },
  ];
  return (
    <Panel title={frontiers ? 'Frontiers & Conflict' : 'Heatmap'} id="heatmap">
      {frontiers && (
        <div className="method-note" data-testid="frontiers-note">
          <h3>Frontiers and Conflict</h3>
          <p>This view places documented historical boundaries (bold lines) over the conflict surface. Castles within 25 km of a frontier between different authorities are ringed in gold; blue rings grow each time a castle's recorded control changed.</p>
          <p><strong>Method note.</strong> A spatial association between conflict and frontiers does not show that fighting caused a boundary. Historic boundaries were also shaped by treaties, law, inheritance and succession, church and royal administration, landholding, geography and negotiation. Many boundaries here are schematic, and the conflict record is incomplete and biased towards well-documented events.</p>
          <button className="link" onClick={() => uiStore.set({ frontiers: false })}>Leave Frontiers view</button>
        </div>
      )}
      <fieldset>
        <legend>Mode</legend>
        {modes.map((m) => (
          <label key={m.id} className="radio">
            <input type="radio" name="heat-mode" checked={heat.mode === m.id} onChange={() => setHeat({ mode: m.id })} data-testid={`heat-${m.id}`} />
            <span>{m.label}</span>
            <small>{m.desc}</small>
          </label>
        ))}
      </fieldset>
      {(heat.mode === 'fading' || heat.mode === 'recent') && (
        <fieldset>
          <legend>Measure</legend>
          <label className="radio"><input type="radio" name="measure" checked={heat.memoryMeasure === 'events'} onChange={() => setHeat({ memoryMeasure: 'events' })} /><span>Recorded events</span></label>
          <label className="radio"><input type="radio" name="measure" checked={heat.memoryMeasure === 'deaths'} onChange={() => setHeat({ memoryMeasure: 'deaths' })} /><span>Recorded deaths</span></label>
        </fieldset>
      )}
      {heat.mode === 'fading' && (
        <label className="slider-field">Half-life: <strong>{heat.halfLifeYears} years</strong>
          <input type="range" min={25} max={500} step={25} value={heat.halfLifeYears} onChange={(e) => setHeat({ halfLifeYears: Number(e.target.value) })} />
        </label>
      )}
      {heat.mode === 'recent' && (
        <fieldset>
          <legend>Window</legend>
          <div className="segmented">
            {[25, 50, 100].map((w) => <button key={w} className={heat.windowYears === w ? 'on' : ''} aria-pressed={heat.windowYears === w} onClick={() => setHeat({ windowYears: w })}>{w} years</button>)}
          </div>
        </fieldset>
      )}
      <fieldset>
        <legend>Casualty estimate used</legend>
        {(['low', 'central', 'high'] as const).map((e) => (
          <label key={e} className="radio"><input type="radio" name="estimate" checked={heat.estimate === e} onChange={() => setHeat({ estimate: e })} />
            <span>{e === 'low' ? 'Lower bound (default, conservative)' : e === 'central' ? 'Central estimate (or range midpoint)' : 'Upper bound'}</span>
          </label>
        ))}
      </fieldset>
      <label className="slider-field">Spatial influence distance: <strong>{heat.influenceKm} km</strong>
        <input type="range" min={5} max={40} step={1} value={heat.influenceKm} onChange={(e) => setHeat({ influenceKm: Number(e.target.value) })} />
        <small>Visual smoothing radius, not the area in which deaths occurred.</small>
      </label>
      <HeatLegend />
      <p className="muted small">See About → Heatmap method for the formula, uncertainty handling and double-count prevention.</p>
    </Panel>
  );
}

const fmt = (n: number) => n.toLocaleString('en-GB');

function StatsPanel() {
  const data = useData();
  const yi = useStore(timeStore, (s) => Math.floor(s.year));
  const filters = useStore(uiStore, (s) => s.filters);
  const stats = useMemo(() => computeStats(data, yi + 0.9999, (e) => heatEventPasses(e, filters), ERAS), [data, yi, filters]);
  return (
    <Panel title={`Recorded in this dataset to AD ${yi}`} id="stats">
      <p className="notice small">These figures describe only the records in this dataset. They are not totals for all castles, wars or deaths in British history.</p>
      <dl className="stats">
        <dt>Mapped castles (dated, built by AD {yi})</dt><dd>{fmt(stats.castlesDatedVisible)}</dd>
        <dt>Castle records in dataset (incl. {fmt(stats.castlesUndated)} undated)</dt><dd>{fmt(stats.castlesTotal)}</dd>
        <dt>Documented battles and skirmishes</dt><dd>{fmt(stats.battles)}</dd>
        <dt>Documented sieges</dt><dd>{fmt(stats.sieges)}</dd>
        <dt>Historical events of all types</dt><dd>{fmt(stats.events)}</dd>
        <dt>Conflict events with a usable casualty estimate</dt><dd>{fmt(stats.knownCasualtyEvents)}</dd>
        <dt>Conflict events with unknown casualties</dt><dd>{fmt(stats.unknownCasualtyEvents)}</dd>
        <dt>Estimated reported deaths in those {fmt(stats.knownCasualtyEvents)} events</dt>
        <dd>{stats.knownCasualtyEvents ? `${fmt(stats.deathsLow)} – ${fmt(stats.deathsHigh)}` : '—'}</dd>
      </dl>
      <p className="muted small">Death range = sum of lower bounds to sum of upper bounds of the de-duplicated casualty accounts. It covers only {stats.conflictEvents ? Math.round((100 * stats.knownCasualtyEvents) / stats.conflictEvents) : 0}% of the conflict events shown; medieval figures are especially uncertain.</p>
      <h3>Source coverage</h3>
      <p className="small">{fmt(stats.curatedEvents)} curated events with narratives and citations; {fmt(stats.importedEvents)} imported Wikidata events (dates and locations only, unreviewed).</p>
      <h3>Compare regions (modern country)</h3>
      <BucketTable rows={stats.byCountry} />
      <h3>Compare periods</h3>
      <BucketTable rows={stats.byEra} />
    </Panel>
  );
}

function BucketTable({ rows }: { rows: ReturnType<typeof computeStats>['byCountry'] }) {
  return (
    <table className="compare">
      <thead><tr><th></th><th>Events</th><th>With casualty data</th><th>Reported deaths</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}><th scope="row">{r.label}</th><td>{fmt(r.events)}</td><td>{fmt(r.knownCasualtyEvents)}</td><td>{r.knownCasualtyEvents ? (r.deathsLow === r.deathsHigh ? fmt(r.deathsLow) : `${fmt(r.deathsLow)}–${fmt(r.deathsHigh)}`) : '—'}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

function UncertainPanel() {
  const data = useData();
  const { controller } = useApp();
  const yi = useStore(timeStore, (s) => Math.floor(s.year));
  const heat = useStore(uiStore, (s) => s.heat);
  const { unlocated, unknownCas } = useMemo(() => {
    const evs = data.events.filter((e) => e.t0 <= yi + 1 && CONFLICT_TYPES.has(e.type));
    const unlocated = evs.filter((e) => !spatialSamples(e.location, { influenceKm: heat.influenceKm, maxUncertaintyKm: 75 }).ok && e.childIds.length === 0);
    const unknownCas = evs.filter((e) => e.provenance === 'curated' && e.childIds.length === 0 && !(data.casualtiesByEvent.get(e.id) ?? []).some((a) => selectEstimate(a, 'central') !== null));
    return { unlocated, unknownCas };
  }, [data, yi, heat.influenceKm]);
  const go = (id: string) => {
    select({ kind: 'event', id });
    const p = data.eventById.get(id)?.location.point;
    if (p) controller.current?.flyTo(p, 8, uiStore.get().reducedMotion);
  };
  return (
    <Panel title="Uncertain records" id="uncertain">
      <h3>Too uncertain to map ({unlocated.length})</h3>
      <p className="muted small">Events whose location is unknown or only known to within a very large area. They are excluded from the quantitative heat surface rather than placed at an apparently exact point.</p>
      <ul className="record-list">
        {unlocated.map((e) => <li key={e.id}><button className="link" onClick={() => select({ kind: 'event', id: e.id })}>{e.name}</button> <span className="muted">{formatHistoricalDate(e.date)}</span></li>)}
      </ul>
      <h3>Curated events with unknown casualties ({unknownCas.length})</h3>
      <p className="muted small">Shown on the map and counted in frequency modes, but not in death totals. Unknown is not zero.</p>
      <ul className="record-list">
        {unknownCas.map((e) => <li key={e.id}><button className="link" onClick={() => go(e.id)}>{e.name}</button> <span className="muted">{Math.floor(e.t0)}</span></li>)}
      </ul>
      <button className="link" onClick={() => { playback.pause(); openPanel('stats'); }}>Open statistics</button>
    </Panel>
  );
}

export function SidePanels() {
  const panel = useStore(uiStore, (s) => s.panel);
  if (panel === 'layers') return <LayersPanel />;
  if (panel === 'heatmap') return <HeatmapPanel />;
  if (panel === 'stats') return <StatsPanel />;
  if (panel === 'uncertain') return <UncertainPanel />;
  return null;
}
