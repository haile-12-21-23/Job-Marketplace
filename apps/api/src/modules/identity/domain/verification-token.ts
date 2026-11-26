import { createHash, randomBytes } from 'node:crypto';

export type Clock = () => Date;

export interface VerificationTokenService {
  generateToken(): string;
  hashToken(rawToken: string): string;
  buildVerificationUrl(appWebUrl: string, rawToken: string): string;
}

/**
 * Cryptographically secure verification token generator and SHA-256 hasher.
 * Raw tokens have 256 bits of CSPRNG entropy; only SHA-256 hex digests are stored.
 */
export class CryptoVerificationTokenService implements VerificationTokenService {
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

  buildVerificationUrl(appWebUrl: string, rawToken: string): string {
    const base = appWebUrl.replace(/\/+$/, '');
    const url = new URL(`${base}/verify-email`);
    url.searchParams.set('token', rawToken);
    return url.toString();
  }
}
