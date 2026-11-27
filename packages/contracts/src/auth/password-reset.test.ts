import { describe, it, expect } from 'vitest';
import {
  confirmPasswordResetRequestSchema,
  confirmPasswordResetResponseDataSchema,
  confirmPasswordResetResponseEnvelopeSchema,
  requestPasswordResetRequestSchema,
  requestPasswordResetResponseDataSchema,
  requestPasswordResetResponseEnvelopeSchema,
} from './password-reset.js';

describe('auth password-reset contracts', () => {
  it('validates request-password-reset payload and generic response envelope strictly', () => {
    const validReq = requestPasswordResetRequestSchema.parse({
      email: '  Abebe@Example.COM  ',
    });
    expect(validReq).toEqual({ email: 'Abebe@Example.COM' });

    expect(() => requestPasswordResetRequestSchema.parse({ email: 'not-an-email' })).toThrow();
    expect(() =>
      requestPasswordResetRequestSchema.parse({
        email: `${'a'.repeat(250)}@example.com`,
      }),
    ).toThrow();
    expect(() =>
      requestPasswordResetRequestSchema.parse({
        email: 'user@example.com',
        extraField: true,
      }),
    ).toThrow();

    const validRes = {
      data: {
        accepted: true as const,
        message:
          'If an account matches that email address, password reset instructions will be sent.',
      },
    };
    expect(requestPasswordResetResponseEnvelopeSchema.parse(validRes)).toEqual(validRes);
    expect(() =>
      requestPasswordResetResponseDataSchema.parse({
        accepted: false,
        message: 'nope',
      }),
    ).toThrow();
  });

  it('validates confirm-password-reset payload and response envelope strictly', () => {
    const validConfirm = confirmPasswordResetRequestSchema.parse({
      token: '  raw_reset_token_abc  ',
      newPassword: 'NewStrongPassword123!',
    });
    expect(validConfirm).toEqual({
      token: 'raw_reset_token_abc',
      newPassword: 'NewStrongPassword123!',
    });

    // Reject empty/oversized token
    expect(() =>
      confirmPasswordResetRequestSchema.parse({ token: '   ', newPassword: 'Password123!' }),
    ).toThrow();
    expect(() =>
      confirmPasswordResetRequestSchema.parse({
        token: 'a'.repeat(513),
        newPassword: 'Password123!',
      }),
    ).toThrow();

    // Enforce 8-100 password policy
    expect(() =>
      confirmPasswordResetRequestSchema.parse({ token: 'tok', newPassword: 'short' }),
    ).toThrow();
    expect(() =>
      confirmPasswordResetRequestSchema.parse({ token: 'tok', newPassword: 'a'.repeat(101) }),
    ).toThrow();

    // Reject unexpected object fields
    expect(() =>
      confirmPasswordResetRequestSchema.parse({
        token: 'tok',
        newPassword: 'Password123!',
        confirmPassword: 'Password123!',
      }),
    ).toThrow();

    const validRes = {
      data: {
        reset: true as const,
        message: 'Your password has been reset. You can now sign in with your new password.',
      },
    };
    expect(confirmPasswordResetResponseEnvelopeSchema.parse(validRes)).toEqual(validRes);
    expect(() =>
      confirmPasswordResetResponseDataSchema.parse({
        reset: true,
        message: 'ok',
        accessToken: 'should-not-exist',
      }),
    ).toThrow();
  });
});
