import { useEffect, useRef, useState } from 'react';
import { loadDataset, significancePoints, type Dataset } from '../historical-data/dataset';
import { HeatEngine } from '../heatmap/engine';
import { MapController } from '../map/MapController';
import { applyPacing, playback, setSignificance } from '../timeline/playback';
import { select, timeStore, uiStore, useStore } from '../state/store';
import { parseUrl, serialiseUrl } from '../state/url';
import { SearchIndex } from '../search/search';
import { TopBar } from '../components/TopBar';
import { Timeline } from '../components/Timeline';
import { InfoPanel } from '../components/InfoPanel';
import { Narration } from '../components/Narration';
import { Legend } from '../components/Legend';
import { SidePanels } from '../components/SidePanels';
import { Tooltip } from '../components/Tooltip';
import { AboutModal } from '../components/AboutModal';
import { DataContext } from './context';
import { useKeyboard } from './useKeyboard';

export function App() {
  const [data, setData] = useState<Dataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState('Loading');
  const [basemapError, setBasemapError] = useState(false);
  const mapEl = useRef<HTMLDivElement>(null);
  const ctrlRef = useRef<MapController | null>(null);
  const [search, setSearch] = useState<SearchIndex | null>(null);
  const highContrast = useStore(uiStore, (s) => s.highContrast);
  const panel = useStore(uiStore, (s) => s.panel);

  // Load data once
  useEffect(() => {
    loadDataset(setProgress)
      .then((d) => {
        setData(d);
        setSearch(new SearchIndex(d));
        setSignificance(significancePoints(d));
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  // Create the map once data is available; apply URL state.
  useEffect(() => {
    if (!data || !mapEl.current || ctrlRef.current) return;
    const url = parseUrl(window.location.search);
    uiStore.set((s) => ({
      layers: url.layers ?? s.layers,
      selection: url.selection && (url.selection.kind !== 'castle' || data.castleById.has(url.selection.id)) && (url.selection.kind !== 'event' || data.eventById.has(url.selection.id)) ? url.selection : null,
      heat: {
        ...s.heat,
        mode: url.heatMode ?? s.heat.mode,
        memoryMeasure: url.memoryMeasure ?? s.heat.memoryMeasure,
        estimate: url.estimate ?? s.heat.estimate,
        influenceKm: url.influenceKm ?? s.heat.influenceKm,
        halfLifeYears: url.halfLifeYears ?? s.heat.halfLifeYears,
        windowYears: url.windowYears ?? s.heat.windowYears,
        highContrast: s.highContrast,
      },
      pacing: url.pacing ?? s.pacing,
      durationMin: url.durationMin ?? s.durationMin,
      frontiers: url.frontiers ?? s.frontiers,
    }));
    applyPacing();
    if (url.year !== undefined) playback.seek(url.year);
    const engine = new HeatEngine(data.events, data.casualties);
    const ctrl = new MapController(mapEl.current, data, engine, {
      onHover: (hover) => uiStore.set({ hover }),
      onSelect: (sel) => select(sel),
      onView: () => scheduleUrl(),
      onBasemapError: () => setBasemapError(true),
    }, { center: url.center, zoom: url.zoom });
    ctrlRef.current = ctrl;
    (window as unknown as { __castleMap: unknown }).__castleMap = { ctrl, data, playback, uiStore, timeStore };

    // Render loop: runs only while something changes, the clock plays, or a pulse animates.
    let raf = 0;
    const frame = () => {
      raf = 0;
      const t = timeStore.get();
      ctrl.frame({ year: t.year, playing: t.playing, scrubbing: t.scrubbing, ui: uiStore.get() });
      if (t.playing || ctrl.animating || !ctrl.isReady) request();
    };
    const request = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const unsubT = timeStore.subscribe(request);
    const unsubU = uiStore.subscribe(request);
    ctrl.map.on('load', request);
    request();

    // URL sync (debounced; never on every frame)
    let urlTimer = 0;
    const scheduleUrl = () => {
      window.clearTimeout(urlTimer);
      urlTimer = window.setTimeout(() => {
        const t = timeStore.get();
        if (t.playing) return;
        const ui = uiStore.get();
        const c = ctrl.map.getCenter();
        const q = serialiseUrl({
          year: t.year,
          selection: ui.selection,
          center: [c.lng, c.lat],
          zoom: ctrl.map.getZoom(),
          layers: ui.layers,
          heatMode: ui.heat.mode,
          memoryMeasure: ui.heat.memoryMeasure,
          estimate: ui.heat.estimate,
          influenceKm: ui.heat.influenceKm,
          halfLifeYears: ui.heat.halfLifeYears,
          windowYears: ui.heat.windowYears,
          pacing: ui.pacing,
          durationMin: ui.durationMin,
          frontiers: ui.frontiers,
        });
        window.history.replaceState(null, '', `${window.location.pathname}${q}`);
      }, 400);
    };
    const unsubUrlT = timeStore.subscribe(() => {
      if (!timeStore.get().playing) scheduleUrl();
    });
    const unsubUrlU = uiStore.subscribe(scheduleUrl);

    return () => {
      unsubT();
      unsubU();
      unsubUrlT();
      unsubUrlU();
      if (raf) cancelAnimationFrame(raf);
      ctrl.destroy();
      ctrlRef.current = null;
    };
  }, [data]);

  useEffect(() => {
    uiStore.set((s) => ({ heat: { ...s.heat, highContrast } }));
    ctrlRef.current?.setTheme(highContrast);
    document.documentElement.dataset.contrast = highContrast ? 'high' : 'normal';
  }, [highContrast]);

  useKeyboard(ctrlRef);

  if (error) {
    return (
      <div className="loading" role="alert">
        <h1>Castle Map</h1>
        <p>The historical data could not be loaded: {error}</p>
      </div>
    );
  }

  return (
    <DataContext.Provider value={{ data, controller: ctrlRef, search }}>
      <div className="app">
        <div ref={mapEl} className="map" aria-label="Map of England, Wales and Scotland" role="application" />
        {!data && (
          <div className="loading" aria-live="polite">
            <h1>Castle Map</h1>
            <p>{progress}…</p>
          </div>
        )}
        {data && (
          <>
            <TopBar />
            <Narration />
            <SidePanels />
            <InfoPanel />
            <Legend />
            <Timeline />
            <Tooltip />
            {panel === 'about' && <AboutModal />}
            {basemapError && (
              <div className="toast" role="status">
                Basemap tiles could not be loaded; showing the simplified local coastline.{' '}
                <button className="link" onClick={() => setBasemapError(false)}>Dismiss</button>
              </div>
            )}
          </>
        )}
      </div>
    </DataContext.Provider>
  );
}
