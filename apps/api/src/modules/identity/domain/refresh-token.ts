import { createHash, randomBytes } from 'node:crypto';
import type { CookieOptions } from 'express';

export type RefreshCookieSameSite = 'lax' | 'strict' | 'none';

export interface RefreshTokenService {
  generateToken(): string;
  hashToken(rawToken: string): string;
}

/**
 * Generates opaque cryptographically random refresh credentials (256-bit base64url)
 * and computes deterministic SHA-256 hex digests for database storage.
 */
export class CryptoRefreshTokenService implements RefreshTokenService {
  private readonly byteLength: number;

  constructor(byteLength = 32) {
    this.byteLength = byteLength;
  }

  generateToken(): string {
    return randomBytes(this.byteLength).toString('base64url');
  }

  hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken, 'utf8').digest('hex');
  }
}

export interface RefreshCookieConfigInput {
  isProduction: boolean;
  sameSite: RefreshCookieSameSite;
  refreshTokenTtlDays: number;
}

export interface RefreshCookieSpec {
  name: string;
  options: CookieOptions;
}

/**
 * Builds host-only HttpOnly cookie configuration for the refresh credential.
 * Uses the `__Secure-` prefix in production where `Secure` is strictly true.
 */
export function buildRefreshCookieSpec(input: RefreshCookieConfigInput): RefreshCookieSpec {
  const name = input.isProduction ? '__Secure-jmp_refresh' : 'jmp_refresh';
  const maxAge = input.refreshTokenTtlDays * 24 * 60 * 60 * 1000;

  return {
    name,
    options: {
      httpOnly: true,
      secure: input.isProduction,
      sameSite: input.sameSite,
      path: '/api/v1/auth',
      maxAge,
    },
  };
}
