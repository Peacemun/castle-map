import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../app/context';
import { openPanel, select, uiStore, useStore, type PanelId } from '../state/store';
import { playback } from '../timeline/playback';
import type { SearchResult } from '../search/search';

const PANELS: { id: Exclude<PanelId, null>; label: string }[] = [
  { id: 'layers', label: 'Layers' },
  { id: 'heatmap', label: 'Heatmap' },
  { id: 'stats', label: 'Stats' },
  { id: 'uncertain', label: 'Uncertain' },
  { id: 'about', label: 'About' },
];

export function TopBar() {
  const panel = useStore(uiStore, (s) => s.panel);
  const frontiers = useStore(uiStore, (s) => s.frontiers);
  const highContrast = useStore(uiStore, (s) => s.highContrast);
  const { controller } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLElement>(null);
  // Panels are positioned below the (possibly wrapped) top bar.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--topbar-h', `${Math.ceil(el.getBoundingClientRect().bottom)}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <header className="topbar" ref={ref}>
      <div className="brand">
        <h1>Castle Map</h1>
        <p>Castles, recorded conflict and changing authority · AD 1000–2000</p>
      </div>
      <Search />
      <button className="menu-toggle" aria-expanded={menuOpen} aria-controls="main-nav" onClick={() => setMenuOpen((v) => !v)}>
        Menu
      </button>
      <nav id="main-nav" className={menuOpen ? 'open' : ''} aria-label="Map tools" onClick={() => setMenuOpen(false)}>
        {PANELS.slice(0, 2).map((p) => (
          <button key={p.id} className={panel === p.id ? 'active' : ''} aria-pressed={panel === p.id} onClick={() => { openPanel(p.id); setMenuOpen(false); }}>
            {p.label}
          </button>
        ))}
        <button
          className={frontiers ? 'active accent' : ''}
          aria-pressed={frontiers}
          title="Compare documented boundaries with recorded conflict"
          onClick={() => uiStore.set((s) => ({ frontiers: !s.frontiers, layers: { ...s.layers, boundaries: true }, panel: !s.frontiers ? 'heatmap' : s.panel }))}
        >
          Frontiers &amp; Conflict
        </button>
        {PANELS.slice(2).map((p) => (
          <button key={p.id} className={panel === p.id ? 'active' : ''} aria-pressed={panel === p.id} onClick={() => { openPanel(p.id); setMenuOpen(false); }}>
            {p.label}
          </button>
        ))}
        <button aria-pressed={highContrast} title="High-contrast colours" onClick={() => uiStore.set((s) => ({ highContrast: !s.highContrast }))}>
          Contrast
        </button>
        <button title="Return to the whole-Britain view (R)" aria-label="Reset view to the whole of Britain" onClick={() => controller.current?.resetView(uiStore.get().reducedMotion)}>
          Reset view
        </button>
      </nav>
    </header>
  );
}

function Search() {
  const { search, controller } = useApp();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const results = useMemo<SearchResult[]>(() => (search ? search.search(q) : []), [search, q]);

  const choose = (r: SearchResult) => {
    const reduced = uiStore.get().reducedMotion;
    if (r.kind === 'year' && r.year) {
      playback.pause();
      playback.seek(r.year);
    }
    if (r.kind === 'castle' || r.kind === 'event') {
      select({ kind: r.kind, id: r.id });
      if (r.year !== undefined && r.year > playback.state.year) {
        playback.pause();
        playback.seek(Math.min(2000, r.year + 0.01));
      }
    }
    if (r.coord) controller.current?.flyTo(r.coord, r.kind === 'region' ? 7.5 : 9, reduced);
    setOpen(false);
    setQ('');
  };

  return (
    <div className="search" role="search">
      <label htmlFor="search-input" className="sr-only">Search castles, battles, events, regions or years</label>
      <input
        id="search-input"
        type="search"
        placeholder="Search castles, battles, regions, years…  ( / )"
        value={q}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls="search-results"
        aria-activedescendant={open && results[active] ? `sr-${active}` : undefined}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
          if (e.key === 'Enter' && results[active]) choose(results[active]);
        }}
      />
      {open && results.length > 0 && (
        <ul id="search-results" role="listbox" className="search-results">
          {results.map((r, i) => (
            <li key={r.id} id={`sr-${i}`} role="option" aria-selected={i === active} className={i === active ? 'active' : ''} onMouseDown={(e) => { e.preventDefault(); choose(r); }}>
              <span className={`kind kind-${r.kind}`}>{r.kind}</span>
              <span className="label">{r.label}</span>
              <span className="sub">{r.sub}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
