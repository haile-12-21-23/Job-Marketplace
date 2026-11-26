import { z } from 'zod';
import { createDataEnvelopeSchema, type DataEnvelope } from '../common/envelopes.js';

/**
 * Validated email verification request body.
 * Rejects unknown properties (.strict()).
 */
export const verifyEmailRequestSchema = z
  .object({
    token: z
      .string({
        required_error: 'Verification token is required',
        invalid_type_error: 'Verification token must be a string',
      })
      .trim()
      .min(1, 'Verification token is required')
      .max(512, 'Verification token is invalid'),
  })
  .strict();

export type VerifyEmailRequest = z.infer<typeof verifyEmailRequestSchema>;

/**
 * Public response DTO for email verification.
 * Exposes only safe confirmation fields; never exposes internal token or database details.
 */
export const verifyEmailResponseDataSchema = z
  .object({
    verified: z.literal(true),
    message: z.string(),
  })
  .strict();

export type VerifyEmailResponseData = z.infer<typeof verifyEmailResponseDataSchema>;

/**
 * Standard single-resource response envelope for email verification:
 * { data: VerifyEmailResponseData }
 */
export const verifyEmailResponseEnvelopeSchema = createDataEnvelopeSchema(
  verifyEmailResponseDataSchema,
);

export type VerifyEmailResponse = DataEnvelope<VerifyEmailResponseData>;

/**
 * Validated resend-verification request body.
 * Rejects unknown properties (.strict()).
 */
export const resendVerificationRequestSchema = z
  .object({
    email: z
      .string({
        required_error: 'Email is required',
        invalid_type_error: 'Email must be a string',
      })
      .trim()
      .email('Enter a valid email address')
      .max(255, 'Email cannot exceed 255 characters'),
  })
  .strict();

export type ResendVerificationRequest = z.infer<typeof resendVerificationRequestSchema>;

/**
 * Generic public response DTO for resend-verification requests.
 * Identical whether the email is unknown, unverified, or already verified.
 */
export const resendVerificationResponseDataSchema = z
  .object({
    accepted: z.literal(true),
    message: z.string(),
  })
  .strict();

export type ResendVerificationResponseData = z.infer<typeof resendVerificationResponseDataSchema>;

/**
 * Standard single-resource response envelope for resend-verification:
 * { data: ResendVerificationResponseData }
 */
export const resendVerificationResponseEnvelopeSchema = createDataEnvelopeSchema(
  resendVerificationResponseDataSchema,
);

export type ResendVerificationResponse = DataEnvelope<ResendVerificationResponseData>;
