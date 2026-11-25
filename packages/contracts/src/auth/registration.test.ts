import { describe, expect, it } from 'vitest';
import {
  normalizeEmail,
  registerRequestSchema,
  registerResponseDataSchema,
  registerResponseEnvelopeSchema,
} from './registration.js';

describe('Registration contracts', () => {
  describe('normalizeEmail()', () => {
    it('lowercases and trims email addresses deterministically', () => {
      expect(normalizeEmail('  User@Example.COM  ')).toBe('user@example.com');
      expect(normalizeEmail('ALICE@DOMAIN.ORG')).toBe('alice@domain.org');
      expect(normalizeEmail('already.clean@domain.com')).toBe('already.clean@domain.com');
    });

    it('handles mixed-case tags and domains', () => {
      expect(normalizeEmail('Test.User+Filter@Sub.Domain.Co.UK')).toBe(
        'test.user+filter@sub.domain.co.uk',
      );
    });
  });

  describe('registerRequestSchema', () => {
    const validPayload = {
      displayName: 'Hailemariam Addisu',
      email: 'haile@example.com',
      password: 'SecurePassword123!',
    };

    it('accepts a valid registration payload', () => {
      const parsed = registerRequestSchema.parse(validPayload);
      expect(parsed.displayName).toBe('Hailemariam Addisu');
      expect(parsed.email).toBe('haile@example.com');
      expect(parsed.password).toBe('SecurePassword123!');
    });

    it('trims leading/trailing whitespace on displayName and email', () => {
      const parsed = registerRequestSchema.parse({
        displayName: '  Hailemariam Addisu  ',
        email: '  haile@example.com  ',
        password: 'SecurePassword123!',
      });
      expect(parsed.displayName).toBe('Hailemariam Addisu');
      expect(parsed.email).toBe('haile@example.com');
    });

    it('rejects unknown fields to prevent parameter pollution (.strict())', () => {
      expect(() =>
        registerRequestSchema.parse({
          ...validPayload,
          role: 'ADMIN',
        }),
      ).toThrow();

      expect(() =>
        registerRequestSchema.parse({
          ...validPayload,
          isAdmin: true,
        }),
      ).toThrow();
    });

    it('rejects invalid or missing displayName', () => {
      // Missing
      expect(() =>
        registerRequestSchema.parse({
          email: 'haile@example.com',
          password: 'SecurePassword123!',
        }),
      ).toThrow('Display name is required');

      // Too short (< 2 characters)
      expect(() =>
        registerRequestSchema.parse({
          ...validPayload,
          displayName: 'A',
        }),
      ).toThrow('Display name must be at least 2 characters');

      // Whitespace only (< 2 after trim)
      expect(() =>
        registerRequestSchema.parse({
          ...validPayload,
          displayName: '   ',
        }),
      ).toThrow('Display name must be at least 2 characters');

      // Too long (> 120 characters)
      expect(() =>
        registerRequestSchema.parse({
          ...validPayload,
          displayName: 'A'.repeat(121),
        }),
      ).toThrow('Display name cannot exceed 120 characters');
    });

    it('rejects invalid or missing email', () => {
      // Missing
      expect(() =>
        registerRequestSchema.parse({
          displayName: 'Hailemariam Addisu',
          password: 'SecurePassword123!',
        }),
      ).toThrow('Email is required');

      // Invalid email formats
      expect(() =>
        registerRequestSchema.parse({
          ...validPayload,
          email: 'not-an-email',
        }),
      ).toThrow('Enter a valid email address');

      expect(() =>
        registerRequestSchema.parse({
          ...validPayload,
          email: '@no-local-part.com',
        }),
      ).toThrow('Enter a valid email address');
    });

    it('rejects invalid or missing password', () => {
      // Missing
      expect(() =>
        registerRequestSchema.parse({
          displayName: 'Hailemariam Addisu',
          email: 'haile@example.com',
        }),
      ).toThrow('Password is required');

      // Too short (< 8 characters)
      expect(() =>
        registerRequestSchema.parse({
          ...validPayload,
          password: 'short',
        }),
      ).toThrow('Password must be at least 8 characters');

      // Too long (> 100 characters)
      expect(() =>
        registerRequestSchema.parse({
          ...validPayload,
          password: 'P'.repeat(101),
        }),
      ).toThrow('Password cannot exceed 100 characters');
    });
  });

  describe('registerResponseDataSchema & registerResponseEnvelopeSchema', () => {
    const validResponseData = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      displayName: 'Hailemariam Addisu',
      email: 'haile@example.com',
      emailVerificationRequired: true as const,
    };

    it('validates a correct public response data DTO', () => {
      const parsed = registerResponseDataSchema.parse(validResponseData);
      expect(parsed.id).toBe(validResponseData.id);
      expect(parsed.displayName).toBe(validResponseData.displayName);
      expect(parsed.email).toBe(validResponseData.email);
      expect(parsed.emailVerificationRequired).toBe(true);
    });

    it('validates a standard success envelope', () => {
      const envelope = {
        data: validResponseData,
      };
      const parsed = registerResponseEnvelopeSchema.parse(envelope);
      expect(parsed.data.id).toBe(validResponseData.id);
      expect(parsed.data.emailVerificationRequired).toBe(true);
    });

    it('rejects non-UUID id in response DTO', () => {
      expect(() =>
        registerResponseDataSchema.parse({
          ...validResponseData,
          id: 'non-uuid-id',
        }),
      ).toThrow();
    });

    it('rejects response data that tries to expose password or passwordHash', () => {
      expect(() =>
        registerResponseDataSchema.parse({
          ...validResponseData,
          passwordHash: 'secret_hash',
        }),
      ).toThrow();
    });
  });
});
