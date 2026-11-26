import { z } from 'zod';
import { publicIdSchema } from '../common/identifiers.js';
import { createDataEnvelopeSchema, type DataEnvelope } from '../common/envelopes.js';

/**
 * Validated login request body.
 * Rejects unknown properties (.strict()).
 */
export const loginRequestSchema = z
  .object({
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

export type LoginRequest = z.infer<typeof loginRequestSchema>;

/**
 * Safe public user summary returned on successful login.
 */
export const loginUserSchema = z
  .object({
    id: publicIdSchema,
    displayName: z.string(),
    email: z.string().email(),
  })
  .strict();

export type LoginUser = z.infer<typeof loginUserSchema>;

/**
 * Public response DTO for login.
 * Contains only short-lived Bearer access token metadata and safe user fields;
 * never exposes refresh credentials, password hashes, or internal session rows.
 */
export const loginResponseDataSchema = z
  .object({
    accessToken: z.string().min(1),
    tokenType: z.literal('Bearer'),
    expiresIn: z.number().int().positive(),
    user: loginUserSchema,
  })
  .strict();

export type LoginResponseData = z.infer<typeof loginResponseDataSchema>;

/**
 * Standard single-resource response envelope for login:
 * { data: LoginResponseData }
 */
export const loginResponseEnvelopeSchema = createDataEnvelopeSchema(loginResponseDataSchema);

export type LoginResponse = DataEnvelope<LoginResponseData>;
