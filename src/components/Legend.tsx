import { useMemo, useState } from 'react';
import { useApp, useData } from '../app/context';
import { colourAt, alphaAt, makeScale, valueAt, PALETTE, PALETTE_HC } from '../heatmap/colour';
import { measureFor } from '../heatmap/engine';
import { iconDataUrl } from '../map/icons';
import { heatScaleStore, timeStore, uiStore, useStore } from '../state/store';

const MODE_TITLE: Record<string, string> = {
  cumulative: 'Cumulative recorded deaths',
  frequency: 'Conflict frequency (recorded events)',
  fading: 'Fading historical memory',
  recent: 'Recent period',
};

function fmt(v: number): string {
  if (v >= 100) return Math.round(v).toLocaleString('en-GB');
  if (v >= 10) return v.toFixed(0);
  if (v >= 1) return v.toFixed(1);
  if (v >= 0.1) return v.toFixed(2);
  return v.toPrecision(1);
}

export function HeatLegend({ compact = false }: { compact?: boolean }) {
  const heat = useStore(uiStore, (s) => s.heat);
  const { controller } = useApp();
  useStore(heatScaleStore, (s) => s.version); // re-render when reference scales are rebuilt
  const scale = controller.current?.heatScale(measureFor(heat)) ?? makeScale(1, 1000);
  const measure = measureFor(heat);
  const palette = heat.highContrast ? PALETTE_HC : PALETTE;
  const stops = [0.15, 0.35, 0.55, 0.75, 1];
  const unit = measure === 'deaths' ? 'deaths per 100 km² (smoothed)' : 'events per 1,000 km² (smoothed)';
  const mult = measure === 'deaths' ? 100 : 1000;
  const gradient = `linear-gradient(to right, ${Array.from({ length: 11 }, (_, i) => {
    const v = i / 10;
    const [r, g, b] = colourAt(v, palette);
    return `rgba(${r | 0},${g | 0},${b | 0},${Math.max(0.05, alphaAt(v, 0.9)).toFixed(2)}) ${i * 10}%`;
  }).join(',')})`;
  return (
    <div className="heat-legend">
      <p className="legend-title">{MODE_TITLE[heat.mode]}{heat.mode === 'fading' || heat.mode === 'recent' ? ` — ${measure === 'deaths' ? 'deaths' : 'events'}` : ''}</p>
      <div className="ramp" style={{ background: gradient }} />
      <div className="ramp-labels">
        <span>low</span>
        {!compact && stops.slice(1, -1).map((s) => <span key={s}>{fmt(valueAt(s, scale) * mult)}</span>)}
        <span>{fmt(valueAt(1, scale) * mult)}+</span>
      </div>
      <p className="legend-note">
        {unit}; logarithmic colour scale.
        {heat.mode === 'fading' && ` Half-life ${heat.halfLifeYears} years (a visual setting, not a mortality estimate).`}
        {heat.mode === 'recent' && ` Only events in the ${heat.windowYears} years before the current date.`}
        {measure === 'deaths' && ' Events with unknown casualties are excluded, not counted as zero.'}
      </p>
    </div>
  );
}

export function Legend() {
  const data = useData();
  const [open, setOpen] = useState(() => typeof window === 'undefined' || window.innerWidth > 860);
  const layers = useStore(uiStore, (s) => s.layers);
  const hc = useStore(uiStore, (s) => s.highContrast);
  const frontiers = useStore(uiStore, (s) => s.frontiers);
  const yi = useStore(timeStore, (s) => Math.floor(s.year));
  const icons = useMemo(() => ({ intact: iconDataUrl('intact', hc), ruin: iconDataUrl('ruin', hc), lost: iconDataUrl('lost', hc), undated: iconDataUrl('undated', hc) }), [hc]);
  const active = data.territories.features.filter((f) => f.properties.validFrom <= yi && f.properties.validTo >= yi);
  const authorities = [...new Map(active.map((f) => [f.properties.authorityId, f.properties])).values()];
  return (
    <section className={`legend ${open ? 'open' : 'closed'}`} aria-label="Legend">
      <button className="legend-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? 'Hide legend' : 'Legend'}</button>
      {open && (
        <div className="legend-body">
          {layers.heatmap && <HeatLegend />}
          {(layers.territories || layers.boundaries) && authorities.length > 0 && (
            <div className="legend-group">
              <p className="legend-title">Political authority in AD {yi}</p>
              <ul className="swatches">
                {authorities.map((a) => (
                  <li key={a.authorityId}><span className="swatch" style={{ background: a.color }} />{a.authority}</li>
                ))}
              </ul>
              <p className="legend-note">Solid edge: documented boundary (approximate). Dashed: schematic zone. Dotted: disputed. Not modern borders.</p>
            </div>
          )}
          <div className="legend-group symbols">
            <p className="legend-title">Symbols</p>
            <ul>
              <li><img src={icons.intact} alt="" width={18} height={18} />Surviving castle</li>
              <li><img src={icons.ruin} alt="" width={18} height={18} />Ruined castle</li>
              <li><img src={icons.lost} alt="" width={18} height={18} />Lost / earthworks</li>
              {layers.undated && <li><img src={icons.undated} alt="" width={18} height={18} />Undated record</li>}
              <li><span className="dot battle" />Battle</li>
              <li><span className="dot siege" />Siege</li>
              <li><span className="dot massacre" />Massacre / civilian violence</li>
              <li><span className="dot other" />Raid, rebellion, campaign</li>
              <li><span className="dot air" />Air raid</li>
              <li><span className="ring" />Uncertain location (extent)</li>
              {frontiers && <li><span className="ring gold" />Castle within 25 km of a frontier</li>}
              {frontiers && <li><span className="ring blue" />Castle changed hands (ring grows)</li>}
            </ul>
            <p className="legend-note">Faded castle: construction date uncertain and not yet certain at this date.</p>
          </div>
        </div>
      )}
    </section>
  );
}
