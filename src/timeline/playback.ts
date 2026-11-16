/** The application's single playback clock, wired to the time store. */
import { PlaybackController, buildCinematicMapping, linearMapping, type TimeMapping } from './clock';
import { timeStore, uiStore } from '../state/store';

export const playback = new PlaybackController((s) => timeStore.set({ year: s.year, playing: s.playing }));

let cinematic: TimeMapping = linearMapping;

export function setSignificance(points: { year: number; weight: number }[]) {
  cinematic = buildCinematicMapping(points);
  applyPacing();
}

export function applyPacing() {
  const ui = uiStore.get();
  playback.setMapping(ui.pacing === 'cinematic' ? cinematic : linearMapping);
  playback.setDuration(ui.durationMin * 60_000);
}

export const currentMapping = () => (uiStore.get().pacing === 'cinematic' ? cinematic : linearMapping);

/** Era presets: navigation groupings only, not precise period boundaries. */
export const ERAS: { label: string; short: string; from: number; to: number }[] = [
  { label: 'Pre-Norman Britain', short: 'Pre-Norman', from: 1000, to: 1065 },
  { label: 'Norman Conquest and succession conflicts', short: 'Norman', from: 1066, to: 1153 },
  { label: 'Angevin and border conflicts', short: 'Angevin', from: 1154, to: 1276 },
  { label: "Edward I's conquest of Wales", short: 'Conquest of Wales', from: 1277, to: 1283 },
  { label: 'Wars of Scottish Independence', short: 'Scottish Wars', from: 1296, to: 1357 },
  { label: 'Late medieval conflict and the Wars of the Roses', short: 'Roses', from: 1358, to: 1485 },
  { label: 'Tudor period', short: 'Tudor', from: 1486, to: 1602 },
  { label: 'Wars of the Three Kingdoms', short: 'Three Kingdoms', from: 1603, to: 1700 },
  { label: 'Jacobite risings', short: 'Jacobite', from: 1701, to: 1746 },
  { label: 'Fortification heritage and later military history', short: 'Modern', from: 1747, to: 2000 },
];
