import { describe, it, expect } from 'vitest';
import { buildRefreshCookieSpec, CryptoRefreshTokenService } from './refresh-token.js';

describe('CryptoRefreshTokenService and refresh cookie spec', () => {
  it('generates opaque high-entropy refresh tokens and SHA-256 digests', () => {
    const service = new CryptoRefreshTokenService();
    const raw1 = service.generateToken();
    const raw2 = service.generateToken();

    expect(raw1).not.toBe(raw2);
    expect(raw1.length).toBeGreaterThanOrEqual(40);
    expect(raw1).toMatch(/^[A-Za-z0-9_-]+$/);

    const hash = service.hashToken(raw1);
    expect(hash).not.toBe(raw1);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(service.hashToken(raw1)).toBe(hash);
  });

  it('builds secure host-only HttpOnly cookie spec for production vs development', () => {
    const prodSpec = buildRefreshCookieSpec({
      isProduction: true,
      sameSite: 'lax',
      refreshTokenTtlDays: 30,
    });

    expect(prodSpec.name).toBe('__Secure-jmp_refresh');
    expect(prodSpec.options.httpOnly).toBe(true);
    expect(prodSpec.options.secure).toBe(true);
    expect(prodSpec.options.sameSite).toBe('lax');
    expect(prodSpec.options.path).toBe('/api/v1/auth');
    expect(prodSpec.options.domain).toBeUndefined();
    expect(prodSpec.options.maxAge).toBe(30 * 24 * 60 * 60 * 1000);

    const devSpec = buildRefreshCookieSpec({
      isProduction: false,
      sameSite: 'lax',
      refreshTokenTtlDays: 14,
    });

    expect(devSpec.name).toBe('jmp_refresh');
    expect(devSpec.options.httpOnly).toBe(true);
    expect(devSpec.options.secure).toBe(false);
    expect(devSpec.options.sameSite).toBe('lax');
    expect(devSpec.options.path).toBe('/api/v1/auth');
    expect(devSpec.options.domain).toBeUndefined();
    expect(devSpec.options.maxAge).toBe(14 * 24 * 60 * 60 * 1000);
  });
});
