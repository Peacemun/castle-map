import { useMemo, useRef, useState } from 'react';
import { useData } from '../app/context';
import { toggleFullscreen } from '../app/fullscreen';
import { NARRATION_THRESHOLD } from '../historical-data/dataset';
import { timeStore, uiStore, useStore } from '../state/store';
import { applyPacing, ERAS, playback } from '../timeline/playback';
import { YEAR_MAX, YEAR_MIN } from '../timeline/clock';

const pct = (y: number) => ((y - YEAR_MIN) / (YEAR_MAX - YEAR_MIN)) * 100;

function Icon({ d, label }: { d: string; label: string }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <title>{label}</title>
      <path d={d} fill="currentColor" />
    </svg>
  );
}
const ICONS = {
  play: 'M7 4.5v15l13-7.5z',
  pause: 'M6 4h4.5v16H6zM13.5 4H18v16h-4.5z',
  restart: 'M5 4h2.5v16H5zM20 4.5v15L9 12z',
  end: 'M16.5 4H19v16h-2.5zM4 4.5v15L15 12z',
  back: 'M11.5 5v14L3 12zM21 5v14l-8.5-7z',
  fwd: 'M12.5 5v14l8.5-7zM3 5v14l8.5-7z',
  full: 'M4 4h6v2H6v4H4zm10 0h6v6h-2V6h-4zM4 14h2v4h4v2H4zm14 0h2v6h-6v-2h4z',
};

