import { z } from 'zod';
import { createDataEnvelopeSchema, type DataEnvelope } from '../common/envelopes.js';
import {
  loginResponseDataSchema,
  loginResponseEnvelopeSchema,
  type LoginResponse,
  type LoginResponseData,
} from './login.js';

/**
 * Public response DTO for session refresh.
 * Matches login response shape: short-lived Bearer access token metadata and safe user fields.
 */
export const refreshResponseDataSchema = loginResponseDataSchema;

export type RefreshResponseData = LoginResponseData;

/**
 * Standard single-resource response envelope for session refresh:
 * { data: RefreshResponseData }
 */
export const refreshResponseEnvelopeSchema = loginResponseEnvelopeSchema;

export type RefreshResponse = LoginResponse;

/**
 * Public response DTO for session logout.
 */
export const logoutResponseDataSchema = z
  .object({
    loggedOut: z.literal(true),
  })
  .strict();

export type LogoutResponseData = z.infer<typeof logoutResponseDataSchema>;

/**
 * Standard single-resource response envelope for session logout:
 * { data: LogoutResponseData }
 */
export const logoutResponseEnvelopeSchema = createDataEnvelopeSchema(logoutResponseDataSchema);

export type LogoutResponse = DataEnvelope<LogoutResponseData>;
