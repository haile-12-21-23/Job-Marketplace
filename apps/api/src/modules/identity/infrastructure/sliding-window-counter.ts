import type { Clock } from '../domain/verification-token.js';

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

/**
 * Bounded sliding-window rate-limiter counter with deterministic injected clock support.
 * Note: In-memory per API process; multi-instance production deployments should migrate
 * limiter state to a shared store such as Redis.
 */
export class SlidingWindowCounter {
  private readonly hits = new Map<string, number[]>();
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly clock: Clock;

  constructor(maxRequests: number, windowSeconds: number, clock: Clock) {
    this.maxRequests = maxRequests;
    this.windowMs = windowSeconds * 1000;
    this.clock = clock;
  }

  consume(key: string): RateLimitDecision {
    const nowMs = this.clock().getTime();
    const cutoff = nowMs - this.windowMs;

    const existing = this.hits.get(key) ?? [];
    const active = existing.filter((ts) => ts > cutoff);

    if (active.length >= this.maxRequests) {
      const oldest = active[0] ?? nowMs;
      const retryAfterMs = Math.max(1000, oldest + this.windowMs - nowMs);
      this.hits.set(key, active);
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
      };
    }

    active.push(nowMs);
    this.hits.set(key, active);

    // Opportunistically prune stale keys when map grows
    if (this.hits.size > 1000) {
      for (const [k, timestamps] of this.hits.entries()) {
        const latest = timestamps[timestamps.length - 1];
        if (latest === undefined || latest <= cutoff) {
          this.hits.delete(k);
        }
      }
    }

    return {
      allowed: true,
      retryAfterSeconds: 0,
    };
  }
}
