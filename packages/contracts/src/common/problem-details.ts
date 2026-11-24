import { z } from 'zod';

/**
 * Field-level validation error detail matching JMP API Standards.
 */
export const problemDetailErrorItemSchema = z.object({
  pointer: z.string(),
  code: z.string(),
  detail: z.string(),
});

export type ProblemDetailErrorItem = z.infer<typeof problemDetailErrorItemSchema>;

/**
 * RFC 9457 Problem Details schema with JMP platform extensions:
 * - code: Stable machine-readable application error code.
 * - requestId: Correlation ID for tracing.
 * - errors: Optional array of field-level validation errors.
 * Not strict to allow forward-compatible additive fields.
 */
export const problemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  instance: z.string().optional(),
  code: z.string(),
  requestId: z.string(),
  errors: z.array(problemDetailErrorItemSchema).optional(),
});

export type ProblemDetails = z.infer<typeof problemDetailsSchema>;
