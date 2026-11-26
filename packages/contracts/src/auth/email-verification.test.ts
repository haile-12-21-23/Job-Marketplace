import { describe, expect, it } from 'vitest';
import {
  verifyEmailRequestSchema,
  verifyEmailResponseDataSchema,
  verifyEmailResponseEnvelopeSchema,
  resendVerificationRequestSchema,
  resendVerificationResponseDataSchema,
  resendVerificationResponseEnvelopeSchema,
} from './email-verification.js';

describe('auth email verification contracts', () => {
  describe('verifyEmailRequestSchema', () => {
    it('accepts and trims a valid verification token', () => {
      const parsed = verifyEmailRequestSchema.parse({
        token: '  raw_verification_token_12345  ',
      });

      expect(parsed).toEqual({
        token: 'raw_verification_token_12345',
      });
    });

    it('rejects missing, empty, or oversized tokens', () => {
      expect(() => verifyEmailRequestSchema.parse({})).toThrow();
      expect(() => verifyEmailRequestSchema.parse({ token: '' })).toThrow();
      expect(() => verifyEmailRequestSchema.parse({ token: '   ' })).toThrow();
      expect(() => verifyEmailRequestSchema.parse({ token: 'a'.repeat(513) })).toThrow();
      expect(() => verifyEmailRequestSchema.parse({ token: 123 })).toThrow();
    });

    it('rejects unknown fields with strict validation', () => {
      expect(() =>
        verifyEmailRequestSchema.parse({
          token: 'valid_token',
          userId: '550e8400-e29b-41d4-a716-446655440000',
        }),
      ).toThrow();
    });
  });

  describe('verifyEmailResponseEnvelopeSchema', () => {
    it('validates the public verification success envelope', () => {
      const payload = {
        data: {
          verified: true as const,
          message: 'Your email address has been verified.',
        },
      };

      expect(verifyEmailResponseDataSchema.parse(payload.data)).toEqual(payload.data);
      expect(verifyEmailResponseEnvelopeSchema.parse(payload)).toEqual(payload);
    });

    it('rejects unexpected internal fields on verification response', () => {
      expect(() =>
        verifyEmailResponseDataSchema.parse({
          verified: true,
          message: 'Verified',
          tokenHash: 'secret',
        }),
      ).toThrow();
    });
  });

  describe('resendVerificationRequestSchema', () => {
    it('accepts and trims a valid email address', () => {
      const parsed = resendVerificationRequestSchema.parse({
        email: '  User@Example.COM  ',
      });

      expect(parsed).toEqual({
        email: 'User@Example.COM',
      });
    });

    it('rejects invalid email formats and unknown fields', () => {
      expect(() => resendVerificationRequestSchema.parse({})).toThrow();
      expect(() => resendVerificationRequestSchema.parse({ email: 'not-an-email' })).toThrow();
      expect(() =>
        resendVerificationRequestSchema.parse({
          email: `${'a'.repeat(250)}@example.com`,
        }),
      ).toThrow();
      expect(() =>
        resendVerificationRequestSchema.parse({
          email: 'user@example.com',
          extra: true,
        }),
      ).toThrow();
    });
  });

  describe('resendVerificationResponseEnvelopeSchema', () => {
    it('validates the generic resend response envelope', () => {
      const payload = {
        data: {
          accepted: true as const,
          message:
            'If an unverified account exists for that email address, a verification email has been sent.',
        },
      };

      expect(resendVerificationResponseDataSchema.parse(payload.data)).toEqual(payload.data);
      expect(resendVerificationResponseEnvelopeSchema.parse(payload)).toEqual(payload);
    });
  });
});
