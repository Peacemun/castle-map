import { useApp, useData } from '../app/context';
import { formatHistoricalDate, startYear } from '../historical-data/dates';
import type { CastleView, EventView } from '../historical-data/dataset';
import type { Citation, CasualtyEstimate } from '../historical-data/schemas';
import { selectEstimate } from '../heatmap/accounting';
import { select, uiStore, useStore } from '../state/store';
import { playback } from '../timeline/playback';
import { castleCategory } from '../state/filters';

const CONDITION: Record<string, string> = {
  intact: 'Surviving',
  'altered-in-use': 'Surviving (altered, in use)',
  ruin: 'Ruin',
  earthwork: 'Earthworks only',
  lost: 'Lost / demolished',
  unknown: 'Condition not recorded',
};

const VERIFICATION: Record<string, string> = {
  'source-checked': 'Checked against cited sources',
  'compiled-unverified': 'Compiled from the cited references; not yet checked page-by-page',
  'imported-unreviewed': 'Imported from an open dataset; not reviewed',
};

const fmt = (n: number) => n.toLocaleString('en-GB');

function Badge({ children, tone = '' }: { children: React.ReactNode; tone?: string }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

function Sources({ cites }: { cites: Citation[] }) {
  const data = useData();
  const seen = new Set<string>();
  return (
    <ol className="sources">
      {cites.filter((c) => (seen.has(c.sourceId + (c.supports ?? '')) ? false : (seen.add(c.sourceId + (c.supports ?? '')), true))).map((c, i) => {
        const s = data.sources.get(c.sourceId);
        if (!s) return <li key={i}>{c.sourceId}</li>;
        return (
          <li key={i}>
            {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a> : <cite>{s.title}</cite>}
            {s.author ? `, ${s.author}` : ''}
            {s.publicationDate ? ` (${s.publicationDate})` : ''}. <span className="muted">{s.publisher}.</span>
            {c.pages ? ` pp. ${c.pages}.` : ''}
            {c.supports ? <span className="muted"> — {c.supports}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

function Jump({ id, kind, label, year }: { id: string; kind: 'castle' | 'event'; label: string; year?: number }) {
  const { controller } = useApp();
  const data = useData();
  return (
    <button
      className="link"
      onClick={() => {
        select({ kind, id });
        if (year !== undefined && year > playback.state.year) {
          playback.pause();
          playback.seek(Math.min(2000, year + 0.01));
        }
        const coord = kind === 'castle' ? data.castleById.get(id)?.coord : data.eventById.get(id)?.location.point;
        if (coord) controller.current?.flyTo(coord, 8.5, uiStore.get().reducedMotion);
      }}
    >
      {label}
    </button>
  );
}

function Provenance({ confidence, verification, provenance, flags }: { confidence: string; verification: string; provenance: string; flags: string[] }) {
  return (
    <div className="provenance">
      <Badge tone={`conf-${confidence}`}>Confidence: {confidence.replace('-', ' ')}</Badge>
      <Badge tone="neutral">{provenance === 'curated' ? 'Curated record' : `Imported (${provenance})`}</Badge>
      <p className="muted small">{VERIFICATION[verification]}</p>
      {flags.length > 0 && (
        <ul className="flags">
          {flags.map((f) => <li key={f}>Review flag: {f}</li>)}
        </ul>
      )}
    </div>
  );
}

function CastleDetail({ c }: { c: CastleView }) {
  const data = useData();
  const { controller } = useApp();
  const events = c.eventIds.map((id) => data.eventById.get(id)).filter((e): e is EventView => !!e).sort((a, b) => a.t0 - b.t0);
  const timeline: { y: number; label: React.ReactNode }[] = [];
  if (c.built) timeline.push({ y: startYear(c.built), label: <>Earliest known construction: {formatHistoricalDate(c.built)}</> });
  for (const p of c.phases) timeline.push({ y: startYear(p.date), label: <>{formatHistoricalDate(p.date)} — {p.description}</> });
  for (const ch of c.controlChanges) timeline.push({ y: startYear(ch.date), label: <>{formatHistoricalDate(ch.date)} — control: {ch.from ? `${ch.from} → ` : ''}{ch.to}. {ch.description}</> });
  for (const e of events) timeline.push({ y: e.t0, label: <>{formatHistoricalDate(e.date)} — <Jump id={e.id} kind="event" label={e.name} year={e.t0} /></> });
  if (c.endOfUse) timeline.push({ y: startYear(c.endOfUse.date), label: <>{formatHistoricalDate(c.endOfUse.date)} — {c.endOfUse.kind}{c.endOfUse.note ? `: ${c.endOfUse.note}` : ''}</> });
  timeline.sort((a, b) => a.y - b.y);
  const ext = c.externalIds;
  return (
    <>
      <header>
        <p className="kicker">Castle · {c.region ? `${c.region}, ` : ''}{c.country}</p>
        <h2>{c.name}</h2>
        {c.altNames.length > 0 && <p className="muted">Also: {c.altNames.join('; ')}</p>}
        <div className="badges">
          <Badge tone={`cond-${castleCategory(c)}`}>{CONDITION[c.condition]}</Badge>
          <Badge tone="neutral">{c.classification.replace(/-/g, ' ')}{c.classificationConfidence === 'low' ? ' (classification uncertain)' : ''}</Badge>
          <Badge tone="neutral">{c.built ? `Built ${formatHistoricalDate(c.built)}` : 'Construction date unknown'}</Badge>
        </div>
      </header>
      {c.summary && <p>{c.summary}</p>}
      {c.significance && <p className="muted">{c.significance}</p>}
      {!c.built && <p className="notice">No construction date is recorded for this site, so it is not placed on the timeline (shown only when "Undated castle records" is enabled).</p>}
      {timeline.length > 0 && (
        <section>
          <h3>Timeline</h3>
          <ul className="timeline-list">{timeline.map((t, i) => <li key={i}>{t.label}</li>)}</ul>
        </section>
      )}
      {c.owners.length > 0 && (
        <section>
          <h3>Holders and controlling authorities</h3>
          <ul>{c.owners.map((o, i) => <li key={i}>{o.name}{o.from ? ` (from ${o.from}${o.to ? ` to ${o.to}` : ''})` : ''}</li>)}</ul>
        </section>
      )}
      <section>
        <h3>Location</h3>
        <p className="small">{c.coord[1].toFixed(4)}°N, {Math.abs(c.coord[0]).toFixed(4)}°{c.coord[0] < 0 ? 'W' : 'E'} · accuracy: {c.locationAccuracy}</p>
        <button className="link" onClick={() => controller.current?.flyTo(c.coord, 12, uiStore.get().reducedMotion)}>Zoom to castle</button>
      </section>
      <section>
        <h3>Record</h3>
        <Provenance confidence={c.confidence} verification={c.verification} provenance={c.provenance} flags={c.reviewFlags} />
        <p className="small links">
          {ext.wikidata && <a href={`https://www.wikidata.org/wiki/${ext.wikidata}`} target="_blank" rel="noopener noreferrer">Wikidata {ext.wikidata}</a>}
          {ext.nhle && <a href={`https://historicengland.org.uk/listing/the-list/list-entry/${ext.nhle}`} target="_blank" rel="noopener noreferrer">NHLE {ext.nhle}</a>}
          {ext.canmore && <a href={`https://canmore.org.uk/site/${ext.canmore}`} target="_blank" rel="noopener noreferrer">Canmore {ext.canmore}</a>}
          {ext.cadw && <span>Cadw {ext.cadw}</span>}
          {ext.wikipedia && <a href={ext.wikipedia} target="_blank" rel="noopener noreferrer">Wikipedia</a>}
        </p>
      </section>
      <section>
        <h3>Sources</h3>
        <Sources cites={c.sources} />
      </section>
    </>
  );
}

function range(r: { min: number | null; max: number | null } | null) {
  if (!r || (r.min === null && r.max === null)) return null;
  if (r.min !== null && r.max !== null) return r.min === r.max ? fmt(r.min) : `${fmt(r.min)}–${fmt(r.max)}`;
  return r.min !== null ? `at least ${fmt(r.min)}` : `up to ${fmt(r.max!)}`;
}

function CasualtyTable({ accounts }: { accounts: CasualtyEstimate[] }) {
  return (
    <table className="casualties">
      <thead>
        <tr><th>Group</th><th>Killed</th><th>Method</th><th>Confidence</th></tr>
      </thead>
      <tbody>
        {accounts.map((a) => {
          const killed = a.killedCentral !== null && a.killedMin === null && a.killedMax === null ? `c. ${fmt(a.killedCentral)}` : range({ min: a.killedMin, max: a.killedMax });
          return (
            <tr key={a.id}>
              <td>
                {a.side ?? (a.scope === 'aggregate' ? 'Total (aggregate)' : a.category)}
                {a.includesAccountIds.length > 0 && <div className="muted small">Includes {a.includesAccountIds.length} separately mapped account(s); only the remainder is mapped here.</div>}
              </td>
              <td>
                {killed ?? <em>Unknown</em>}
                {killed && a.killedCentral !== null && (a.killedMin !== null || a.killedMax !== null) ? <div className="muted small">central {fmt(a.killedCentral)}</div> : null}
                {range(a.wounded) && <div className="muted small">wounded {range(a.wounded)}</div>}
                {range(a.captured) && <div className="muted small">captured {range(a.captured)}</div>}
                {range(a.missing) && <div className="muted small">missing {range(a.missing)}</div>}
              </td>
              <td>{a.method.replace(/-/g, ' ')}</td>
              <td>{a.confidence}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function EventDetail({ e }: { e: EventView }) {
  const data = useData();
  const accounts = data.casualtiesByEvent.get(e.id) ?? [];
  const known = accounts.some((a) => selectEstimate(a, 'central') !== null);
  const parent = e.parentId ? data.eventById.get(e.parentId) : null;
  const children = e.childIds.map((id) => data.eventById.get(id)!).filter(Boolean);
  const bf = e.location.polygonRef ? data.battlefields.features.find((f) => f.properties.id === e.location.polygonRef) : null;
  const loc = e.location;
  const locLabel: Record<string, string> = {
    'verified-point': 'Verified point',
    'approximate-point': `Approximate point${loc.uncertaintyKm ? ` (±${loc.uncertaintyKm} km)` : ''}`,
    area: bf ? 'Area defined by an official battlefield register' : `Approximate area${loc.uncertaintyKm ? ` (radius ~${loc.uncertaintyKm} km)` : ''}`,
    disputed: 'Disputed: alternative sites proposed',
    multiple: 'Several locations',
    unknown: 'Location unknown — not mapped',
  };
  return (
    <>
      <header>
        <p className="kicker">{e.type.replace('-', ' ')}{e.region ? ` · ${e.region}` : ''} · {e.country}</p>
        <h2>{e.name}</h2>
        {e.altNames.length > 0 && <p className="muted">Also: {e.altNames.join('; ')}</p>}
        <div className="badges">
          <Badge tone="neutral">{formatHistoricalDate(e.date)}</Badge>
          {e.date.approximate && <Badge tone="warn">Approximate date</Badge>}
          {e.date.disputed && <Badge tone="warn">Date disputed</Badge>}
          <Badge tone={loc.kind === 'verified-point' || (loc.kind === 'area' && bf) ? 'neutral' : 'warn'}>{locLabel[loc.kind]}</Badge>
        </div>
        {e.date.note && <p className="muted small">{e.date.note}</p>}
      </header>
      {e.participants.length > 0 && (
        <section>
          <h3>Participants</h3>
          <ul>{e.participants.map((p, i) => <li key={i}>{p.name}{p.authorityId && data.authorities.get(p.authorityId) ? <span className="muted"> — {data.authorities.get(p.authorityId)!.name}</span> : null}</li>)}</ul>
          {e.commanders.length > 0 && <p className="small"><strong>Commanders:</strong> {e.commanders.map((c) => c.name).join('; ')}</p>}
        </section>
      )}
      {e.narrative ? <p>{e.narrative}</p> : <p className="notice">No narrative has been written for this imported record yet.</p>}
      {e.outcome && <p><strong>Outcome:</strong> {e.outcome}</p>}
      <section>
        <h3>Casualties</h3>
        {accounts.length > 0 ? <CasualtyTable accounts={accounts} /> : null}
        {!known && (
          <p className="notice">
            {accounts.length > 0 ? 'The recorded figures are not considered reliable enough to use.' : 'No casualty estimate is recorded for this event in this dataset.'} It is treated as <strong>unknown</strong> (not zero) and contributes to the conflict-frequency layers only.
          </p>
        )}
        {accounts.map((a) => a.notes && <p key={a.id} className="small muted">{a.notes}</p>)}
        {e.wikidataDeathsForComparison !== null && (
          <p className="small muted">Wikidata records {fmt(e.wikidataDeathsForComparison)} deaths for this event. This crowd-sourced figure is shown for comparison only and is not used in any calculation.</p>
        )}
      </section>
      {e.disagreements.length > 0 && (
        <section>
          <h3>Scholarly disagreement</h3>
          <ul>{e.disagreements.map((d, i) => <li key={i}>{d}</li>)}</ul>
        </section>
      )}
      <section>
        <h3>Location</h3>
        <p className="small">{loc.placeName ?? ''}{loc.note ? ` ${loc.note}` : ''}</p>
        {loc.kind === 'disputed' && <ul className="small">{loc.alternatives.map((a) => <li key={a.label}>{a.label}</li>)}</ul>}
        {bf && <p className="small">Register: {bf.properties.url ? <a href={bf.properties.url} target="_blank" rel="noopener noreferrer">{bf.properties.register} — {bf.properties.name}</a> : bf.properties.register}</p>}
        {e.itinerary.length > 0 && <p className="small muted">The dashed line joins documented stopping places in order; straight segments are schematic and do not show the actual route taken.</p>}
      </section>
      {(e.castleIds.length > 0 || parent || children.length > 0) && (
        <section>
          <h3>Linked records</h3>
          <ul>
            {parent && <li>Part of: <Jump id={parent.id} kind="event" label={parent.name} year={parent.t0} /></li>}
            {e.castleIds.map((id) => <li key={id}>Castle: <Jump id={id} kind="castle" label={data.castleById.get(id)?.name ?? id} /></li>)}
            {children.map((c) => <li key={c.id}>{formatHistoricalDate(c.date)}: <Jump id={c.id} kind="event" label={c.name} year={c.t0} /></li>)}
          </ul>
        </section>
      )}
      <section>
        <h3>Record</h3>
        <Provenance confidence={e.confidence} verification={e.verification} provenance={e.provenance} flags={e.reviewFlags} />
        {e.externalIds.wikidata && <p className="small links"><a href={`https://www.wikidata.org/wiki/${e.externalIds.wikidata}`} target="_blank" rel="noopener noreferrer">Wikidata {e.externalIds.wikidata}</a></p>}
      </section>
      <section>
        <h3>Sources</h3>
        <Sources cites={[...e.sources, ...accounts.flatMap((a) => a.sources)]} />
      </section>
    </>
  );
}

function TerritoryDetail({ id }: { id: string }) {
  const data = useData();
  const t = data.territoryMeta.get(id);
  if (!t) return null;
  const a = data.authorities.get(t.authorityId);
  const transitions = data.transitions.filter((tr) => tr.territoryIds.includes(id));
  return (
    <>
      <header>
        <p className="kicker">Political authority</p>
        <h2>{t.name}</h2>
        <div className="badges">
          <Badge tone="neutral">AD {t.validFrom}–{t.validTo}</Badge>
          <Badge tone={t.boundaryStatus === 'documented-approximate' ? 'neutral' : 'warn'}>{t.boundaryStatus === 'documented-approximate' ? 'Documented boundary (approximate)' : t.boundaryStatus === 'disputed' ? 'Disputed / contested' : 'Schematic boundary'}</Badge>
          <Badge tone={`conf-${t.confidence}`}>Confidence: {t.confidence.replace('-', ' ')}</Badge>
        </div>
      </header>
      {a && <p><strong>{a.name}.</strong> {a.description}</p>}
      <p>{t.notes}</p>
      <p className="notice small">Boundaries on this map are approximations at national scale. Schematic boundaries are coarse zones drawn to show the general extent of authority and must not be read as surveyed lines.</p>
      {transitions.length > 0 && (
        <section>
          <h3>Documented changes</h3>
          <ul>{transitions.map((tr) => <li key={tr.id}>{formatHistoricalDate(tr.date)} — <strong>{tr.title}</strong>: {tr.description}</li>)}</ul>
        </section>
      )}
      <section>
        <h3>Sources</h3>
        <Sources cites={[...t.sources, ...(a?.sources ?? [])]} />
      </section>
    </>
  );
}

export function InfoPanel() {
  const data = useData();
  const sel = useStore(uiStore, (s) => s.selection);
  if (!sel) return null;
  const castle = sel.kind === 'castle' ? data.castleById.get(sel.id) : undefined;
  const event = sel.kind === 'event' ? data.eventById.get(sel.id) : undefined;
  return (
    <aside className="info-panel" aria-label="Record details" data-testid="info-panel">
      <button className="close" onClick={() => select(null)} aria-label="Close details">×</button>
      <div className="info-scroll">
        {castle && <CastleDetail c={castle} />}
        {event && <EventDetail e={event} />}
        {sel.kind === 'territory' && <TerritoryDetail id={sel.id} />}
      </div>
    </aside>
  );
}
