/**
 * Lightweight, dependency-free fuzzy matching used by Booklit search.
 *
 * The Add Book search must never behave like an exact-match filter: a reader who
 * types "atomic habit", "dostoesvky", or "sci fi" should still find the book they
 * mean. Everything here is deterministic so it can be unit tested.
 */

export type MatchKind = 'exact' | 'close' | 'similar';

export interface FuzzyMatch {
  score: number;
  kind: MatchKind;
}

export function normalizeQuery(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(input: string): string[] {
  const parts = normalizeQuery(input).split(' ').filter(Boolean);
  return parts.filter((t) => t.length > 1 || parts.length === 1);
}

/** Optimal-string-alignment style distance (Levenshtein). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let prev = new Array(b.length + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = row;
  }
  return prev[b.length];
}

/** 0..1 fuzzy similarity between two short strings, tolerant of typos. */
export function similarity(a: string, b: string): number {
  const x = normalizeQuery(a);
  const y = normalizeQuery(b);
  if (!x || !y) return 0;
  if (x === y) return 1;

  const [shorter, longer] = x.length <= y.length ? [x, y] : [y, x];
  // Substring boosts only make sense for meaningful fragments ("meditat" in
  // "meditations"), never for 2-letter glue words that appear everywhere.
  if (shorter.length >= 4 && longer.includes(shorter)) {
    return 0.86 + 0.1 * (shorter.length / longer.length);
  }
  if (shorter.length >= 3 && longer.startsWith(shorter)) return 0.82;

  const distance = levenshtein(x, y);
  const maxLen = Math.max(x.length, y.length);
  const base = Math.max(0, 1 - distance / maxLen);
  // Reward shared prefixes so "project hail" still resolves to "Project Hail Mary".
  const prefixOverlap = sharedPrefixLength(x, y) / Math.min(x.length, y.length);
  return Math.min(1, base * 0.82 + prefixOverlap * 0.2);
}

export function sharedPrefixLength(a: string, b: string): number {
  const limit = Math.min(a.length, b.length);
  let i = 0;
  while (i < limit && a[i] === b[i]) i++;
  return i;
}

/**
 * Score one candidate field (title, author, subgenre…) against a query.
 * Token-level matching means "dune herbert" matches both title and author.
 */
export function scoreField(field: string, query: string): number {
  const q = normalizeQuery(query);
  if (!q) return 0;
  const f = normalizeQuery(field);
  if (!f) return 0;

  if (f === q) return 1;
  if (f.startsWith(q)) return 0.97;
  if (f.includes(q)) return 0.93;

  const queryTokens = tokenize(query);
  const fieldTokens = tokenize(field);
  if (queryTokens.length === 0 || fieldTokens.length === 0) return 0;

  let tokenScore = 0;
  for (const qt of queryTokens) {
    let best = 0;
    for (const ft of fieldTokens) {
      const shortest = Math.min(ft.length, qt.length);
      if (ft === qt) best = Math.max(best, 1);
      else if (shortest >= 3 && ft.startsWith(qt)) best = Math.max(best, 0.92);
      else if (shortest >= 4 && ft.includes(qt)) best = Math.max(best, 0.87);
      else if (shortest >= 4) {
        // Typo tolerance, scaled by query-token length so short tokens stay strict.
        const sim = similarity(qt, ft);
        const threshold = qt.length <= 4 ? 0.84 : 0.7;
        if (sim >= threshold) best = Math.max(best, sim * 0.9);
      }
    }
    tokenScore += best;
  }
  const coverage = tokenScore / queryTokens.length;
  return Math.min(0.95, coverage * 0.95);
}

export function classifyMatch(score: number): MatchKind {
  if (score >= 0.9) return 'exact';
  if (score >= 0.62) return 'close';
  return 'similar';
}
