import { createHash } from 'node:crypto';
import type { Clock } from '../domain/verification-token.js';
import { SlidingWindowCounter, type RateLimitDecision } from './sliding-window-counter.js';

export interface PasswordResetRateLimiterOptions {
  ipMax?: number | undefined;
  ipWindowSeconds?: number | undefined;
  emailMax?: number | undefined;
  emailWindowSeconds?: number | undefined;
  confirmIpMax?: number | undefined;
  confirmIpWindowSeconds?: number | undefined;
  clock?: Clock | undefined;
}

/**
 * Focused sliding-window rate limiter for password reset endpoints.
 * Enforces per-IP and per-hashed-normalized-email limits on /password-reset/request,
 * plus an independent per-IP limit on /password-reset/confirm without storing raw emails.
 * Note: In-memory per API process; multi-instance production deployments require a shared store (e.g., Redis).
 */
export class PasswordResetRateLimiter {
  private readonly ipLimiter: SlidingWindowCounter;
  private readonly identifierLimiter: SlidingWindowCounter;
  private readonly confirmIpLimiter: SlidingWindowCounter;

  constructor(options?: PasswordResetRateLimiterOptions) {
    const clock = options?.clock ?? (() => new Date());
    const ipMax = options?.ipMax ?? 10;
    const ipWindowSeconds = options?.ipWindowSeconds ?? 900;
    this.ipLimiter = new SlidingWindowCounter(ipMax, ipWindowSeconds, clock);
    this.identifierLimiter = new SlidingWindowCounter(
      options?.emailMax ?? 3,
      options?.emailWindowSeconds ?? 900,
      clock,
    );
    this.confirmIpLimiter = new SlidingWindowCounter(
      options?.confirmIpMax ?? ipMax,
      options?.confirmIpWindowSeconds ?? ipWindowSeconds,
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

  checkConfirmIp(ipKey: string): RateLimitDecision {
    return this.confirmIpLimiter.consume(ipKey || 'unknown');
  }
}
