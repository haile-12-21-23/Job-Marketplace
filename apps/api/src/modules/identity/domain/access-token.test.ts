import { describe, it, expect } from 'vitest';
import { SignJWT } from 'jose';
import { JoseAccessTokenService } from './access-token.js';

describe('JoseAccessTokenService', () => {
  const validSecret = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  it('rejects short signing secrets at construction', () => {
    expect(() => new JoseAccessTokenService({ secret: 'too-short' })).toThrowError(
      'Access token signing secret must be at least 32 characters',
    );
  });

  it('signs and verifies HS256 access tokens with required claims and TTL', async () => {
    let nowMs = new Date('2026-11-26T12:00:00Z').getTime();
    const service = new JoseAccessTokenService({
      secret: validSecret,
      ttlSeconds: 900,
      issuer: 'job-marketplace-api',
      audience: 'job-marketplace-web',
      clock: () => new Date(nowMs),
    });

    const signed = await service.sign({
      userId: '550e8400-e29b-41d4-a716-446655440000',
      sessionId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
    });

    expect(signed.expiresIn).toBe(900);
    expect(signed.token.split('.')).toHaveLength(3);

    const header = JSON.parse(
      Buffer.from(signed.token.split('.')[0]!, 'base64url').toString('utf8'),
    ) as { alg: string; typ: string };
    expect(header.alg).toBe('HS256');

    const claims = await service.verify(signed.token);
    expect(claims.sub).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(claims.sid).toBe('6ba7b810-9dad-11d1-80b4-00c04fd430c8');
    expect(claims.iss).toBe('job-marketplace-api');
    expect(claims.aud).toBe('job-marketplace-web');
    expect(claims.exp - claims.iat).toBe(900);
    expect(typeof claims.jti).toBe('string');
    expect(claims.jti.length).toBeGreaterThan(0);

    // Advance clock past TTL -> verification fails
    nowMs += 901 * 1000;
    await expect(service.verify(signed.token)).rejects.toThrow();
  });

  it('rejects tokens signed with unexpected algorithms, issuers, or audiences', async () => {
    const now = new Date('2026-11-26T12:00:00Z');
    const service = new JoseAccessTokenService({
      secret: validSecret,
      ttlSeconds: 900,
      issuer: 'job-marketplace-api',
      audience: 'job-marketplace-web',
      clock: () => now,
    });

    const wrongAlgToken = await new SignJWT({ sid: 'sess-1' })
      .setProtectedHeader({ alg: 'HS512' })
      .setSubject('user-1')
      .setIssuer('job-marketplace-api')
      .setAudience('job-marketplace-web')
      .setJti('jti-1')
      .setIssuedAt(Math.floor(now.getTime() / 1000))
      .setExpirationTime(Math.floor(now.getTime() / 1000) + 900)
      .sign(new TextEncoder().encode(validSecret));

    await expect(service.verify(wrongAlgToken)).rejects.toThrow();
  });
});
