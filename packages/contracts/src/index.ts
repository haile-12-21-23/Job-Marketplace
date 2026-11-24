/** Shared API version identifier. */
export const API_VERSION = 'v1' as const;
export type ApiVersion = typeof API_VERSION;

// Identifiers
export { publicIdSchema, type PublicId } from './common/identifiers.js';

// Pagination
export {
  paginationQuerySchema,
  paginationMetaSchema,
  type PaginationQueryInput,
  type PaginationQueryOutput,
  type PaginationQuery,
  type PaginationMeta,
} from './common/pagination.js';

// Envelopes
export {
  createDataEnvelopeSchema,
  createPaginatedEnvelopeSchema,
  createSingleResourceResponseSchema,
  createCollectionResponseSchema,
  type DataEnvelope,
  type PaginatedEnvelope,
  type SingleResourceResponse,
  type CollectionResponse,
} from './common/envelopes.js';

// Problem Details (RFC 9457)
export {
  problemDetailErrorItemSchema,
  problemDetailsSchema,
  type ProblemDetailErrorItem,
  type ProblemDetails,
} from './common/problem-details.js';

// Jobs domain contracts
export {
  countryCodeSchema,
  JOB_SEARCH_SORT_VALUES,
  jobSearchSortSchema,
  jobSearchQuerySchema,
  type CountryCode,
  type JobSearchSort,
  type JobSearchQueryInput,
  type JobSearchQueryOutput,
  type JobSearchQuery,
} from './jobs/job-search.js';
