import { createHash } from 'node:crypto';
import type { Clock } from '../domain/verification-token.js';
import { SlidingWindowCounter, type RateLimitDecision } from './sliding-window-counter.js';

export interface LoginRateLimiterOptions {
  ipMax?: number | undefined;
  ipWindowSeconds?: number | undefined;
  emailMax?: number | undefined;
  emailWindowSeconds?: number | undefined;
  clock?: Clock | undefined;
}

/**
 * Focused sliding-window rate limiter for POST /api/v1/auth/login.
 * Enforces per-IP and per-hashed-normalized-email limits without storing raw emails in limiter keys.
 * Note: In-memory per API process; multi-instance production deployments require a shared store (e.g., Redis).
 */
export class LoginRateLimiter {
  private readonly ipLimiter: SlidingWindowCounter;
  private readonly identifierLimiter: SlidingWindowCounter;

  constructor(options?: LoginRateLimiterOptions) {
    const clock = options?.clock ?? (() => new Date());
    this.ipLimiter = new SlidingWindowCounter(
      options?.ipMax ?? 10,
      options?.ipWindowSeconds ?? 900,
      clock,
    );
    this.identifierLimiter = new SlidingWindowCounter(
      options?.emailMax ?? 5,
      options?.emailWindowSeconds ?? 900,
      clock,
    );
  }

  checkIp(ipKey: string): RateLimitDecision {
    return this.ipLimiter.consume(ipKey || 'unknown');
  }

  checkEmail(normalizedEmail: string): RateLimitDecision {
    const hashedKey = createHash('sha256').update(normalizedEmail, 'utf8').digest('hex');
    return this.identifierLimiter.consume(hashedKey);
  }
}
