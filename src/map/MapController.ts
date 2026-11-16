/**
 * MapController owns the single MapLibre map instance (never re-created on timeline
 * updates). `frame()` is called on every animation frame with the current year and UI
 * state; it diffs against the previous frame and only updates what changed:
 *   castles / events / itineraries / battlefields  → GeoJSON setData when the visible set changes
 *   territories                                    → setFilter when the integer year changes
 *   heatmap                                        → recomputed only when its inputs change
 *   pulses                                         → small source animated while active
 */
import * as maplibregl from 'maplibre-gl';
// MapLibre 6 runs its tile worker from a separate module; let Vite emit it as an asset.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import type { FilterSpecification, GeoJSONSource, ImageSource, Map as MlMap, MapGeoJSONFeature, PointLike } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Feature, FeatureCollection, Geometry, LineString, Point } from 'geojson';
import type { CastleView, Dataset, EventView, TerritoryProps } from '../historical-data/dataset';
import { NARRATION_THRESHOLD } from '../historical-data/dataset';
import type { HeatEngine } from '../heatmap/engine';
import { castleCategory, castlePasses, eventPasses, filterKey, heatEventPasses } from '../state/filters';
import { heatScaleStore, type Selection, type UiState } from '../state/store';
import { addCastleIcons } from './icons';
import { buildStyle, HIGH_CONTRAST, labelLayers, PARCHMENT, type Theme } from './style';
import { frontierDistanceKm } from './frontiers';
import { formatHistoricalDate } from '../historical-data/dates';

maplibregl.setWorkerUrl(workerUrl);

export const GB_BOUNDS: [[number, number], [number, number]] = [
  [-7.4, 50.0],
  [1.8, 58.75],
];

export interface MapCallbacks {
  onHover(h: UiState['hover']): void;
  onSelect(sel: Selection): void;
  onView(center: [number, number], zoom: number): void;
  onBasemapError(): void;
}

export interface FrameInput {
  year: number;
  playing: boolean;
  scrubbing: boolean;
  ui: UiState;
}

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };
const FRONTIER_KM = 25;

/** Pixel radius at zoom 0 for a distance in km at a latitude (Web Mercator, 512 px tiles). */
function r0ForKm(km: number, lat: number) {
  const metersPerPixelZ0 = (40075016.686 * Math.cos((lat * Math.PI) / 180)) / 512;
  return (km * 1000) / metersPerPixelZ0;
}

export class MapController {
  readonly map: MlMap;
  private ready = false;
  private theme: Theme = PARCHMENT;
  private keys: Record<string, string> = {};
  private pulses: { id: string; lon: number; lat: number; start: number; strength: number }[] = [];
  private visibleEventIds = new Set<string>();
  private lastHeatAt = 0;
  private lastYear = 1000;
  private frontierCache = new Map<string, number>();
  private frontierSig = '';
  private hoveredKey = '';

  constructor(
    container: HTMLElement,
    private readonly data: Dataset,
    private readonly heat: HeatEngine,
    private readonly cb: MapCallbacks,
    initial: { center?: [number, number]; zoom?: number },
  ) {
    const landUrl = new URL(`${import.meta.env.BASE_URL}data/land.geojson`, window.location.href).toString();
    this.map = new maplibregl.Map({
      container,
      style: buildStyle(this.theme, landUrl),
      bounds: initial.center ? undefined : GB_BOUNDS,
      center: initial.center,
      zoom: initial.zoom,
      fitBoundsOptions: { padding: { top: 64, bottom: 140, left: 20, right: 20 } },
      minZoom: 3.5,
      maxZoom: 15,
      maxBounds: [
        [-25, 44],
        [15, 66],
      ],
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      fadeDuration: 0,
    });
    this.map.touchZoomRotate.disableRotation();
    this.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    this.map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
    this.map.on('load', () => this.onLoad());
    this.map.on('error', (e) => {
      const msg = String((e as unknown as { error?: { message?: string } }).error?.message ?? '');
      if (/openfreemap|Failed to fetch|NetworkError|AJAXError/i.test(msg)) this.cb.onBasemapError();
    });
    this.map.on('moveend', () => {
      const c = this.map.getCenter();
      this.cb.onView([c.lng, c.lat], this.map.getZoom());
    });
  }

