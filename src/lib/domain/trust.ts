/**
 * Booklit Trust Score scale.
 *
 * Booklit rates reading honesty on a fine-grained 1000-point "Honest Rate" scale
 * (0–1000) instead of a coarse 0–100 score. The verification engine still reasons
 * internally on a 0–100 percentage, then projects the final value onto the
 * 1000-point scale so readers can see meaningful differences (e.g. 902 vs 918).
 */

export const TRUST_SCALE_MAX = 1000;
export const TRUST_SCALE_MARKER = 1000;

/** Project an internal 0–100 trust percentage onto the 0–1000 Honest Rate scale. */
export function toTrustScale(percent: number): number {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
  return Math.round(clamped * 10);
}

/** Convert a 0–1000 Honest Rate score back to a 0–100 percentage for math. */
export function toTrustPercent(score: number): number {
  return Math.round((normalizeTrustScore(score) / TRUST_SCALE_MAX) * 1000) / 10;
}

/**
 * Normalize stored trust values. Sessions recorded before the 1000-point scale
 * shipped carry a 0–100 value; those are lifted onto the new scale so history,
 * badges, and leaderboards stay consistent.
 */
export function normalizeTrustScore(score: number, scale?: number | null): number {
  if (!Number.isFinite(score) || score <= 0) return 0;
  if (scale === TRUST_SCALE_MARKER) {
    return Math.min(TRUST_SCALE_MAX, Math.round(score));
  }
  if (score <= 100) return toTrustScale(score);
  return Math.min(TRUST_SCALE_MAX, Math.round(score));
}

export function clampTrustScore(score: number): number {
  if (!Number.isFinite(score)) return TRUST_SCALE_MAX;
  return Math.max(0, Math.min(TRUST_SCALE_MAX, Math.round(score)));
}

export type TrustTone = 'emerald' | 'lime' | 'amber' | 'rose';

export function trustTone(score: number): TrustTone {
  const value = normalizeTrustScore(score);
  if (value >= 900) return 'emerald';
  if (value >= 750) return 'lime';
  if (value >= 580) return 'amber';
  return 'rose';
}

export function formatTrust(score: number): string {
  return `${normalizeTrustScore(score)}/1000`;
}
