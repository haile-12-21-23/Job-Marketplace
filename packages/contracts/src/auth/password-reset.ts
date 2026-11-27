import { z } from 'zod';
import { createDataEnvelopeSchema, type DataEnvelope } from '../common/envelopes.js';

/**
 * Validated forgot-password request body.
 * Rejects unknown properties (.strict()).
 */
export const requestPasswordResetRequestSchema = z
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

export type RequestPasswordResetRequest = z.infer<typeof requestPasswordResetRequestSchema>;

/**
 * Generic anti-enumeration response DTO for password reset requests.
 */
export const requestPasswordResetResponseDataSchema = z
  .object({
    accepted: z.literal(true),
    message: z.string().min(1),
  })
  .strict();

export type RequestPasswordResetResponseData = z.infer<
  typeof requestPasswordResetResponseDataSchema
>;

export const requestPasswordResetResponseEnvelopeSchema = createDataEnvelopeSchema(
  requestPasswordResetResponseDataSchema,
);

export type RequestPasswordResetResponse = DataEnvelope<RequestPasswordResetResponseData>;

/**
 * Validated password reset confirmation request body.
 * Enforces the established 8-100 character password policy and rejects unknown properties.
 */
export const confirmPasswordResetRequestSchema = z
  .object({
    token: z
      .string({
        required_error: 'Reset token is required',
        invalid_type_error: 'Reset token must be a string',
      })
      .trim()
      .min(1, 'Reset token is required')
      .max(512, 'Reset token is invalid'),
    newPassword: z
      .string({
        required_error: 'Password is required',
        invalid_type_error: 'Password must be a string',
      })
      .min(8, 'Password must be at least 8 characters')
      .max(100, 'Password cannot exceed 100 characters'),
  })
  .strict();

export type ConfirmPasswordResetRequest = z.infer<typeof confirmPasswordResetRequestSchema>;

/**
 * Public response DTO for password reset confirmation.
 */
export const confirmPasswordResetResponseDataSchema = z
  .object({
    reset: z.literal(true),
    message: z.string().min(1),
  })
  .strict();

export type ConfirmPasswordResetResponseData = z.infer<
  typeof confirmPasswordResetResponseDataSchema
>;

export const confirmPasswordResetResponseEnvelopeSchema = createDataEnvelopeSchema(
  confirmPasswordResetResponseDataSchema,
);

export type ConfirmPasswordResetResponse = DataEnvelope<ConfirmPasswordResetResponseData>;
