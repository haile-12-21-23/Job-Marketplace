import { randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { Clock } from './verification-token.js';

export interface AccessTokenClaims {
  sub: string;
  sid: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
  jti: string;
}

export interface SignAccessTokenInput {
  userId: string;
  sessionId: string;
  now?: Date | undefined;
}

export interface SignedAccessToken {
  token: string;
  expiresIn: number;
}

export interface AccessTokenService {
  sign(input: SignAccessTokenInput): Promise<SignedAccessToken>;
  verify(token: string, now?: Date): Promise<AccessTokenClaims>;
}

export interface JoseAccessTokenServiceOptions {
  secret: string;
  ttlSeconds?: number | undefined;
  issuer?: string | undefined;
  audience?: string | undefined;
  clock?: Clock | undefined;
}

const PINNED_ALGORITHM = 'HS256' as const;

/**
 * Signs and verifies short-lived JWT access tokens using `jose` with pinned HS256 algorithm.
 */
export class JoseAccessTokenService implements AccessTokenService {
  private readonly secretKey: Uint8Array;
  private readonly ttlSeconds: number;
  private readonly issuer: string;
  private readonly audience: string;
  private readonly clock: Clock;

  constructor(options: JoseAccessTokenServiceOptions) {
    const trimmedSecret = options.secret.trim();
    if (trimmedSecret.length < 32) {
      throw new Error('Access token signing secret must be at least 32 characters');
    }
    this.secretKey = new TextEncoder().encode(trimmedSecret);
    this.ttlSeconds = options.ttlSeconds ?? 900;
    this.issuer = options.issuer ?? 'job-marketplace-api';
    this.audience = options.audience ?? 'job-marketplace-web';
    this.clock = options.clock ?? (() => new Date());
  }

  async sign(input: SignAccessTokenInput): Promise<SignedAccessToken> {
    const issuedAtDate = input.now ?? this.clock();
    const iatSeconds = Math.floor(issuedAtDate.getTime() / 1000);
    const expSeconds = iatSeconds + this.ttlSeconds;

    const token = await new SignJWT({ sid: input.sessionId })
      .setProtectedHeader({ alg: PINNED_ALGORITHM, typ: 'JWT' })
      .setSubject(input.userId)
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setJti(randomUUID())
      .setIssuedAt(iatSeconds)
      .setExpirationTime(expSeconds)
      .sign(this.secretKey);

    return {
      token,
      expiresIn: this.ttlSeconds,
    };
  }

  async verify(token: string, now?: Date): Promise<AccessTokenClaims> {
    const currentDate = now ?? this.clock();
    const { payload } = await jwtVerify(token, this.secretKey, {
      algorithms: [PINNED_ALGORITHM],
      issuer: this.issuer,
      audience: this.audience,
      currentDate,
    });

    const sid = payload['sid'];
    if (
      typeof payload.sub !== 'string' ||
      typeof sid !== 'string' ||
      typeof payload.iat !== 'number' ||
      typeof payload.exp !== 'number' ||
      typeof payload.iss !== 'string' ||
      typeof payload.jti !== 'string'
    ) {
      throw new Error('Access token is missing required claims');
    }

    const aud = Array.isArray(payload.aud) ? payload.aud[0] : payload.aud;
    if (typeof aud !== 'string') {
      throw new Error('Access token has invalid audience claim');
    }

    return {
      sub: payload.sub,
      sid,
      iat: payload.iat,
      exp: payload.exp,
      iss: payload.iss,
      aud,
      jti: payload.jti,
    };
  }
}
