import { useMemo } from 'react';
import { useData } from '../app/context';
import { NARRATION_THRESHOLD } from '../historical-data/dataset';
import { formatHistoricalDate, startYear } from '../historical-data/dates';
import { select, timeStore, uiStore, useStore } from '../state/store';
import { currentMapping } from '../timeline/playback';

interface Card {
  key: string;
  t: number;
  kind: 'event' | 'transition';
  title: string;
  date: string;
  powers?: string;
  text: string;
  outcome?: string;
  id?: string;
  source?: string;
}

/**
 * Optional narration: shows the most recent significant recorded event or documented
 * territorial change for a few seconds of screen time. Minor events never interrupt.
 */
export function Narration() {
  const data = useData();
  const enabled = useStore(uiStore, (s) => s.narration && s.layers.majorEvents);
  const year = useStore(timeStore, (s) => s.year);
  const durationMin = useStore(uiStore, (s) => s.durationMin);

  const cards = useMemo<Card[]>(() => {
    const c: Card[] = data.events
      .filter((e) => e.significance >= NARRATION_THRESHOLD && e.provenance === 'curated')
      .map((e) => ({
        key: e.id,
        t: e.t0,
        kind: 'event',
        id: e.id,
        title: e.name,
        date: formatHistoricalDate(e.date),
        powers: e.participants.slice(0, 3).map((p) => p.name).join(' · '),
        text: e.narrative ?? '',
        outcome: e.outcome ?? undefined,
        source: data.sources.get(e.sources[0]?.sourceId)?.title,
      }));
    for (const t of data.transitions) {
      c.push({ key: t.id, t: startYear(t.date), kind: 'transition', title: t.title, date: formatHistoricalDate(t.date), text: t.description, source: data.sources.get(t.sources[0]?.sourceId)?.title });
    }
    return c.sort((a, b) => a.t - b.t);
  }, [data]);

  if (!enabled) return null;
  // Show a card for ~5 seconds of wall-clock time at the current pacing.
  const m = currentMapping();
  const u = m.uAt(year);
  const windowU = 5 / (durationMin * 60);
  let card: Card | null = null;
  for (let i = cards.length - 1; i >= 0; i--) {
    const c = cards[i];
    if (c.t > year) continue;
    if (u - m.uAt(c.t) <= windowU) card = c;
    break;
  }
  if (!card) return null;
  return (
    <div className={`narration ${card.kind}`} aria-live="polite" key={card.key}>
      <p className="kicker">{card.kind === 'transition' ? 'Change of authority' : 'Recorded event'} · {card.date}</p>
      <h2>{card.id ? <button className="link" onClick={() => select({ kind: 'event', id: card!.id! })}>{card.title}</button> : card.title}</h2>
      {card.powers && <p className="powers">{card.powers}</p>}
      <p>{card.text}</p>
      {card.outcome && <p className="outcome">{card.outcome}</p>}
      {card.source && <p className="source">Source: {card.source}</p>}
    </div>
  );
}
