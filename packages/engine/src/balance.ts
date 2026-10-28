/**
 * Single source of truth for gameplay constants (docs/gameplay-systems.md §11).
 * Any change goes through qa-balance and bumps `version`.
 */
export const BALANCE = {
  version: 1,
  legsPerExpedition: 6,
  /** 0.001° ≈ 110 m: the coarsest grid with points inside the Vatican (≈ 0.012° × 0.007°). */
  coordQuantumDeg: 0.001,
  tierCutoffs: [0.5, 0.8, 0.95],
  tierMultipliers: { known: 1.0, trail: 1.1, frontier: 1.25, incognita: 1.5 },
  rarityPriorWeight: 200,
  salienceExponent: 1.4,
  contextSubgroupMin: 30,
  inkDryHours: 24,
  maxRunsInProgress: 5,
  generatorMaxRetries: 64,
  meridianBonus: 750,
  meridianMaxCount: 2,
  missionBonusRate: 0.05,
  spyglassPerExpedition: { easy: 2, normal: 1, expert: 1 },
  spyglassTierCap: 'frontier',
  promptValidCount: [8, 60],
  promptMinContinents: 3,
  touchSnapRadiusPx: 12,
  microStateHaloPx: 22,
} as const;

export type Balance = typeof BALANCE;
