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
  clearOptions: CookieOptions;
}

export type RefreshCookieParseResult =
  { status: 'missing' } | { status: 'invalid' } | { status: 'present'; token: string };

const BASE64URL_TOKEN_RE = /^[A-Za-z0-9_-]{32,256}$/;

/**
 * Extracts the exact configured refresh cookie from the HTTP `Cookie` header.
 * Rejects duplicate cookie names, malformed header syntax, or non-base64url values.
 */
export function extractRefreshCookieToken(
  cookieHeader: string | string[] | undefined,
  cookieName: string,
): RefreshCookieParseResult {
  if (cookieHeader === undefined) {
    return { status: 'missing' };
  }

  const headerValue = Array.isArray(cookieHeader) ? cookieHeader.join('; ') : cookieHeader;
  if (headerValue.trim() === '') {
    return { status: 'missing' };
  }

  const segments = headerValue.split(';');
  const matches: string[] = [];

  for (const rawSegment of segments) {
    const segment = rawSegment.trim();
    if (segment === '') {
      continue;
    }

    const eqIndex = segment.indexOf('=');
    if (eqIndex <= 0) {
      return { status: 'invalid' };
    }

    const name = segment.slice(0, eqIndex).trim();
    if (name !== cookieName) {
      continue;
    }

    let rawValue = segment.slice(eqIndex + 1).trim();
    if (rawValue.length >= 2 && rawValue.startsWith('"') && rawValue.endsWith('"')) {
      rawValue = rawValue.slice(1, -1);
    }

    let decodedValue: string;
    try {
      decodedValue = decodeURIComponent(rawValue);
    } catch {
      return { status: 'invalid' };
    }

    matches.push(decodedValue);
  }

  if (matches.length === 0) {
    return { status: 'missing' };
  }

  if (matches.length > 1) {
    return { status: 'invalid' };
  }

  const token = matches[0]!;
  if (!BASE64URL_TOKEN_RE.test(token)) {
    return { status: 'invalid' };
  }

  return { status: 'present', token };
}

/**
 * Builds host-only HttpOnly cookie configuration for the refresh credential.
 * Uses the `__Secure-` prefix in production where `Secure` is strictly true.
 */
export function buildRefreshCookieSpec(input: RefreshCookieConfigInput): RefreshCookieSpec {
  const name = input.isProduction ? '__Secure-jmp_refresh' : 'jmp_refresh';
  const maxAge = input.refreshTokenTtlDays * 24 * 60 * 60 * 1000;
  const baseAttributes: CookieOptions = {
    httpOnly: true,
    secure: input.isProduction,
    sameSite: input.sameSite,
    path: '/api/v1/auth',
  };

  return {
    name,
    options: {
      ...baseAttributes,
      maxAge,
    },
    clearOptions: {
      ...baseAttributes,
    },
  };
}
