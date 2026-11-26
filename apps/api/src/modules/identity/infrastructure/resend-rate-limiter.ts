import type { Clock } from '../domain/verification-token.js';

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface ResendRateLimiterOptions {
  ipMax?: number | undefined;
  ipWindowSeconds?: number | undefined;
  emailMax?: number | undefined;
  emailWindowSeconds?: number | undefined;
  clock?: Clock | undefined;
}

class SlidingWindowCounter {
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

/**
 * Focused sliding-window rate limiter for POST /api/v1/auth/resend-verification.
 * Enforces both per-IP and per-normalized-email limits without general-purpose framework overhead.
 */
export class ResendRateLimiter {
  private readonly ipLimiter: SlidingWindowCounter;
  private readonly emailLimiter: SlidingWindowCounter;

  constructor(options?: ResendRateLimiterOptions) {
    const clock = options?.clock ?? (() => new Date());
    this.ipLimiter = new SlidingWindowCounter(
      options?.ipMax ?? 10,
      options?.ipWindowSeconds ?? 900,
      clock,
    );
    this.emailLimiter = new SlidingWindowCounter(
      options?.emailMax ?? 3,
      options?.emailWindowSeconds ?? 900,
      clock,
    );
  }

  checkIp(ipKey: string): RateLimitDecision {
    return this.ipLimiter.consume(ipKey || 'unknown');
  }

  checkEmail(normalizedEmail: string): RateLimitDecision {
    return this.emailLimiter.consume(normalizedEmail);
  }
}
