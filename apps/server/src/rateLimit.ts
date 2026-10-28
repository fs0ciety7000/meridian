import { createHmac, randomBytes } from 'node:crypto';

/**
 * Fixed-window rate limiter, in memory only.
 *
 * Keys (client IPs) are never kept as such: they are HMAC'd with a random salt generated at
 * process start and discarded on restart, and the whole table is dropped at every window
 * boundary — nothing that identifies a client outlives a window or reaches the disk.
 */
export class RateLimiter {
  private readonly salt = randomBytes(32);
  private windowStart = 0;
  private hits = new Map<string, number>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    /** Bounds memory under a flood of distinct keys: beyond it, unknown keys are refused. */
    private readonly maxKeys = 50_000,
    private readonly now: () => number = Date.now,
  ) {}

  /** Records a hit; returns 0 when allowed, otherwise the seconds until the window resets. */
  hit(key: string, weight = 1): number {
    const t = this.now();
    if (t - this.windowStart >= this.windowMs) {
      this.windowStart = t - (t % this.windowMs);
      this.hits = new Map();
    }
    const id = createHmac('sha256', this.salt).update(key).digest('base64url').slice(0, 22);
    const count = this.hits.get(id);
    const retryAfter = Math.max(1, Math.ceil((this.windowStart + this.windowMs - t) / 1000));
    if (count === undefined && this.hits.size >= this.maxKeys) return retryAfter;
    const next = (count ?? 0) + weight;
    if (next > this.limit) return retryAfter;
    this.hits.set(id, next);
    return 0;
  }
}
