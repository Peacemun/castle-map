/**
 * Minimal external stores (no framework dependency).
 * The high-frequency clock lives in its own store so that 60 fps year updates only
 * re-render the few components that display the year; the map subscribes directly.
 */
import { useSyncExternalStore } from 'react';
import { DEFAULT_HEAT, type HeatSettings } from '../heatmap/engine';
import type { HistoricalEvent } from '../historical-data/schemas';

export interface Store<T> {
  get(): T;
  set(patch: Partial<T> | ((s: T) => Partial<T>)): void;
  subscribe(fn: () => void): () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(patch) {
      const p = typeof patch === 'function' ? patch(state) : patch;
      let changed = false;
      for (const k in p) if (!Object.is(p[k], state[k])) changed = true;
      if (!changed) return;
      state = { ...state, ...p };
      listeners.forEach((l) => l());
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

export function useStore<T extends object, S>(store: Store<T>, selector: (s: T) => S): S {
  return useSyncExternalStore(store.subscribe, () => selector(store.get()), () => selector(store.get()));
}

/* ------------------------------------------------------------------ */

export interface TimeState {
  year: number;
  playing: boolean;
  /** True while the user drags the timeline. */
  scrubbing: boolean;
}

/** Bumped whenever the heat engine rebuilds its reference colour scales (legend refresh). */
export const heatScaleStore = createStore({ version: 0 });

export const timeStore = createStore<TimeState>({ year: 1000, playing: false, scrubbing: false });

export interface Layers {
  castles: boolean;
  surviving: boolean;
  ruinedLost: boolean;
  undated: boolean;
  castleNames: boolean;
  battles: boolean;
  sieges: boolean;
  otherEvents: boolean;
  campaigns: boolean;
  territories: boolean;
  boundaries: boolean;
  heatmap: boolean;
  majorEvents: boolean;
  battlefields: boolean;
}

export const DEFAULT_LAYERS: Layers = {
  castles: true,
  surviving: true,
  ruinedLost: true,
  undated: false,
  castleNames: true,
  battles: true,
  sieges: true,
  otherEvents: true,
  campaigns: true,
  territories: true,
  boundaries: true,
  heatmap: true,
  majorEvents: true,
  battlefields: true,
};

export type Selection = { kind: 'castle' | 'event' | 'territory'; id: string } | null;
export type PanelId = 'layers' | 'heatmap' | 'stats' | 'uncertain' | 'about' | null;
export type Country = 'England' | 'Scotland' | 'Wales';

export interface Filters {
  countries: Country[];
  eventTypes: HistoricalEvent['type'][];
  /** Inclusive century range, e.g. [11, 20] = AD 1001–2000 (AD 1000 belongs to the 10th century but is included). */
  centuries: [number, number];
  /** Include records imported from Wikidata (unreviewed). */
  imported: boolean;
}

export const ALL_EVENT_TYPES: HistoricalEvent['type'][] = ['battle', 'siege', 'raid', 'skirmish', 'rebellion', 'campaign', 'massacre', 'air-raid', 'political-change'];

export const DEFAULT_FILTERS: Filters = {
  countries: ['England', 'Scotland', 'Wales'],
  eventTypes: ALL_EVENT_TYPES,
  centuries: [11, 20],
  imported: true,
};

export interface UiState {
  durationMin: 2 | 3 | 5 | 10;
  pacing: 'chronological' | 'cinematic';
  layers: Layers;
  heat: HeatSettings;
  filters: Filters;
  selection: Selection;
  panel: PanelId;
  frontiers: boolean;
  narration: boolean;
  followCamera: boolean;
  highContrast: boolean;
  reducedMotion: boolean;
  hover: { x: number; y: number; text: string; sub?: string } | null;
}

const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const prefersContrast = typeof window !== 'undefined' && window.matchMedia?.('(prefers-contrast: more)').matches;

export const uiStore = createStore<UiState>({
  durationMin: 3,
  pacing: 'cinematic',
  layers: DEFAULT_LAYERS,
  heat: DEFAULT_HEAT,
  filters: DEFAULT_FILTERS,
  selection: null,
  panel: null,
  frontiers: false,
  narration: true,
  followCamera: false,
  highContrast: !!prefersContrast,
  reducedMotion: !!prefersReducedMotion,
  hover: null,
});

export const setLayer = (k: keyof Layers, v: boolean) => uiStore.set((s) => ({ layers: { ...s.layers, [k]: v } }));
export const setHeat = (patch: Partial<HeatSettings>) => uiStore.set((s) => ({ heat: { ...s.heat, ...patch } }));
export const setFilters = (patch: Partial<Filters>) => uiStore.set((s) => ({ filters: { ...s.filters, ...patch } }));
export const select = (selection: Selection) => uiStore.set({ selection });
export const openPanel = (panel: PanelId) => uiStore.set((s) => ({ panel: s.panel === panel ? null : panel }));