export function Timeline() {
  const data = useData();
  const year = useStore(timeStore, (s) => s.year);
  const playing = useStore(timeStore, (s) => s.playing);
  const durationMin = useStore(uiStore, (s) => s.durationMin);
  const pacing = useStore(uiStore, (s) => s.pacing);
  const trackRef = useRef<HTMLDivElement>(null);
  const wasPlaying = useRef(false);
  const [goto, setGoto] = useState('');

  const milestones = useMemo(
    () => data.events.filter((e) => e.significance >= NARRATION_THRESHOLD && e.provenance === 'curated').map((e) => ({ id: e.id, year: e.t0, name: e.name })),
    [data],
  );
  const era = ERAS.find((e) => year >= e.from && year < e.to + 1);

  const yearFromX = (clientX: number) => {
    const r = trackRef.current!.getBoundingClientRect();
    return YEAR_MIN + Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * (YEAR_MAX - YEAR_MIN);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    wasPlaying.current = playback.state.playing;
    playback.pause();
    timeStore.set({ scrubbing: true });
    (e.target as Element).setPointerCapture?.(e.pointerId);
    playback.seek(yearFromX(e.clientX));
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (timeStore.get().scrubbing) playback.seek(yearFromX(e.clientX));
  };
  const onPointerUp = () => {
    if (!timeStore.get().scrubbing) return;
    timeStore.set({ scrubbing: false });
    if (wasPlaying.current) playback.play();
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 1;
    const map: Record<string, number> = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step, PageDown: -50, PageUp: 50 };
    if (e.key in map) {
      e.preventDefault();
      playback.step(map[e.key]);
    } else if (e.key === 'Home') {
      e.preventDefault();
      playback.restart();
    } else if (e.key === 'End') {
      e.preventDefault();
      playback.seek(YEAR_MAX);
    }
  };

  const submitGoto = (e: React.FormEvent) => {
    e.preventDefault();
    const y = Number(goto);
    if (Number.isFinite(y) && y >= YEAR_MIN && y <= YEAR_MAX) {
      playback.seek(y);
      setGoto('');
    }
  };

  const yi = Math.floor(year);
  return (
    <footer className="timeline" aria-label="Timeline">
      <div className="eras" aria-label="Historical periods">
        {ERAS.map((e) => (
          <button
            key={e.label}
            className={`era ${era === e ? 'current' : ''}`}
            style={{ left: `${pct(e.from)}%`, width: `${pct(e.to + 1) - pct(e.from)}%` }}
            title={`${e.label} (AD ${e.from}–${e.to}); a navigation grouping, not a precise period boundary`}
            onClick={() => playback.seek(e.from)}
          >
            <span>{e.short}</span>
          </button>
        ))}
      </div>
      <div className="track-row">
        <div className="year-display" aria-live="off">
          <span className="ad">AD</span>
          <span className="year" data-testid="current-year">{yi}</span>
          <span className="era-name">{era?.label ?? ''}</span>
        </div>
        <div
          ref={trackRef}
          className="track"
          role="slider"
          tabIndex={0}
          aria-label="Historical year"
          aria-valuemin={YEAR_MIN}
          aria-valuemax={YEAR_MAX}
          aria-valuenow={yi}
          aria-valuetext={`AD ${yi}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
        >
          <div className="rail" />
          <div className="progress" style={{ width: `${pct(year)}%` }} />
          {Array.from({ length: 11 }, (_, i) => 1000 + i * 100).map((y) => (
            <span key={y} className="tick" style={{ left: `${pct(y)}%` }}>
              <span className="tick-label">{y}</span>
            </span>
          ))}
          {milestones.map((m) => (
            <span key={m.id} className={`milestone ${m.year <= year ? 'past' : ''}`} style={{ left: `${pct(m.year)}%` }} title={`${m.name} (${Math.floor(m.year)})`} />
          ))}
          <div className="handle" style={{ left: `${pct(year)}%` }} />
        </div>
      </div>
      <div className="controls">
        <div className="transport">
          <button onClick={() => playback.restart()} aria-label="Restart from AD 1000" title="Restart (Home)"><Icon d={ICONS.restart} label="Restart" /></button>
          <button onClick={() => playback.step(-10)} aria-label="Back 10 years" title="Back 10 years (Shift+←)"><Icon d={ICONS.back} label="Back" /></button>
          <button className="play" onClick={() => playback.toggle()} aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause (Space)' : 'Play (Space)'} data-testid="play-toggle">
            <Icon d={playing ? ICONS.pause : ICONS.play} label={playing ? 'Pause' : 'Play'} />
          </button>
          <button onClick={() => playback.step(10)} aria-label="Forward 10 years" title="Forward 10 years (Shift+→)"><Icon d={ICONS.fwd} label="Forward" /></button>
          <button onClick={() => { playback.pause(); playback.seek(YEAR_MAX); }} aria-label="Go to AD 2000" title="Go to AD 2000 (End)"><Icon d={ICONS.end} label="End" /></button>
        </div>
        <form className="goto" onSubmit={submitGoto}>
          <label htmlFor="goto-year" className="sr-only">Go to year</label>
          <input id="goto-year" type="number" min={YEAR_MIN} max={YEAR_MAX} placeholder="Year" value={goto} onChange={(e) => setGoto(e.target.value)} />
          <button type="submit">Go</button>
        </form>
        <div className="segmented" role="group" aria-label="Playback duration">
          {([2, 3, 5, 10] as const).map((d) => (
            <button key={d} aria-pressed={durationMin === d} className={durationMin === d ? 'on' : ''} onClick={() => { uiStore.set({ durationMin: d }); applyPacing(); }}>
              {d} min
            </button>
          ))}
        </div>
        <div className="segmented" role="group" aria-label="Pacing">
          <button aria-pressed={pacing === 'chronological'} className={pacing === 'chronological' ? 'on' : ''} title="Constant historical rate" onClick={() => { uiStore.set({ pacing: 'chronological' }); applyPacing(); }}>
            Chronological
          </button>
          <button aria-pressed={pacing === 'cinematic'} className={pacing === 'cinematic' ? 'on' : ''} title="Slows down around significant recorded events (data-driven); same total duration" onClick={() => { uiStore.set({ pacing: 'cinematic' }); applyPacing(); }}>
            Cinematic
          </button>
        </div>
        <button className="icon-btn" onClick={toggleFullscreen} aria-label="Toggle fullscreen" title="Fullscreen (F)"><Icon d={ICONS.full} label="Fullscreen" /></button>
      </div>
    </footer>
  );
}
