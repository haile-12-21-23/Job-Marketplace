import { describe, it, expect } from 'vitest';
import { LoginRateLimiter } from './login-rate-limiter.js';

describe('LoginRateLimiter', () => {
  it('enforces per-IP and per-hashed-email limits deterministically without storing raw email keys', () => {
    let nowMs = new Date('2026-11-26T12:00:00Z').getTime();
    const limiter = new LoginRateLimiter({
      ipMax: 3,
      ipWindowSeconds: 60,
      emailMax: 2,
      emailWindowSeconds: 120,
      clock: () => new Date(nowMs),
    });

    expect(limiter.checkIp('198.51.100.1').allowed).toBe(true);
    expect(limiter.checkIp('198.51.100.1').allowed).toBe(true);
    expect(limiter.checkIp('198.51.100.1').allowed).toBe(true);
    const blockedIp = limiter.checkIp('198.51.100.1');
    expect(blockedIp.allowed).toBe(false);
    expect(blockedIp.retryAfterSeconds).toBe(60);

    nowMs += 61_000;
    expect(limiter.checkIp('198.51.100.1').allowed).toBe(true);

    expect(limiter.checkEmail('sensitive@example.com').allowed).toBe(true);
    expect(limiter.checkEmail('sensitive@example.com').allowed).toBe(true);
    const blockedEmail = limiter.checkEmail('sensitive@example.com');
    expect(blockedEmail.allowed).toBe(false);
    expect(blockedEmail.retryAfterSeconds).toBeGreaterThan(0);

    // Ensure raw email address is not stored directly as a key in internal map
    const serialized = JSON.stringify(
      Array.from(
        (
          limiter as unknown as { identifierLimiter: { hits: Map<string, number[]> } }
        ).identifierLimiter.hits.keys(),
      ),
    );
    expect(serialized).not.toContain('sensitive@example.com');
  });
});
