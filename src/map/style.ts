/**
 * Historical cartographic basemap built on OpenFreeMap vector tiles (OpenMapTiles
 * schema) and Natural Earth shaded relief. Modern roads, railways, buildings and
 * administrative boundaries are deliberately omitted so that modern borders are never
 * mistaken for historical ones. Only coast, water, rivers, woodland, relief and
 * (at closer zoom) modern settlement names for orientation are drawn.
 */
import type { StyleSpecification } from 'maplibre-gl';

export interface Theme {
  background: string;
  land: string;
  coast: string;
  water: string;
  wood: string;
  river: string;
  label: string;
  labelHalo: string;
  waterLabel: string;
  reliefOpacity: number;
}

export const PARCHMENT: Theme = {
  background: '#cdd3cc',
  land: '#ebe3cf',
  coast: '#8f8a78',
  water: '#c4cdc8',
  wood: '#d9d4b6',
  river: '#a9b8b4',
  label: '#6d6352',
  labelHalo: '#efe8d6',
  waterLabel: '#6f8285',
  reliefOpacity: 0.32,
};

export const HIGH_CONTRAST: Theme = {
  background: '#9fc3d8',
  land: '#fbf8f0',
  coast: '#1c1c1c',
  water: '#9fc3d8',
  wood: '#eef0e2',
  river: '#6f9fbd',
  label: '#111111',
  labelHalo: '#ffffff',
  waterLabel: '#16384d',
  reliefOpacity: 0.12,
};

export const OPENFREEMAP_ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> · <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">© OpenMapTiles</a> · Data <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a> · Relief <a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener">Natural Earth</a>';

export function buildStyle(theme: Theme, landUrl: string, offline = false): StyleSpecification {
  const style: StyleSpecification = {
    version: 8,
    name: 'Castle Map historical',
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      // Local coastline: always available, even if the tile service is not.
      land: { type: 'geojson', data: landUrl },
      ...(offline
        ? {}
        : {
            openmaptiles: { type: 'vector', url: 'https://tiles.openfreemap.org/planet', attribution: OPENFREEMAP_ATTRIBUTION },
            relief: {
              type: 'raster',
              tiles: ['https://tiles.openfreemap.org/natural_earth/ne2sr/{z}/{x}/{y}.png'],
              tileSize: 256,
              maxzoom: 6,
            },
          }),
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': theme.background } },
      { id: 'land-fallback', type: 'fill', source: 'land', paint: { 'fill-color': theme.land, 'fill-antialias': true } },
      ...(offline
        ? []
        : ([
            {
              id: 'relief',
              type: 'raster',
              source: 'relief',
              maxzoom: 9,
              paint: {
                'raster-opacity': ['interpolate', ['linear'], ['zoom'], 4, theme.reliefOpacity, 8, theme.reliefOpacity * 0.6, 9, 0],
                'raster-saturation': -1,
                'raster-contrast': -0.15,
                'raster-brightness-min': 0.25,
              },
            },
            {
              id: 'wood',
              type: 'fill',
              source: 'openmaptiles',
              'source-layer': 'landcover',
              minzoom: 7,
              filter: ['==', ['get', 'class'], 'wood'],
              paint: { 'fill-color': theme.wood, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0, 9, 0.55] },
            },
            {
              id: 'water',
              type: 'fill',
              source: 'openmaptiles',
              'source-layer': 'water',
              paint: { 'fill-color': theme.water },
            },
            {
              id: 'waterway',
              type: 'line',
              source: 'openmaptiles',
              'source-layer': 'waterway',
              minzoom: 6,
              filter: ['==', ['get', 'class'], 'river'],
              paint: { 'line-color': theme.river, 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.4, 10, 1.4, 14, 3] },
            },
          ] as StyleSpecification['layers'])),
      { id: 'coast', type: 'line', source: 'land', paint: { 'line-color': theme.coast, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.5, 10, 1.1], 'line-opacity': 0.7 } },
    ],
  };
  return style;
}

/** Label layers added on top of the historical overlays (modern names for orientation only). */
export function labelLayers(theme: Theme, offline = false): StyleSpecification['layers'] {
  if (offline) return [];
  return [
    {
      id: 'water-names',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'water_name',
      minzoom: 4,
      filter: ['in', ['get', 'class'], ['literal', ['ocean', 'sea', 'bay', 'strait']]],
      layout: {
        'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']],
        'text-font': ['Noto Sans Italic'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 4, 10, 8, 13],
        'text-letter-spacing': 0.15,
        'text-max-width': 6,
      },
      paint: { 'text-color': theme.waterLabel, 'text-halo-color': theme.background, 'text-halo-width': 1, 'text-opacity': 0.75 },
    },
    {
      id: 'place-names',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'place',
      minzoom: 6.5,
      filter: ['in', ['get', 'class'], ['literal', ['city', 'town']]],
      layout: {
        'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']],
        'text-font': ['Noto Sans Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 6.5, 9, 10, 12],
        'symbol-sort-key': ['get', 'rank'],
        'text-padding': 4,
      },
      paint: { 'text-color': theme.label, 'text-halo-color': theme.labelHalo, 'text-halo-width': 1.2, 'text-opacity': 0.7 },
    },
  ] as StyleSpecification['layers'];
}
