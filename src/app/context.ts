import { createContext, useContext, type RefObject } from 'react';
import type { Dataset } from '../historical-data/dataset';
import type { MapController } from '../map/MapController';
import type { SearchIndex } from '../search/search';

export interface AppContext {
  data: Dataset | null;
  controller: RefObject<MapController | null>;
  search: SearchIndex | null;
}

export const DataContext = createContext<AppContext>({ data: null, controller: { current: null }, search: null });

export function useApp() {
  return useContext(DataContext);
}

/** Dataset accessor for components rendered only after loading. */
export function useData() {
  const d = useContext(DataContext).data;
  if (!d) throw new Error('Dataset not loaded');
  return d;
}
