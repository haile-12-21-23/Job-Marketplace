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

// Auth domain contracts
export {
  normalizeEmail,
  registerRequestSchema,
  registerResponseDataSchema,
  registerResponseEnvelopeSchema,
  verifyEmailRequestSchema,
  verifyEmailResponseDataSchema,
  verifyEmailResponseEnvelopeSchema,
  resendVerificationRequestSchema,
  resendVerificationResponseDataSchema,
  resendVerificationResponseEnvelopeSchema,
  loginRequestSchema,
  loginUserSchema,
  loginResponseDataSchema,
  loginResponseEnvelopeSchema,
  refreshResponseDataSchema,
  refreshResponseEnvelopeSchema,
  logoutResponseDataSchema,
  logoutResponseEnvelopeSchema,
  requestPasswordResetRequestSchema,
  requestPasswordResetResponseDataSchema,
  requestPasswordResetResponseEnvelopeSchema,
  confirmPasswordResetRequestSchema,
  confirmPasswordResetResponseDataSchema,
  confirmPasswordResetResponseEnvelopeSchema,
  type RegisterRequest,
  type RegisterResponseData,
  type RegisterResponse,
  type VerifyEmailRequest,
  type VerifyEmailResponseData,
  type VerifyEmailResponse,
  type ResendVerificationRequest,
  type ResendVerificationResponseData,
  type ResendVerificationResponse,
  type LoginRequest,
  type LoginUser,
  type LoginResponseData,
  type LoginResponse,
  type RefreshResponseData,
  type RefreshResponse,
  type LogoutResponseData,
  type LogoutResponse,
  type RequestPasswordResetRequest,
  type RequestPasswordResetResponseData,
  type RequestPasswordResetResponse,
  type ConfirmPasswordResetRequest,
  type ConfirmPasswordResetResponseData,
  type ConfirmPasswordResetResponse,
} from './auth/index.js';

// Employer account contracts
export {
  EMPLOYER_STATUS_VALUES,
  VERIFICATION_STATUS_VALUES,
  employerStatusSchema,
  verificationStatusSchema,
  createIndividualEmployerAccountRequestSchema,
  updateIndividualEmployerProfileRequestSchema,
  individualEmployerProfileDtoSchema,
  individualEmployerAccountDtoSchema,
  createIndividualEmployerAccountResponseEnvelopeSchema,
  getIndividualEmployerAccountResponseEnvelopeSchema,
  updateIndividualEmployerProfileResponseEnvelopeSchema,
  type EmployerAccountStatus,
  type EmployerVerificationStatus,
  type CreateIndividualEmployerAccountRequest,
  type UpdateIndividualEmployerProfileRequest,
  type IndividualEmployerProfileDto,
  type IndividualEmployerAccountDto,
  type CreateIndividualEmployerAccountResponse,
  type GetIndividualEmployerAccountResponse,
  type UpdateIndividualEmployerProfileResponse,
} from './employer/index.js';
