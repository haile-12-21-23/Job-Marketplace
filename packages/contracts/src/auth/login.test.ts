import { describe, expect, it } from 'vitest';
import {
  loginRequestSchema,
  loginUserSchema,
  loginResponseDataSchema,
  loginResponseEnvelopeSchema,
} from './login.js';
import { normalizeEmail } from './registration.js';

describe('auth login contracts', () => {
  describe('loginRequestSchema', () => {
    it('accepts a valid login payload and trims email', () => {
      const parsed = loginRequestSchema.parse({
        email: '  Abebe@Example.COM  ',
        password: 'CorrectHorseBatteryStaple123!',
      });

      expect(parsed).toEqual({
        email: 'Abebe@Example.COM',
        password: 'CorrectHorseBatteryStaple123!',
      });
      expect(normalizeEmail(parsed.email)).toBe('abebe@example.com');
    });

    it('rejects missing, malformed, or out-of-range fields', () => {
      expect(() => loginRequestSchema.parse({})).toThrow();
      expect(() =>
        loginRequestSchema.parse({ email: 'not-an-email', password: 'Password123!' }),
      ).toThrow();
      expect(() =>
        loginRequestSchema.parse({ email: 'user@example.com', password: 'short' }),
      ).toThrow();
      expect(() =>
        loginRequestSchema.parse({ email: 'user@example.com', password: 'a'.repeat(101) }),
      ).toThrow();
    });

    it('rejects unknown properties with strict validation', () => {
      expect(() =>
        loginRequestSchema.parse({
          email: 'user@example.com',
          password: 'Password123!',
          rememberMe: true,
        }),
      ).toThrow();
    });
  });

  describe('loginResponseEnvelopeSchema', () => {
    it('validates the public login response envelope', () => {
      const payload = {
        data: {
          accessToken: 'eyJhbGciOiJIUzI1NiJ9.payload.signature',
          tokenType: 'Bearer' as const,
          expiresIn: 900,
          user: {
            id: '550e8400-e29b-41d4-a716-446655440000',
            displayName: 'Abebe Bikila',
            email: 'abebe@example.com',
          },
        },
      };

      expect(loginUserSchema.parse(payload.data.user)).toEqual(payload.data.user);
      expect(loginResponseDataSchema.parse(payload.data)).toEqual(payload.data);
      expect(loginResponseEnvelopeSchema.parse(payload)).toEqual(payload);
    });

    it('rejects refresh tokens or internal session fields in login response DTO', () => {
      expect(() =>
        loginResponseDataSchema.parse({
          accessToken: 'jwt',
          tokenType: 'Bearer',
          expiresIn: 900,
          refreshToken: 'should-not-be-here',
          user: {
            id: '550e8400-e29b-41d4-a716-446655440000',
            displayName: 'Abebe Bikila',
            email: 'abebe@example.com',
          },
        }),
      ).toThrow();
    });
  });
});
