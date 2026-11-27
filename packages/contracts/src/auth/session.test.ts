import { describe, it, expect } from 'vitest';
import {
  logoutResponseDataSchema,
  logoutResponseEnvelopeSchema,
  refreshResponseDataSchema,
  refreshResponseEnvelopeSchema,
} from './session.js';

describe('auth session refresh & logout contracts', () => {
  const sampleUuid = '550e8400-e29b-41d4-a716-446655440000';

  it('validates refresh response data and envelope strictly', () => {
    const valid = {
      data: {
        accessToken: 'signed-jwt-token',
        tokenType: 'Bearer' as const,
        expiresIn: 900,
        user: {
          id: sampleUuid,
          displayName: 'Abebe Bikila',
          email: 'abebe@example.com',
        },
      },
    };

    expect(refreshResponseEnvelopeSchema.parse(valid)).toEqual(valid);
    expect(() =>
      refreshResponseDataSchema.parse({
        ...valid.data,
        refreshToken: 'should-never-be-present',
      }),
    ).toThrow();
  });

  it('validates logout response data and envelope strictly', () => {
    const valid = { data: { loggedOut: true as const } };
    expect(logoutResponseEnvelopeSchema.parse(valid)).toEqual(valid);

    expect(() => logoutResponseDataSchema.parse({ loggedOut: false })).toThrow();
    expect(() =>
      logoutResponseDataSchema.parse({ loggedOut: true, sessionId: sampleUuid }),
    ).toThrow();
  });
});
