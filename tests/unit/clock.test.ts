import { describe, expect, it } from 'vitest';
import { PlaybackController, YEAR_MAX, YEAR_MIN, buildCinematicMapping, linearMapping } from '../../src/timeline/clock';

function fakeEnv() {
  let t = 0;
  const callbacks: ((t: number) => void)[] = [];
  return {
    now: () => t,
    advance(ms: number) { t += ms; },
    raf: (cb: (t: number) => void) => { callbacks.push(cb); return callbacks.length; },
    cancel: () => {},
    flush() { const cbs = callbacks.splice(0); cbs.forEach((cb) => cb(t)); },
  };
}

describe('linear mapping', () => {
  it('maps endpoints exactly', () => {
    expect(linearMapping.yearAt(0)).toBe(YEAR_MIN);
    expect(linearMapping.yearAt(1)).toBe(YEAR_MAX);
    expect(linearMapping.uAt(1500)).toBeCloseTo(0.5);
  });
});

describe('cinematic mapping', () => {
  const m = buildCinematicMapping([{ year: 1066, weight: 5 }, { year: 1314, weight: 3 }, { year: 1746, weight: 4 }]);
  it('is monotone and covers the full range', () => {
    expect(m.yearAt(0)).toBe(YEAR_MIN);
    expect(m.yearAt(1)).toBe(YEAR_MAX);
    let prev = -Infinity;
    for (let u = 0; u <= 1; u += 0.001) {
      const y = m.yearAt(u);
      expect(y).toBeGreaterThanOrEqual(prev);
      prev = y;
    }
  });
  it('inverts uAt', () => {
    for (const y of [1000, 1066, 1200, 1500, 1746, 1999, 2000]) expect(m.yearAt(m.uAt(y))).toBeCloseTo(y, 1);
  });
  it('gives significant years more screen time than quiet years', () => {
    const around = (y: number) => m.uAt(y + 5) - m.uAt(y - 5);
    expect(around(1066)).toBeGreaterThan(around(1900) * 2);
  });
  it('falls back to linear pacing with no events', () => {
    const flat = buildCinematicMapping([]);
    expect(flat.yearAt(0.5)).toBeCloseTo(1500, 5);
  });
});

describe('PlaybackController', () => {
  it('advances by wall-clock time, not frames', () => {
    const env = fakeEnv();
    const states: number[] = [];
    const c = new PlaybackController((s) => states.push(s.year), env.now, env.raf, env.cancel);
    c.setDuration(1000);
    c.play();
    env.advance(250);
    env.flush();
    expect(c.state.year).toBeCloseTo(1250);
    // Many frames in the same instant do not advance time
    env.flush(); env.flush();
    expect(c.state.year).toBeCloseTo(1250);
  });

  it('stops exactly at AD 2000', () => {
    const env = fakeEnv();
    const c = new PlaybackController(() => {}, env.now, env.raf, env.cancel);
    c.setDuration(1000);
    c.play();
    env.advance(5000);
    env.flush();
    expect(c.state.year).toBe(2000);
    expect(c.state.playing).toBe(false);
  });

  it('pause freezes the year; seek and restart are exact', () => {
    const env = fakeEnv();
    const c = new PlaybackController(() => {}, env.now, env.raf, env.cancel);
    c.setDuration(10_000);
    c.play();
    env.advance(5000);
    env.flush();
    c.pause();
    const y = c.state.year;
    env.advance(5000);
    env.flush();
    expect(c.state.year).toBe(y);
    c.seek(1314.5);
    expect(c.state.year).toBe(1314.5);
    c.restart();
    expect(c.state.year).toBe(1000);
  });

  it('completes 2, 3, 5 and 10 minute playbacks within their durations', () => {
    for (const minutes of [2, 3, 5, 10]) {
      for (const mapping of [linearMapping, buildCinematicMapping([{ year: 1066, weight: 1 }])]) {
        const env = fakeEnv();
        const c = new PlaybackController(() => {}, env.now, env.raf, env.cancel);
        c.setDuration(minutes * 60_000);
        c.setMapping(mapping);
        c.play();
        env.advance(minutes * 60_000 - 1);
        env.flush();
        expect(c.state.playing).toBe(true);
        env.advance(1);
        env.flush();
        expect(c.state.year).toBe(2000);
        expect(c.state.playing).toBe(false);
      }
    }
  });

  it('keeps the current year when switching mode mid-playback', () => {
    const env = fakeEnv();
    const c = new PlaybackController(() => {}, env.now, env.raf, env.cancel);
    c.setDuration(1000);
    c.play();
    env.advance(300);
    env.flush();
    const before = c.state.year;
    c.setMapping(buildCinematicMapping([{ year: 1700, weight: 10 }]));
    env.flush();
    expect(c.state.year).toBeCloseTo(before, 3);
  });
});
