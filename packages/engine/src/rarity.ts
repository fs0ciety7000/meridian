import type { Balance } from './balance';
import type { RarityTier, RaritySnapshot } from './types';

/** Tier from the cumulative share at the midpoint (gameplay-systems §6.2). */
export function tierOfShare(midShare: number, balance: Balance): RarityTier {
  const [a, b, c] = balance.tierCutoffs;
  return midShare < a ? 'known' : midShare < b ? 'trail' : midShare < c ? 'frontier' : 'incognita';
}

/**
 * Rarity snapshot of a prompt from observed first-encounter counts, smoothed by the salience prior
 * (§6.3): n_eff = n_obs + α·π, π ∝ salience^β. With no observations it is the prior alone.
 */
export function computeRarity(
  promptId: string,
  validIso3: readonly string[],
  salience: (iso3: string) => number,
  counts: Readonly<Record<string, number>>,
  balance: Balance,
  computedAt: string,
  contextKey?: string,
): RaritySnapshot {
  const weights = validIso3.map((c) => Math.max(1e-6, salience(c)) ** balance.salienceExponent);
  const wSum = weights.reduce((a, b) => a + b, 0);
  const total = validIso3.reduce((t, c) => t + (counts[c] ?? 0), 0);
  const eff = validIso3.map(
    (c, i) => (counts[c] ?? 0) + balance.rarityPriorWeight * (weights[i]! / wSum),
  );
  const effSum = eff.reduce((a, b) => a + b, 0);
  const order = validIso3
    .map((c, i) => ({ c, p: eff[i]! / effSum }))
    .sort((x, y) => y.p - x.p || (x.c < y.c ? -1 : 1));
  const entries: RaritySnapshot['entries'] = {};
  let cum = 0;
  for (const { c, p } of order) {
    entries[c] = { n: counts[c] ?? 0, share: p, tier: tierOfShare(cum + p / 2, balance) };
    cum += p;
  }
  return {
    promptId,
    ...(contextKey ? { contextKey } : {}),
    total,
    priorWeight: balance.rarityPriorWeight,
    entries,
    computedAt,
    balanceVersion: balance.version,
  };
}

const ORDER: Record<RarityTier, number> = { known: 0, trail: 1, frontier: 2, incognita: 3 };

/** The spyglass caps a leg's tier (§9). */
export function capTier(tier: RarityTier, cap: RarityTier): RarityTier {
  return ORDER[tier] > ORDER[cap] ? cap : tier;
}
