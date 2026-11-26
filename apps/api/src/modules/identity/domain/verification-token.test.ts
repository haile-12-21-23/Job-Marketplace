import { describe, it, expect } from 'vitest';
import { CryptoVerificationTokenService } from './verification-token.js';

describe('CryptoVerificationTokenService', () => {
  it('generates unique high-entropy URL-safe tokens', () => {
    const service = new CryptoVerificationTokenService();
    const token1 = service.generateToken();
    const token2 = service.generateToken();

    expect(token1).not.toBe(token2);
    expect(token1.length).toBeGreaterThanOrEqual(40);
    expect(token1).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('produces deterministic SHA-256 hex digests distinct from the raw token', () => {
    const service = new CryptoVerificationTokenService();
    const raw = 'sample-raw-token-value';
    const hash1 = service.hashToken(raw);
    const hash2 = service.hashToken(raw);

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(raw);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('builds verification URLs from configured APP_WEB_URL without trailing slash issues', () => {
    const service = new CryptoVerificationTokenService();
    const url = service.buildVerificationUrl('https://jobs.example.com/', 'abc_123');
    expect(url).toBe('https://jobs.example.com/verify-email?token=abc_123');
  });
});
