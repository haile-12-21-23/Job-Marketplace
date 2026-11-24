import { z } from 'zod';

/**
 * Coerced positive integer query parameter schema for page.
 * Accepts string or number, coerces to positive integer, defaults to 1.
 */
export const pageQueryParamSchema = z
  .union([z.number(), z.string()])
  .pipe(z.coerce.number().int().positive())
  .default(1);

/**
 * Coerced positive integer query parameter schema for pageSize.
 * Accepts string or number, coerces to positive integer bounded between 1 and 100, defaults to 20.
 */
export const pageSizeQueryParamSchema = z
  .union([z.number(), z.string()])
  .pipe(z.coerce.number().int().positive().max(100))
  .default(20);

/**
 * Standard page-based query input schema matching JMP API Standards.
 * - page: Positive integer, defaults to 1.
 * - pageSize: Positive integer between 1 and 100, defaults to 20.
 * - q: Optional trimmed search phrase, maximum 120 characters.
 * Unknown query properties are rejected.
 */
export const paginationQuerySchema = z
  .object({
    page: pageQueryParamSchema,
    pageSize: pageSizeQueryParamSchema,
    q: z.string().trim().max(120).optional(),
  })
  .strict();

export type PaginationQueryInput = z.input<typeof paginationQuerySchema>;
export type PaginationQueryOutput = z.output<typeof paginationQuerySchema>;
export type PaginationQuery = PaginationQueryOutput;

/**
 * Standard pagination metadata output schema matching JMP API Standards.
 * Returned inside meta.pagination for page-based collection responses.
 */
export const paginationMetaSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive().max(100),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export type PaginationMeta = z.infer<typeof paginationMetaSchema>;
