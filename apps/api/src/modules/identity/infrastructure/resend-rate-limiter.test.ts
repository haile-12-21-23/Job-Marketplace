import { describe, it, expect } from 'vitest';
import { ResendRateLimiter } from './resend-rate-limiter.js';

describe('ResendRateLimiter', () => {
  it('enforces per-IP and per-email limits deterministically with an injected clock', () => {
    let nowMs = new Date('2026-11-26T10:00:00Z').getTime();
    const limiter = new ResendRateLimiter({
      ipMax: 3,
      ipWindowSeconds: 60,
      emailMax: 2,
      emailWindowSeconds: 120,
      clock: () => new Date(nowMs),
    });

    expect(limiter.checkIp('203.0.113.10').allowed).toBe(true);
    expect(limiter.checkIp('203.0.113.10').allowed).toBe(true);
    expect(limiter.checkIp('203.0.113.10').allowed).toBe(true);
    const blockedIp = limiter.checkIp('203.0.113.10');
    expect(blockedIp.allowed).toBe(false);
    expect(blockedIp.retryAfterSeconds).toBe(60);

    // Advance past IP window
    nowMs += 61_000;
    expect(limiter.checkIp('203.0.113.10').allowed).toBe(true);

    // Per-email limit
    expect(limiter.checkEmail('user@example.com').allowed).toBe(true);
    expect(limiter.checkEmail('user@example.com').allowed).toBe(true);
    const blockedEmail = limiter.checkEmail('user@example.com');
    expect(blockedEmail.allowed).toBe(false);
    expect(blockedEmail.retryAfterSeconds).toBeGreaterThan(0);

    // Different email still allowed
    expect(limiter.checkEmail('other@example.com').allowed).toBe(true);
  });
});
