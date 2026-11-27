import { z } from 'zod';
import { createDataEnvelopeSchema } from '../common/envelopes.js';
import { publicIdSchema } from '../common/identifiers.js';
import { countryCodeSchema } from '../jobs/job-search.js';

export const EMPLOYER_STATUS_VALUES = ['ACTIVE', 'INACTIVE', 'SUSPENDED'] as const;
export const employerStatusSchema = z.enum(EMPLOYER_STATUS_VALUES);
export type EmployerAccountStatus = z.infer<typeof employerStatusSchema>;

export const VERIFICATION_STATUS_VALUES = [
  'UNVERIFIED',
  'PENDING',
  'VERIFIED',
  'REJECTED',
] as const;
export const verificationStatusSchema = z.enum(VERIFICATION_STATUS_VALUES);
export type EmployerVerificationStatus = z.infer<typeof verificationStatusSchema>;

const publicNameSchema = z
  .string({
    required_error: 'Public name is required',
    invalid_type_error: 'Public name must be a string',
  })
  .trim()
  .min(2, 'Public name must be at least 2 characters')
  .max(120, 'Public name must be at most 120 characters');

const optionalNullableContactPhoneSchema = z
  .string({ invalid_type_error: 'Contact phone must be a string' })
  .trim()
  .max(50, 'Contact phone must be at most 50 characters')
  .transform((value) => (value.length === 0 ? null : value))
  .nullable()
  .optional();

const optionalNullableCitySchema = z
  .string({ invalid_type_error: 'City must be a string' })
  .trim()
  .min(1, 'City must be between 1 and 100 characters')
  .max(100, 'City must be at most 100 characters')
  .nullable()
  .optional();

const optionalNullableCountryCodeSchema = countryCodeSchema.nullable().optional();

/**
 * Strict request contract for POST /api/v1/employer-accounts (INDIVIDUAL account).
 * Rejects unknown properties including ownerUserId, userId, type, status, and verificationStatus.
 */
export const createIndividualEmployerAccountRequestSchema = z
  .object({
    publicName: publicNameSchema,
    contactPhone: optionalNullableContactPhoneSchema,
    countryCode: optionalNullableCountryCodeSchema,
    city: optionalNullableCitySchema,
  })
  .strict();

export type CreateIndividualEmployerAccountRequest = z.infer<
  typeof createIndividualEmployerAccountRequestSchema
>;

/**
 * Strict partial request contract for PATCH /api/v1/employer-accounts/:employerAccountId.
 * Allows mutating editable IndividualEmployerProfile fields only and rejects empty patches.
 */
export const updateIndividualEmployerProfileRequestSchema = z
  .object({
    publicName: publicNameSchema.optional(),
    contactPhone: optionalNullableContactPhoneSchema,
    countryCode: optionalNullableCountryCodeSchema,
    city: optionalNullableCitySchema,
  })
  .strict()
  .refine(
    (data) =>
      data.publicName !== undefined ||
      data.contactPhone !== undefined ||
      data.countryCode !== undefined ||
      data.city !== undefined,
    {
      message: 'At least one profile field must be provided for update',
    },
  );

export type UpdateIndividualEmployerProfileRequest = z.infer<
  typeof updateIndividualEmployerProfileRequestSchema
>;

export const individualEmployerProfileDtoSchema = z.object({
  publicName: z.string(),
  contactPhone: z.string().nullable(),
  countryCode: z.string().nullable(),
  city: z.string().nullable(),
  updatedAt: z.string().datetime(),
});

export type IndividualEmployerProfileDto = z.infer<typeof individualEmployerProfileDtoSchema>;

export const individualEmployerAccountDtoSchema = z.object({
  id: publicIdSchema,
  type: z.literal('INDIVIDUAL'),
  status: employerStatusSchema,
  verificationStatus: verificationStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  profile: individualEmployerProfileDtoSchema,
});

export type IndividualEmployerAccountDto = z.infer<typeof individualEmployerAccountDtoSchema>;

export const createIndividualEmployerAccountResponseEnvelopeSchema = createDataEnvelopeSchema(
  individualEmployerAccountDtoSchema,
);
export const getIndividualEmployerAccountResponseEnvelopeSchema = createDataEnvelopeSchema(
  individualEmployerAccountDtoSchema,
);
export const updateIndividualEmployerProfileResponseEnvelopeSchema = createDataEnvelopeSchema(
  individualEmployerAccountDtoSchema,
);

export type CreateIndividualEmployerAccountResponse = z.infer<
  typeof createIndividualEmployerAccountResponseEnvelopeSchema
>;
export type GetIndividualEmployerAccountResponse = z.infer<
  typeof getIndividualEmployerAccountResponseEnvelopeSchema
>;
export type UpdateIndividualEmployerProfileResponse = z.infer<
  typeof updateIndividualEmployerProfileResponseEnvelopeSchema
>;