  get isReady() {
    return this.ready;
  }

  private onLoad() {
    const m = this.map;
    addCastleIcons(m, false);
    m.addSource('territories', { type: 'geojson', data: this.data.territories });
    m.addSource('territory-labels', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: this.data.territories.features.map((f) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [f.properties.labelLon, f.properties.labelLat] }, properties: f.properties })),
      },
    });
    m.addSource('heat', { type: 'image', url: blankPng(), coordinates: this.heat.bounds });
    m.addSource('battlefields', { type: 'geojson', data: EMPTY });
    m.addSource('itineraries', { type: 'geojson', data: EMPTY });
    m.addSource('itinerary-stops', { type: 'geojson', data: EMPTY });
    m.addSource('events', { type: 'geojson', data: EMPTY });
    m.addSource('event-alts', { type: 'geojson', data: EMPTY });
    m.addSource('castles', { type: 'geojson', data: EMPTY });
    m.addSource('pulses', { type: 'geojson', data: EMPTY });
    m.addSource('selection', { type: 'geojson', data: EMPTY });

    const yearFilter = (y: number) => ['all', ['<=', ['get', 'validFrom'], y], ['>=', ['get', 'validTo'], y]] as FilterSpecification;
    m.addLayer({
      id: 'terr-fill',
      type: 'fill',
      source: 'territories',
      filter: yearFilter(1000),
      paint: {
        'fill-color': ['get', 'color'],
        'fill-opacity': ['match', ['get', 'boundaryStatus'], 'documented-approximate', 0.24, 'disputed', 0.15, 0.19],
        'fill-antialias': false,
      },
    });
    m.addLayer({
      id: 'heat-layer',
      type: 'raster',
      source: 'heat',
      paint: { 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0.95, 9, 0.85, 12, 0.6], 'raster-resampling': 'linear', 'raster-fade-duration': 0 },
    });
    m.addLayer({
      id: 'terr-line',
      type: 'line',
      source: 'territories',
      filter: yearFilter(1000),
      layout: { 'line-join': 'round' },
      paint: {
        'line-color': '#5b4f3a',
        'line-opacity': 0.55,
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.6, 9, 1.6],
        'line-dasharray': ['match', ['get', 'boundaryStatus'], 'documented-approximate', ['literal', [1, 0]], 'disputed', ['literal', [1, 2]], ['literal', [3, 2]]],
      },
    });
    for (const l of labelLayers(this.theme) ?? []) m.addLayer(l);
    m.addLayer({
      id: 'terr-label',
      type: 'symbol',
      source: 'territory-labels',
      filter: yearFilter(1000),
      maxzoom: 8,
      layout: {
        'text-field': ['upcase', ['get', 'authority']],
        'text-font': ['Noto Sans Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 4, 9, 7, 12],
        'text-letter-spacing': 0.18,
        'text-max-width': 9,
        'text-padding': 20,
        'symbol-placement': 'point',
      },
      paint: { 'text-color': '#4b4232', 'text-opacity': 0.55, 'text-halo-color': '#efe8d6', 'text-halo-width': 1 },
    });
    m.addLayer({ id: 'battlefield-fill', type: 'fill', source: 'battlefields', minzoom: 8, paint: { 'fill-color': '#8a2b2b', 'fill-opacity': 0.12 } });
    m.addLayer({ id: 'battlefield-line', type: 'line', source: 'battlefields', minzoom: 8, paint: { 'line-color': '#8a2b2b', 'line-width': 1.2, 'line-dasharray': [2, 1.5], 'line-opacity': 0.7 } });
    m.addLayer({
      id: 'itinerary-line',
      type: 'line',
      source: 'itineraries',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#5e3a2a', 'line-opacity': 0.6, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1, 9, 2.2], 'line-dasharray': [2, 2] },
    });
    m.addLayer({
      id: 'itinerary-stops',
      type: 'circle',
      source: 'itinerary-stops',
      paint: { 'circle-radius': 2.5, 'circle-color': '#efe8d6', 'circle-stroke-color': '#5e3a2a', 'circle-stroke-width': 1.2 },
    });
    m.addLayer({
      id: 'itinerary-labels',
      type: 'symbol',
      source: 'itinerary-stops',
      minzoom: 6.5,
      layout: { 'text-field': ['get', 'label'], 'text-font': ['Noto Sans Italic'], 'text-size': 10, 'text-offset': [0, 0.9], 'text-anchor': 'top', 'text-optional': true },
      paint: { 'text-color': '#5e3a2a', 'text-halo-color': '#efe8d6', 'text-halo-width': 1 },
    });
    m.addLayer({
      id: 'event-uncertainty',
      type: 'circle',
      source: 'events',
      filter: ['>', ['get', 'r0'], 0],
      paint: {
        'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 0, ['get', 'r0'], 20, ['*', ['get', 'r0'], 1048576]],
        'circle-color': '#7a2a24',
        'circle-opacity': ['*', ['interpolate', ['linear'], ['zoom'], 6, 0.06, 9, 0.02], ['get', 'fade']],
        'circle-stroke-color': '#7a2a24',
        'circle-stroke-width': 0.8,
        'circle-stroke-opacity': ['*', ['interpolate', ['linear'], ['zoom'], 6, 0.35, 9, 0.1], ['get', 'fade']],
        'circle-pitch-alignment': 'map',
      },
    });
    m.addLayer({
      id: 'event-alts',
      type: 'circle',
      source: 'event-alts',
      paint: { 'circle-radius': 5, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#7a2a24', 'circle-stroke-width': 1.5, 'circle-stroke-opacity': 0.8 },
    });
    m.addLayer({
      id: 'castle-frontier',
      type: 'circle',
      source: 'castles',
      filter: ['==', ['get', 'front'], 1],
      paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 6, 10, 14], 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#a8741a', 'circle-stroke-width': 2, 'circle-stroke-opacity': 0.85 },
    });
    m.addLayer({
      id: 'castle-control',
      type: 'circle',
      source: 'castles',
      filter: ['>', ['get', 'ctl'], 0],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, ['+', 4, ['*', 2, ['get', 'ctl']]], 10, ['+', 10, ['*', 3, ['get', 'ctl']]]],
        'circle-color': 'rgba(0,0,0,0)',
        'circle-stroke-color': '#2f5d7a',
        'circle-stroke-width': 1.4,
        'circle-stroke-opacity': 0.75,
      },
    });
    m.addLayer({
      id: 'castle-icons',
      type: 'symbol',
      source: 'castles',
      layout: {
        'icon-image': ['get', 'icon'],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 4, ['*', 0.55, ['get', 'scale']], 7, ['*', 0.8, ['get', 'scale']], 11, 1.15],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'symbol-sort-key': ['get', 'imp'],
      },
      paint: { 'icon-opacity': ['get', 'op'] },
    });
    m.addLayer({
      id: 'events',
      type: 'circle',
      source: 'events',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, ['+', 2, ['*', 2.2, ['get', 'size']]], 9, ['+', 4, ['*', 4, ['get', 'size']]]],
        'circle-color': ['match', ['get', 'type'], 'battle', '#8e2a24', 'skirmish', '#8e2a24', 'siege', '#efe8d6', 'massacre', '#4d1d3a', 'air-raid', '#4a4446', 'rebellion', '#b3742a', 'political-change', '#2f5d7a', '#7a4a2a'],
        'circle-stroke-color': ['match', ['get', 'type'], 'siege', '#8e2a24', '#f3ecdc'],
        'circle-stroke-width': ['match', ['get', 'type'], 'siege', 2.2, 1.2],
        'circle-opacity': ['get', 'fade'],
        'circle-stroke-opacity': ['get', 'fade'],
      },
    });
    m.addLayer({
      id: 'pulses',
      type: 'circle',
      source: 'pulses',
      paint: { 'circle-radius': ['get', 'r'], 'circle-color': '#9b1c1c', 'circle-opacity': ['get', 'a'], 'circle-blur': 0.6, 'circle-stroke-width': 0 },
    });
    m.addLayer({
      id: 'selection',
      type: 'circle',
      source: 'selection',
      paint: { 'circle-radius': 15, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#c8941f', 'circle-stroke-width': 3 },
    });
    m.addLayer({
      id: 'event-labels',
      type: 'symbol',
      source: 'events',
      filter: ['==', ['get', 'recent'], 1],
      minzoom: 4.5,
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Italic'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 5, 10, 9, 13],
        'text-offset': [0, 1.1],
        'text-anchor': 'top',
        'text-max-width': 9,
        'text-optional': true,
        'symbol-sort-key': ['-', 0, ['get', 'size']],
      },
      paint: { 'text-color': '#6b1d1d', 'text-halo-color': '#f3ecdc', 'text-halo-width': 1.4, 'text-opacity': ['get', 'fade'] },
    });
    m.addLayer({
      id: 'event-labels-all',
      type: 'symbol',
      source: 'events',
      filter: ['==', ['get', 'recent'], 0],
      minzoom: 7.5,
      layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Italic'], 'text-size': 11, 'text-offset': [0, 1], 'text-anchor': 'top', 'text-max-width': 9, 'text-optional': true },
      paint: { 'text-color': '#6b1d1d', 'text-halo-color': '#f3ecdc', 'text-halo-width': 1.2 },
    });
    m.addLayer({
      id: 'castle-labels-major',
      type: 'symbol',
      source: 'castles',
      minzoom: 5.5,
      filter: ['>=', ['get', 'imp'], 4],
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 5.5, 10, 10, 13],
        'text-offset': [0, 1.0],
        'text-anchor': 'top',
        'text-max-width': 8,
        'text-optional': true,
        'symbol-sort-key': ['-', 0, ['get', 'imp']],
      },
      paint: { 'text-color': '#2f281e', 'text-halo-color': '#f3ecdc', 'text-halo-width': 1.4 },
    });
    m.addLayer({
      id: 'castle-labels-all',
      type: 'symbol',
      source: 'castles',
      minzoom: 8.5,
      filter: ['<', ['get', 'imp'], 4],
      layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-offset': [0, 1.0], 'text-anchor': 'top', 'text-max-width': 8, 'text-optional': true },
      paint: { 'text-color': '#2f281e', 'text-halo-color': '#f3ecdc', 'text-halo-width': 1.2 },
    });

    this.bindInteraction();
    this.ready = true;
  }

  /* ---------------------------------------------------------------- */
  /* Interaction                                                       */
  /* ---------------------------------------------------------------- */

  private static INTERACTIVE = ['castle-icons', 'events', 'battlefield-fill', 'terr-fill'];

  private pick(point: PointLike): MapGeoJSONFeature | null {
    const layers = MapController.INTERACTIVE.filter((l) => this.map.getLayer(l) && this.map.getLayoutProperty(l, 'visibility') !== 'none');
    const feats = this.map.queryRenderedFeatures(point, { layers });
    const order = (f: MapGeoJSONFeature) => MapController.INTERACTIVE.indexOf(f.layer.id);
    feats.sort((a, b) => order(a) - order(b));
    return feats[0] ?? null;
  }

  private bindInteraction() {
    const m = this.map;
    m.on('mousemove', (e) => {
      const f = this.pick(e.point);
      m.getCanvas().style.cursor = f && f.layer.id !== 'terr-fill' ? 'pointer' : '';
      if (!f) {
        if (this.hoveredKey) {
          this.hoveredKey = '';
          this.cb.onHover(null);
        }
        return;
      }
      const p = f.properties as Record<string, string>;
      const key = `${f.layer.id}:${p.id}:${Math.round(e.point.x)}:${Math.round(e.point.y)}`;
      if (key === this.hoveredKey) return;
      this.hoveredKey = key;
      if (f.layer.id === 'castle-icons') this.cb.onHover({ x: e.point.x, y: e.point.y, text: p.name });
      else if (f.layer.id === 'events') this.cb.onHover({ x: e.point.x, y: e.point.y, text: p.name, sub: p.dateLabel });
      else if (f.layer.id === 'battlefield-fill') this.cb.onHover({ x: e.point.x, y: e.point.y, text: p.name, sub: p.register });
      else this.cb.onHover({ x: e.point.x, y: e.point.y, text: (p as unknown as TerritoryProps).name, sub: `${p.validFrom}–${p.validTo} · ${String(p.boundaryStatus).replace('-', ' ')} boundary` });
    });
    m.getCanvas().addEventListener('mouseleave', () => {
      this.hoveredKey = '';
      this.cb.onHover(null);
    });
    m.on('click', (e) => {
      const f = this.pick(e.point);
      if (!f) {
        this.cb.onSelect(null);
        return;
      }
      const p = f.properties as Record<string, string>;
      if (f.layer.id === 'castle-icons') this.cb.onSelect({ kind: 'castle', id: p.id });
      else if (f.layer.id === 'events') this.cb.onSelect({ kind: 'event', id: p.id });
      else if (f.layer.id === 'battlefield-fill' && p.eventId) this.cb.onSelect({ kind: 'event', id: p.eventId });
      else if (f.layer.id === 'terr-fill') this.cb.onSelect({ kind: 'territory', id: p.id });
    });
  }

  /* ---------------------------------------------------------------- */
  /* Per-frame update                                                  */
  /* ---------------------------------------------------------------- */

  frame(input: FrameInput) {
    if (!this.ready) return;
    const { year, ui } = input;
    const yi = Math.floor(year);
    const fk = filterKey(ui.filters);
    const L = ui.layers;

    // Layer visibility
    const vis = (id: string, on: boolean) => {
      if (!this.map.getLayer(id)) return;
      const v = on ? 'visible' : 'none';
      if (this.map.getLayoutProperty(id, 'visibility') !== v) this.map.setLayoutProperty(id, 'visibility', v);
    };
    vis('terr-fill', L.territories);
    vis('terr-label', L.territories || L.boundaries);
    vis('terr-line', L.boundaries || ui.frontiers);
    vis('heat-layer', L.heatmap);
    vis('battlefield-fill', L.battlefields);
    vis('battlefield-line', L.battlefields);
    vis('itinerary-line', L.campaigns);
    vis('itinerary-stops', L.campaigns);
    vis('itinerary-labels', L.campaigns);
    vis('castle-labels-major', L.castleNames && L.castles);
    vis('castle-labels-all', L.castleNames && L.castles);
    vis('event-labels', L.majorEvents);
    vis('castle-frontier', ui.frontiers);
    vis('castle-control', ui.frontiers);

    const frontierKey = ui.frontiers ? 'F' : '';
    if (this.setKey('terrStyle', frontierKey + (ui.highContrast ? 'H' : ''))) {
      this.map.setPaintProperty('terr-line', 'line-width', ui.frontiers ? ['interpolate', ['linear'], ['zoom'], 4, 1.8, 9, 3.2] : ['interpolate', ['linear'], ['zoom'], 4, 0.6, 9, 1.6]);
      this.map.setPaintProperty('terr-line', 'line-opacity', ui.frontiers ? 0.9 : 0.55);
      this.map.setPaintProperty('terr-line', 'line-color', ui.frontiers ? '#3a2f1f' : ui.highContrast ? '#111111' : '#5b4f3a');
      this.map.setPaintProperty('terr-fill', 'fill-opacity', ui.frontiers ? 0.08 : ['match', ['get', 'boundaryStatus'], 'documented-approximate', 0.24, 'disputed', 0.15, 0.19]);
    }

    // Territories: integer-year filter
    if (this.setKey('terrYear', String(yi))) {
      const f = ['all', ['<=', ['get', 'validFrom'], yi], ['>=', ['get', 'validTo'], yi]] as FilterSpecification;
      this.map.setFilter('terr-fill', f);
      this.map.setFilter('terr-line', f);
      this.map.setFilter('terr-label', f);
    }

    this.updateCastles(year, ui, fk);
    this.updateEvents(input, fk);
    this.updateHeat(input, fk);
    this.updatePulses(ui);
    this.updateSelection(ui.selection);
    this.lastYear = year;
  }

  private setKey(name: string, key: string): boolean {
    if (this.keys[name] === key) return false;
    this.keys[name] = key;
    return true;
  }

  private activeTerritories(yi: number) {
    return this.data.territories.features.filter((f) => f.properties.validFrom <= yi && f.properties.validTo >= yi);
  }

  private updateCastles(year: number, ui: UiState, fk: string) {
    const visible: CastleView[] = [];
    let certain = 0;
    for (const c of this.data.castles) {
      if (!castlePasses(c, ui.layers, ui.filters)) continue;
      if (c.t0 !== null && c.t0 > year) continue;
      visible.push(c);
      if (c.t1 !== null && c.t1 <= year) certain++;
    }
    const yi = Math.floor(year);
    let fsig = '';
    if (ui.frontiers) {
      const active = this.activeTerritories(yi);
      fsig = active.map((a) => a.properties.id).join(',');
      if (fsig !== this.frontierSig) {
        this.frontierSig = fsig;
        this.frontierCache.clear();
      }
    }
    let ctlTotal = 0;
    if (ui.frontiers) for (const c of visible) for (const ch of c.controlChanges) if (Math.floor(Number(ch.date.from.slice(0, 4))) <= yi) ctlTotal++;
    const sel = ui.selection?.kind === 'castle' ? ui.selection.id : '';
    const key = `${visible.length}|${certain}|${fk}|${JSON.stringify(ui.layers)}|${ui.frontiers ? fsig + ':' + ctlTotal : ''}|${sel}`;
    if (!this.setKey('castles', key)) return;
    const active = ui.frontiers ? this.activeTerritories(yi) : [];
    const features: Feature<Point>[] = visible.map((c) => {
      let front = 0;
      let ctl = 0;
      if (ui.frontiers) {
        let d = this.frontierCache.get(c.id);
        if (d === undefined) {
          d = frontierDistanceKm(c.coord, active, FRONTIER_KM * 2);
          this.frontierCache.set(c.id, d);
        }
        front = d <= FRONTIER_KM ? 1 : 0;
        ctl = c.controlChanges.filter((ch) => Number(ch.date.from.slice(0, 4)) <= yi).length;
      }
      const cat = castleCategory(c);
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: c.coord },
        properties: {
          id: c.id,
          name: c.name,
          icon: c.t0 === null ? 'castle-undated' : `castle-${cat}`,
          imp: c.importance,
          scale: c.provenance === 'curated' ? 1 : 0.8,
          op: c.t0 !== null && c.t1 !== null && c.t1 > year ? 0.5 : c.provenance === 'curated' ? 1 : 0.85,
          front,
          ctl,
        },
      };
    });
    (this.map.getSource('castles') as GeoJSONSource).setData({ type: 'FeatureCollection', features });
  }

  private updateEvents(input: FrameInput, fk: string) {
    const { year, ui } = input;
    const visible: EventView[] = [];
    for (const e of this.data.events) {
      if (e.t0 > year) break; // events are sorted by t0
      if (!e.location.point || e.location.kind === 'unknown') continue;
      if (!eventPasses(e, ui.layers, ui.filters)) continue;
      visible.push(e);
    }
    // Pulses for newly appeared significant events during forward playback
    const newIds = new Set(visible.map((e) => e.id));
    if (input.playing && !input.scrubbing && year >= this.lastYear) {
      const now = performance.now();
      for (const e of visible) {
        if (!this.visibleEventIds.has(e.id) && e.significance >= 0.9 && year - e.t0 < 3) {
          this.pulses.push({ id: e.id, lon: e.location.point![0], lat: e.location.point![1], start: now, strength: Math.min(2, e.significance) });
          if (ui.followCamera && e.significance >= NARRATION_THRESHOLD) {
            const opts = { center: e.location.point as [number, number], zoom: Math.max(this.map.getZoom(), 6.2) };
            if (ui.reducedMotion) this.map.jumpTo(opts);
            else this.map.easeTo({ ...opts, duration: 1600 });
          }
        }
      }
    }
    this.visibleEventIds = newIds;

    const sel = ui.selection?.kind === 'event' ? ui.selection.id : '';
    const ageBucket = Math.floor(year / 5);
    const key = `${visible.length}|${fk}|${JSON.stringify(ui.layers)}|${ageBucket}|${sel}`;
    if (!this.setKey('events', key)) return;
    const features: Feature<Point>[] = [];
    const alts: Feature<Point>[] = [];
    const lines: Feature<LineString>[] = [];
    const stops: Feature<Point>[] = [];
    const battlefieldIds = new Set<string>();
    for (const e of visible) {
      const age = year - e.t1;
      const fade = age < 25 ? 1 : Math.max(0.42, 1 - (age - 25) / 250);
      const u = e.location.kind === 'area' && e.location.samples.length ? 0 : e.location.uncertaintyKm ?? 0;
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: e.location.point! },
        properties: {
          id: e.id,
          name: e.name,
          type: e.type,
          dateLabel: formatHistoricalDate(e.date),
          size: e.provenance === 'curated' ? Math.min(2.2, 0.6 + e.significance * 0.7) : 0.25,
          major: e.significance >= NARRATION_THRESHOLD ? 1 : 0,
          // Major event names appear at national scale only for a few decades after the event
          recent: e.significance >= NARRATION_THRESHOLD && year - e.t0 < 40 ? 1 : 0,
          fade: e.provenance === 'curated' ? fade : fade * 0.6,
          r0: u > 0.75 ? r0ForKm(u, e.location.point![1]) : 0,
        },
      });
      if (e.location.kind === 'disputed') for (const a of e.location.alternatives) alts.push({ type: 'Feature', geometry: { type: 'Point', coordinates: a.point }, properties: { id: e.id, label: a.label } });
      // Itineraries are shown while a campaign runs and for a generation afterwards, then removed to avoid clutter.
      if (e.itinerary.length > 1 && year - e.t1 < 30) {
        lines.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: e.itinerary.map((s) => s.point) }, properties: { id: e.id } });
        for (const s of e.itinerary) stops.push({ type: 'Feature', geometry: { type: 'Point', coordinates: s.point }, properties: { id: e.id, label: s.label } });
      }
      if (e.location.polygonRef) battlefieldIds.add(e.id);
    }
    (this.map.getSource('events') as GeoJSONSource).setData({ type: 'FeatureCollection', features });
    (this.map.getSource('event-alts') as GeoJSONSource).setData({ type: 'FeatureCollection', features: alts });
    (this.map.getSource('itineraries') as GeoJSONSource).setData({ type: 'FeatureCollection', features: lines });
    (this.map.getSource('itinerary-stops') as GeoJSONSource).setData({ type: 'FeatureCollection', features: stops });
    const bf = this.data.battlefields.features.filter((f) => f.properties.eventId && battlefieldIds.has(f.properties.eventId));
    if (this.setKey('bf', String(bf.length))) (this.map.getSource('battlefields') as GeoJSONSource).setData({ type: 'FeatureCollection', features: bf as Feature<Geometry>[] });
  }

  private updateHeat(input: FrameInput, fk: string) {
    const { ui, year } = input;
    if (!ui.layers.heatmap) {
      this.keys.heat = '';
      return;
    }
    const s = ui.heat;
    if (this.heat.configure(s, (e) => heatEventPasses(this.data.eventById.get(e.id)!, ui.filters), fk)) {
      heatScaleStore.set((v) => ({ version: v.version + 1 }));
    }
    const sig = `${this.heat.activeSignature(year, s)}|${s.mode}|${s.memoryMeasure}|${s.estimate}|${s.influenceKm}|${s.halfLifeYears}|${s.windowYears}|${s.highContrast}|${fk}`;
    const now = performance.now();
    if (this.keys.heat === sig) return;
    if (input.playing && now - this.lastHeatAt < 45) return; // cap at ~22 updates/s during playback
    this.keys.heat = sig;
    this.lastHeatAt = now;
    const out = this.heat.render(year, s);
    const img = new ImageData(new Uint8ClampedArray(out.rgba), out.width, out.height);
    (this.map.getSource('heat') as ImageSource).updateImage({ image: img });
  }

  private updatePulses(ui: UiState) {
    const now = performance.now();
    const DURATION = ui.reducedMotion ? 900 : 1800;
    this.pulses = this.pulses.filter((p) => now - p.start < DURATION);
    if (this.pulses.length === 0) {
      if (this.setKey('pulses', 'empty')) (this.map.getSource('pulses') as GeoJSONSource).setData(EMPTY);
      return;
    }
    this.keys.pulses = String(now);
    const features = this.pulses.map((p) => {
      const t = (now - p.start) / DURATION;
      const r = ui.reducedMotion ? 10 * p.strength : (6 + 34 * Math.sqrt(t)) * p.strength;
      const a = ui.reducedMotion ? 0.35 * (1 - t) : 0.45 * (1 - t) * (1 - t);
      return { type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [p.lon, p.lat] }, properties: { r, a } };
    });
    (this.map.getSource('pulses') as GeoJSONSource).setData({ type: 'FeatureCollection', features });
  }

  private updateSelection(sel: Selection) {
    let coord: [number, number] | null = null;
    if (sel?.kind === 'castle') coord = this.data.castleById.get(sel.id)?.coord ?? null;
    if (sel?.kind === 'event') coord = this.data.eventById.get(sel.id)?.location.point ?? null;
    const key = coord ? coord.join(',') : '';
    if (!this.setKey('selection', key)) return;
    (this.map.getSource('selection') as GeoJSONSource).setData(coord ? { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: coord }, properties: {} }] } : EMPTY);
  }

  /* ---------------------------------------------------------------- */
  /* Camera and theme                                                  */
  /* ---------------------------------------------------------------- */

  flyTo(center: [number, number], zoom: number, reducedMotion: boolean) {
    const opts = { center, zoom: Math.max(zoom, this.map.getZoom() < zoom - 3 ? zoom : this.map.getZoom()) };
    if (reducedMotion) this.map.jumpTo(opts);
    else this.map.flyTo({ ...opts, duration: 1800, essential: false });
  }

  resetView(reducedMotion: boolean) {
    this.map.fitBounds(GB_BOUNDS, { padding: { top: 64, bottom: 140, left: 20, right: 20 }, duration: reducedMotion ? 0 : 1200 });
  }

  setTheme(highContrast: boolean) {
    const t = highContrast ? HIGH_CONTRAST : PARCHMENT;
    if (t === this.theme || !this.ready) return;
    this.theme = t;
    const m = this.map;
    const paint = (id: string, prop: string, v: unknown) => m.getLayer(id) && m.setPaintProperty(id, prop as Parameters<MlMap['setPaintProperty']>[1], v as Parameters<MlMap['setPaintProperty']>[2]);
    paint('background', 'background-color', t.background);
    paint('land-fallback', 'fill-color', t.land);
    paint('water', 'fill-color', t.water);
    paint('wood', 'fill-color', t.wood);
    paint('waterway', 'line-color', t.river);
    paint('coast', 'line-color', t.coast);
    paint('place-names', 'text-color', t.label);
    paint('place-names', 'text-halo-color', t.labelHalo);
    paint('water-names', 'text-color', t.waterLabel);
    paint('relief', 'raster-opacity', t.reliefOpacity);
    paint('terr-label', 'text-color', highContrast ? '#000000' : '#4b4232');
    paint('terr-label', 'text-opacity', highContrast ? 0.85 : 0.55);
    for (const id of ['castle-labels-major', 'castle-labels-all']) {
      paint(id, 'text-color', highContrast ? '#000000' : '#2f281e');
      paint(id, 'text-halo-color', highContrast ? '#ffffff' : '#f3ecdc');
    }
    addCastleIcons(m, highContrast);
    this.keys = {};
  }

  heatScale(measure: 'deaths' | 'events') {
    return this.heat.scaleFor(measure);
  }

  /** True while a pulse animation is running (the app keeps requesting frames). */
  get animating() {
    return this.pulses.length > 0;
  }

  destroy() {
    this.map.remove();
  }
}

function blankPng(): string {
  const c = document.createElement('canvas');
  c.width = 1;
  c.height = 1;
  return c.toDataURL();
}
