import { describe, expect, it } from 'vitest';
import {
  createIndividualEmployerAccountRequestSchema,
  createIndividualEmployerAccountResponseEnvelopeSchema,
  individualEmployerAccountDtoSchema,
  updateIndividualEmployerProfileRequestSchema,
} from './individual-employer-account.js';

describe('Individual employer account contracts', () => {
  it('validates, trims, and normalizes valid create payloads', () => {
    const parsed = createIndividualEmployerAccountRequestSchema.parse({
      publicName: '  Abebe Recruitment Studio  ',
      contactPhone: '  +251 911 000000  ',
      countryCode: '  et ',
      city: '  Addis Ababa  ',
    });

    expect(parsed).toEqual({
      publicName: 'Abebe Recruitment Studio',
      contactPhone: '+251 911 000000',
      countryCode: 'ET',
      city: 'Addis Ababa',
    });

    // Nullable / blank optional handling
    const minimal = createIndividualEmployerAccountRequestSchema.parse({
      publicName: 'Abebe Bikila',
      contactPhone: '   ',
      countryCode: null,
      city: null,
    });
    expect(minimal).toEqual({
      publicName: 'Abebe Bikila',
      contactPhone: null,
      countryCode: null,
      city: null,
    });
  });

  it('rejects invalid bounds, malformed country code, and unknown/privilege properties on create', () => {
    expect(
      createIndividualEmployerAccountRequestSchema.safeParse({ publicName: 'A' }).success,
    ).toBe(false);
    expect(
      createIndividualEmployerAccountRequestSchema.safeParse({ publicName: 'A'.repeat(121) })
        .success,
    ).toBe(false);
    expect(
      createIndividualEmployerAccountRequestSchema.safeParse({
        publicName: 'Valid Studio',
        contactPhone: '1'.repeat(51),
      }).success,
    ).toBe(false);
    expect(
      createIndividualEmployerAccountRequestSchema.safeParse({
        publicName: 'Valid Studio',
        countryCode: 'ETH',
      }).success,
    ).toBe(false);
    expect(
      createIndividualEmployerAccountRequestSchema.safeParse({
        publicName: 'Valid Studio',
        city: '   ',
      }).success,
    ).toBe(false);
    expect(
      createIndividualEmployerAccountRequestSchema.safeParse({
        publicName: 'Valid Studio',
        ownerUserId: '550e8400-e29b-41d4-a716-446655440000',
      }).success,
    ).toBe(false);
    expect(
      createIndividualEmployerAccountRequestSchema.safeParse({
        publicName: 'Valid Studio',
        status: 'ACTIVE',
      }).success,
    ).toBe(false);
  });

  it('validates partial profile updates, rejects empty patch, and rejects immutable system fields', () => {
    expect(updateIndividualEmployerProfileRequestSchema.safeParse({}).success).toBe(false);

    const partial = updateIndividualEmployerProfileRequestSchema.parse({
      countryCode: 'us',
      city: null,
    });
    expect(partial).toEqual({
      countryCode: 'US',
      city: null,
    });

    for (const forbidden of ['ownerUserId', 'userId', 'status', 'type', 'verificationStatus']) {
      expect(
        updateIndividualEmployerProfileRequestSchema.safeParse({
          publicName: 'Updated Name',
          [forbidden]: 'anything',
        }).success,
      ).toBe(false);
    }
  });

  it('validates safe response DTO and data envelope', () => {
    const sample = {
      data: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        type: 'INDIVIDUAL' as const,
        status: 'ACTIVE' as const,
        verificationStatus: 'UNVERIFIED' as const,
        createdAt: '2026-11-27T12:00:00.000Z',
        updatedAt: '2026-11-27T12:00:00.000Z',
        profile: {
          publicName: 'Abebe Studio',
          contactPhone: null,
          countryCode: 'ET',
          city: 'Addis Ababa',
          updatedAt: '2026-11-27T12:00:00.000Z',
        },
      },
    };

    expect(individualEmployerAccountDtoSchema.parse(sample.data)).toEqual(sample.data);
    expect(createIndividualEmployerAccountResponseEnvelopeSchema.parse(sample)).toEqual(sample);
  });
});
