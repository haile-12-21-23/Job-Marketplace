import { describe, it, expect } from 'vitest';
import { PasswordResetRateLimiter } from './password-reset-rate-limiter.js';

describe('PasswordResetRateLimiter', () => {
  it('enforces per-IP and SHA-256 hashed normalized-email limits deterministically without retaining raw emails', () => {
    let nowMs = new Date('2026-11-27T10:00:00Z').getTime();
    const limiter = new PasswordResetRateLimiter({
      ipMax: 4,
      ipWindowSeconds: 900,
      emailMax: 2,
      emailWindowSeconds: 900,
      clock: () => new Date(nowMs),
    });

    expect(limiter.checkEmail('abebe@example.com').allowed).toBe(true);
    expect(limiter.checkEmail('abebe@example.com').allowed).toBe(true);
    const blockedEmail = limiter.checkEmail('abebe@example.com');
    expect(blockedEmail.allowed).toBe(false);
    expect(blockedEmail.retryAfterSeconds).toBe(900);

    // Ensure raw email address is never stored in internal counter buckets
    const serialized = JSON.stringify(limiter);
    expect(serialized).not.toContain('abebe@example.com');

    expect(limiter.checkIp('203.0.113.10').allowed).toBe(true);
    expect(limiter.checkIp('203.0.113.10').allowed).toBe(true);
    expect(limiter.checkIp('203.0.113.10').allowed).toBe(true);
    expect(limiter.checkIp('203.0.113.10').allowed).toBe(true);
    const blockedIp = limiter.checkIp('203.0.113.10');
    expect(blockedIp.allowed).toBe(false);
    expect(blockedIp.retryAfterSeconds).toBe(900);

    nowMs += 900_000;
    expect(limiter.checkEmail('abebe@example.com').allowed).toBe(true);
    expect(limiter.checkIp('203.0.113.10').allowed).toBe(true);
  });
});
