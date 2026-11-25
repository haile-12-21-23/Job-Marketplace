import { z } from 'zod';
import { publicIdSchema } from '../common/identifiers.js';
import { createDataEnvelopeSchema, type DataEnvelope } from '../common/envelopes.js';

/**
 * Normalizes an email address according to platform standards:
 * trims leading/trailing whitespace and converts to lowercase.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Validated registration request body.
 * Rejects unknown properties (.strict()).
 */
export const registerRequestSchema = z
  .object({
    displayName: z
      .string({
        required_error: 'Display name is required',
        invalid_type_error: 'Display name must be a string',
      })
      .trim()
      .min(2, 'Display name must be at least 2 characters')
      .max(120, 'Display name cannot exceed 120 characters'),
    email: z
      .string({
        required_error: 'Email is required',
        invalid_type_error: 'Email must be a string',
      })
      .trim()
      .email('Enter a valid email address')
      .max(255, 'Email cannot exceed 255 characters'),
    password: z
      .string({
        required_error: 'Password is required',
        invalid_type_error: 'Password must be a string',
      })
      .min(8, 'Password must be at least 8 characters')
      .max(100, 'Password cannot exceed 100 characters'),
  })
  .strict();

export type RegisterRequest = z.infer<typeof registerRequestSchema>;

/**
 * Public response DTO for user registration.
 * Exposes only safe fields; never exposes passwords, hashes, or tokens.
 */
export const registerResponseDataSchema = z
  .object({
    id: publicIdSchema,
    displayName: z.string(),
    email: z.string().email(),
    emailVerificationRequired: z.literal(true),
  })
  .strict();

export type RegisterResponseData = z.infer<typeof registerResponseDataSchema>;

/**
 * Standard single-resource response envelope for registration:
 * { data: RegisterResponseData }
 */
export const registerResponseEnvelopeSchema = createDataEnvelopeSchema(registerResponseDataSchema);

export type RegisterResponse = DataEnvelope<RegisterResponseData>;
