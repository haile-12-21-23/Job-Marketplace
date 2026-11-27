import type { Clock } from '../domain/verification-token.js';
import { SlidingWindowCounter, type RateLimitDecision } from './sliding-window-counter.js';

export type { RateLimitDecision };

export interface ResendRateLimiterOptions {
  ipMax?: number | undefined;
  ipWindowSeconds?: number | undefined;
  emailMax?: number | undefined;
  emailWindowSeconds?: number | undefined;
  clock?: Clock | undefined;
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
