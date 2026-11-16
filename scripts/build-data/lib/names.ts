/** Name normalisation used for deduplication and register matching. */

const STOP = new Set(['the', 'of', 'and', 'at', 'a', 'castle', 'castell', 'battle', 'siege', 'sieges', 'first', 'second', 'third', 'capture', 'action', 'skirmish', 'massacre', 'rout', 'storming', 'sack', 'raid']);

export function normaliseName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/\b\d{3,4}\b/g, ' ')
    .replace(/\b(i{1,3}|iv)\b/g, ' ')
    .replace(/[^a-z\s-]/g, ' ')
    .replace(/-/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w))
    .join(' ')
    .trim();
}

export function tokens(s: string): Set<string> {
  return new Set(normaliseName(s).split(' ').filter(Boolean));
}

/** Similarity in [0,1]: 1 when normalised names are equal, otherwise token Jaccard. */
export function nameSimilarity(a: string, b: string): number {
  const na = normaliseName(a);
  const nb = normaliseName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ta = tokens(a);
  const tb = tokens(b);
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const jac = inter / (ta.size + tb.size - inter);
  // "Edinburgh" vs "Edinburgh Old Town" etc.: containment counts strongly
  if (inter > 0 && (inter === ta.size || inter === tb.size)) return Math.max(jac, 0.75);
  return jac;
}

export function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Year given in a register name such as "Battle of Towton 1461". */
export function yearInName(s: string): number | null {
  const m = /\b(1\d{3})\b/.exec(s);
  return m ? Number(m[1]) : null;
}
