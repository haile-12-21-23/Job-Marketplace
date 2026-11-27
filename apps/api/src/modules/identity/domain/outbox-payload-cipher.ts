import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

export interface SealedOutboxPayload {
  v: 1;
  iv: string;
  tag: string;
  ciphertext: string;
}

const HKDF_SALT = Buffer.from('job-marketplace:outbox', 'utf8');
const HKDF_INFO = Buffer.from('password-reset-email:v1', 'utf8');

function isSealedOutboxPayload(value: unknown): value is SealedOutboxPayload {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate['v'] === 1 &&
    typeof candidate['iv'] === 'string' &&
    typeof candidate['tag'] === 'string' &&
    typeof candidate['ciphertext'] === 'string'
  );
}

/**
 * Authenticated encryption helper (AES-256-GCM) for durable outbox payloads containing
 * sensitive one-time reset links so raw reset tokens are never stored in plaintext in PostgreSQL.
 */
export class OutboxPayloadCipher {
  private readonly key: Buffer;

  constructor(secret: string) {
    if (!secret || secret.length < 32) {
      throw new Error('OutboxPayloadCipher requires a secret of at least 32 characters');
    }
    this.key = Buffer.from(
      hkdfSync('sha256', Buffer.from(secret, 'utf8'), HKDF_SALT, HKDF_INFO, 32),
    );
  }

  sealJson(value: unknown): SealedOutboxPayload {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      v: 1,
      iv: iv.toString('base64url'),
      tag: tag.toString('base64url'),
      ciphertext: ciphertext.toString('base64url'),
    };
  }

  unsealJson<T>(sealed: unknown): T {
    if (!isSealedOutboxPayload(sealed)) {
      throw new Error('Invalid sealed outbox payload envelope');
    }

    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(sealed.iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(sealed.tag, 'base64url'));

    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(sealed.ciphertext, 'base64url')),
      decipher.final(),
    ]);

    return JSON.parse(plaintext.toString('utf8')) as T;
  }
}
