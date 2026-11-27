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

  it('enforces independent confirm-endpoint per-IP throttling without sharing request IP budget', () => {
    let nowMs = new Date('2026-11-27T10:00:00Z').getTime();
    const limiter = new PasswordResetRateLimiter({
      ipMax: 2,
      ipWindowSeconds: 900,
      confirmIpMax: 3,
      confirmIpWindowSeconds: 600,
      clock: () => new Date(nowMs),
    });

    // Exhaust request IP limit
    expect(limiter.checkIp('198.51.100.7').allowed).toBe(true);
    expect(limiter.checkIp('198.51.100.7').allowed).toBe(true);
    expect(limiter.checkIp('198.51.100.7').allowed).toBe(false);

    // Confirm IP budget remains independent
    expect(limiter.checkConfirmIp('198.51.100.7').allowed).toBe(true);
    expect(limiter.checkConfirmIp('198.51.100.7').allowed).toBe(true);
    expect(limiter.checkConfirmIp('198.51.100.7').allowed).toBe(true);

    const blockedConfirm = limiter.checkConfirmIp('198.51.100.7');
    expect(blockedConfirm.allowed).toBe(false);
    expect(blockedConfirm.retryAfterSeconds).toBe(600);

    nowMs += 600_000;
    expect(limiter.checkConfirmIp('198.51.100.7').allowed).toBe(true);
  });
});
