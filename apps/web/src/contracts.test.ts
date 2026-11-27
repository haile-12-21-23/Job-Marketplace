import { describe, it, expect } from 'vitest';
import {
  confirmPasswordResetRequestSchema,
  confirmPasswordResetResponseEnvelopeSchema,
  jobSearchQuerySchema,
  loginRequestSchema,
  loginResponseDataSchema,
  logoutResponseEnvelopeSchema,
  refreshResponseEnvelopeSchema,
  registerRequestSchema,
  requestPasswordResetRequestSchema,
  requestPasswordResetResponseEnvelopeSchema,
  resendVerificationRequestSchema,
  verifyEmailRequestSchema,
  type ConfirmPasswordResetRequest,
  type ConfirmPasswordResetResponse,
  type JobSearchQueryInput,
  type JobSearchQueryOutput,
  type DataEnvelope,
  type LoginRequest,
  type LoginResponseData,
  type LogoutResponse,
  type RefreshResponse,
  type RegisterRequest,
  type RequestPasswordResetRequest,
  type RequestPasswordResetResponse,
  type ResendVerificationRequest,
  type VerifyEmailRequest,
} from '@jmp/contracts';

describe('@jmp/web -> @jmp/contracts integration', () => {
  const sampleUuid = '550e8400-e29b-41d4-a716-446655440000';

  it('parses valid browser search form state into strongly typed query DTO', () => {
    // Browser form state typed with inferred JobSearchQueryInput without duplicate interfaces
    const formState: JobSearchQueryInput = {
      q: 'React Developer',
      countryCode: 'et',
      city: 'Addis Ababa',
      categoryId: sampleUuid,
      sort: 'publishedAt:desc',
      page: 1,
      pageSize: 20,
    };

    const parsed: JobSearchQueryOutput = jobSearchQuerySchema.parse(formState);

    expect(parsed.q).toBe('React Developer');
    expect(parsed.countryCode).toBe('ET');
    expect(parsed.city).toBe('Addis Ababa');
    expect(parsed.categoryId).toBe(sampleUuid);
    expect(parsed.sort).toBe('publishedAt:desc');
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(20);
  });

  it('rejects invalid browser form inputs', () => {
    // Exceeds max pageSize of 100
    expect(() =>
      jobSearchQuerySchema.parse({
        pageSize: 150,
      }),
    ).toThrow();

    // Invalid country code length
    expect(() =>
      jobSearchQuerySchema.parse({
        countryCode: 'TOOLONG',
      }),
    ).toThrow();

    // Malformed UUID
    expect(() =>
      jobSearchQuerySchema.parse({
        categoryId: 'invalid-id',
      }),
    ).toThrow();
  });

  it('uses exported DataEnvelope type without declaring a duplicate interface', () => {
    const searchResultPayload: DataEnvelope<JobSearchQueryOutput> = {
      data: {
        page: 1,
        pageSize: 20,
        q: 'Frontend Engineer',
        countryCode: 'ET',
      },
    };

    expect(searchResultPayload.data.countryCode).toBe('ET');
  });

  it('validates registration form state matches RegisterRequest contract', () => {
    const formState: RegisterRequest = {
      displayName: 'Hailemariam Addisu',
      email: 'haile@example.com',
      password: 'StrongPassword123!',
    };

    const parsed = registerRequestSchema.parse(formState);
    expect(parsed.displayName).toBe('Hailemariam Addisu');
    expect(parsed.email).toBe('haile@example.com');
  });

  it('validates verify-email and resend-verification form states against shared contracts', () => {
    const verifyForm: VerifyEmailRequest = { token: 'raw_token_123' };
    expect(verifyEmailRequestSchema.parse(verifyForm)).toEqual({ token: 'raw_token_123' });

    const resendForm: ResendVerificationRequest = { email: 'haile@example.com' };
    expect(resendVerificationRequestSchema.parse(resendForm)).toEqual({
      email: 'haile@example.com',
    });

    const loginForm: LoginRequest = { email: 'haile@example.com', password: 'StrongPassword123!' };
    expect(loginRequestSchema.parse(loginForm)).toEqual(loginForm);

    const loginDto: LoginResponseData = {
      accessToken: 'jwt-token',
      tokenType: 'Bearer',
      expiresIn: 900,
      user: { id: sampleUuid, displayName: 'Haile', email: 'haile@example.com' },
    };
    expect(loginResponseDataSchema.parse(loginDto).tokenType).toBe('Bearer');

    const refreshRes: RefreshResponse = { data: loginDto };
    expect(refreshResponseEnvelopeSchema.parse(refreshRes).data.tokenType).toBe('Bearer');

    const logoutRes: LogoutResponse = { data: { loggedOut: true } };
    expect(logoutResponseEnvelopeSchema.parse(logoutRes).data.loggedOut).toBe(true);

    const forgotReq: RequestPasswordResetRequest = { email: 'haile@example.com' };
    expect(requestPasswordResetRequestSchema.parse(forgotReq)).toEqual(forgotReq);
    const forgotRes: RequestPasswordResetResponse = {
      data: { accepted: true, message: 'Sent' },
    };
    expect(requestPasswordResetResponseEnvelopeSchema.parse(forgotRes).data.accepted).toBe(true);

    const resetReq: ConfirmPasswordResetRequest = {
      token: 'reset-tok',
      newPassword: 'StrongPassword123!',
    };
    expect(confirmPasswordResetRequestSchema.parse(resetReq)).toEqual(resetReq);
    const resetRes: ConfirmPasswordResetResponse = {
      data: { reset: true, message: 'Reset ok' },
    };
    expect(confirmPasswordResetResponseEnvelopeSchema.parse(resetRes).data.reset).toBe(true);
  });
});
