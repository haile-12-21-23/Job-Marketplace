import { z } from 'zod';
import { publicIdSchema } from '../common/identifiers.js';
import { pageQueryParamSchema, pageSizeQueryParamSchema } from '../common/pagination.js';

/**
 * 2-letter uppercase ISO 3166-1 alpha-2 country code schema.
 */
export const countryCodeSchema = z
  .string()
  .trim()
  .length(2, 'Country code must be a 2-letter ISO 3166-1 alpha-2 code')
  .regex(/^[A-Za-z]{2}$/, 'Country code must contain alphabetic characters only')
  .transform((val) => val.toUpperCase());

export type CountryCode = z.infer<typeof countryCodeSchema>;

/**
 * Allowlisted sort keys for public job search queries.
 * Arbitrary sort parameters or ORM order clauses are rejected.
 */
export const JOB_SEARCH_SORT_VALUES = [
  'publishedAt:desc',
  'publishedAt:asc',
  'createdAt:desc',
  'createdAt:asc',
] as const;

export const jobSearchSortSchema = z.enum(JOB_SEARCH_SORT_VALUES);
export type JobSearchSort = z.infer<typeof jobSearchSortSchema>;

/**
 * Representative public job search query contract.
 *
 * Implements agreed first-release public filters from JMP API Standards:
 * - page, pageSize, q (inherited pagination/search rules)
 * - countryCode: Uppercase ISO 3166-1 alpha-2 code
 * - city: Bounded, trimmed optional string (1-100 chars)
 * - categoryId: Public UUID identifier
 * - skillId: Repeated/multi-value public UUID filter, normalized to string[]
 * - sort: Allowlisted sort order
 * Rejects unknown query keys.
 */
export const jobSearchQuerySchema = z
  .object({
    page: pageQueryParamSchema,
    pageSize: pageSizeQueryParamSchema,
    q: z.string().trim().max(120).optional(),
    countryCode: countryCodeSchema.optional(),
    city: z.string().trim().min(1).max(100).optional(),
    categoryId: publicIdSchema.optional(),
    skillId: z
      .union([publicIdSchema, z.array(publicIdSchema)])
      .optional()
      .transform((val) => {
        if (!val) return undefined;
        return Array.isArray(val) ? val : [val];
      }),
    sort: jobSearchSortSchema.optional(),
  })
  .strict();

export type JobSearchQueryInput = z.input<typeof jobSearchQuerySchema>;
export type JobSearchQueryOutput = z.output<typeof jobSearchQuerySchema>;
export type JobSearchQuery = JobSearchQueryOutput;
