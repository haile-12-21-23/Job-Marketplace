import { describe, expect, it } from 'vitest';
import {
  API_VERSION,
  publicIdSchema,
  paginationQuerySchema,
  paginationMetaSchema,
  createDataEnvelopeSchema,
  createPaginatedEnvelopeSchema,
  createSingleResourceResponseSchema,
  createCollectionResponseSchema,
  problemDetailsSchema,
  problemDetailErrorItemSchema,
  countryCodeSchema,
  JOB_SEARCH_SORT_VALUES,
  jobSearchSortSchema,
  jobSearchQuerySchema,
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
  type ApiVersion,
  type PublicId,
  type PaginationQueryInput,
  type PaginationQueryOutput,
  type PaginationMeta,
  type DataEnvelope,
  type PaginatedEnvelope,
  type ProblemDetails,
  type JobSearchQueryInput,
  type JobSearchQueryOutput,
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
  type EmployerAccountStatus,
  type EmployerVerificationStatus,
  type CreateIndividualEmployerAccountRequest,
  type UpdateIndividualEmployerProfileRequest,
  type IndividualEmployerProfileDto,
  type IndividualEmployerAccountDto,
  type CreateIndividualEmployerAccountResponse,
  type GetIndividualEmployerAccountResponse,
  type UpdateIndividualEmployerProfileResponse,
} from './index.js';

describe('@jmp/contracts public barrel exports', () => {
  it('exports API_VERSION marker', () => {
    expect(API_VERSION).toBe('v1');
    const version: ApiVersion = 'v1';
    expect(version).toBe(API_VERSION);
  });

  it('exports all common identifier and pagination schemas', () => {
    expect(publicIdSchema).toBeDefined();
    expect(paginationQuerySchema).toBeDefined();
    expect(paginationMetaSchema).toBeDefined();
  });

  it('exports response envelope factory functions and aliases', () => {
    expect(createDataEnvelopeSchema).toBeDefined();
    expect(createPaginatedEnvelopeSchema).toBeDefined();
    expect(createSingleResourceResponseSchema).toBe(createDataEnvelopeSchema);
    expect(createCollectionResponseSchema).toBe(createPaginatedEnvelopeSchema);
  });

  it('exports RFC 9457 problem details schemas', () => {
    expect(problemDetailsSchema).toBeDefined();
    expect(problemDetailErrorItemSchema).toBeDefined();
  });

  it('exports jobs domain schemas and constants', () => {
    expect(countryCodeSchema).toBeDefined();
    expect(JOB_SEARCH_SORT_VALUES).toEqual([
      'publishedAt:desc',
      'publishedAt:asc',
      'createdAt:desc',
      'createdAt:asc',
    ]);
    expect(jobSearchSortSchema).toBeDefined();
    expect(jobSearchQuerySchema).toBeDefined();
  });

  it('exports auth domain schemas and normalizer', () => {
    expect(normalizeEmail).toBeDefined();
    expect(registerRequestSchema).toBeDefined();
    expect(registerResponseDataSchema).toBeDefined();
    expect(registerResponseEnvelopeSchema).toBeDefined();
    expect(verifyEmailRequestSchema).toBeDefined();
    expect(verifyEmailResponseDataSchema).toBeDefined();
    expect(verifyEmailResponseEnvelopeSchema).toBeDefined();
    expect(resendVerificationRequestSchema).toBeDefined();
    expect(resendVerificationResponseDataSchema).toBeDefined();
    expect(resendVerificationResponseEnvelopeSchema).toBeDefined();
    expect(loginRequestSchema).toBeDefined();
    expect(loginUserSchema).toBeDefined();
    expect(loginResponseDataSchema).toBeDefined();
    expect(loginResponseEnvelopeSchema).toBeDefined();
    expect(refreshResponseDataSchema).toBeDefined();
    expect(refreshResponseEnvelopeSchema).toBeDefined();
    expect(logoutResponseDataSchema).toBeDefined();
    expect(logoutResponseEnvelopeSchema).toBeDefined();
    expect(requestPasswordResetRequestSchema).toBeDefined();
    expect(requestPasswordResetResponseDataSchema).toBeDefined();
    expect(requestPasswordResetResponseEnvelopeSchema).toBeDefined();
    expect(confirmPasswordResetRequestSchema).toBeDefined();
    expect(confirmPasswordResetResponseDataSchema).toBeDefined();
    expect(confirmPasswordResetResponseEnvelopeSchema).toBeDefined();
  });

  it('enforces type compatibility through inferred types', () => {
    const rawInput: JobSearchQueryInput = { page: 1, pageSize: 20 };
    const output: JobSearchQueryOutput = jobSearchQuerySchema.parse(rawInput);
    const paginationInput: PaginationQueryInput = { page: 1, pageSize: 20 };
    const paginationOutput: PaginationQueryOutput = paginationQuerySchema.parse(paginationInput);
    const publicId: PublicId = '550e8400-e29b-41d4-a716-446655440000';
    const single: DataEnvelope<typeof output> = { data: output };
    const meta: PaginationMeta = { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 };
    const paginated: PaginatedEnvelope<typeof output> = {
      data: [output],
      meta: { pagination: meta },
    };
    const problem: ProblemDetails = {
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      code: 'RESOURCE_NOT_FOUND',
      requestId: 'req_123',
    };
    const regReq: RegisterRequest = {
      displayName: 'Jane Doe',
      email: 'jane@example.com',
      password: 'Password123!',
    };
    const regResData: RegisterResponseData = {
      id: publicId,
      displayName: 'Jane Doe',
      email: 'jane@example.com',
      emailVerificationRequired: true,
    };
    const regRes: RegisterResponse = { data: regResData };
    const verifyReq: VerifyEmailRequest = { token: 'sample_token' };
    const verifyResData: VerifyEmailResponseData = {
      verified: true,
      message: 'Verified',
    };
    const verifyRes: VerifyEmailResponse = { data: verifyResData };
    const resendReq: ResendVerificationRequest = { email: 'jane@example.com' };
    const resendResData: ResendVerificationResponseData = {
      accepted: true,
      message: 'Accepted',
    };
    const resendRes: ResendVerificationResponse = { data: resendResData };
    const loginReq: LoginRequest = {
      email: 'jane@example.com',
      password: 'Password123!',
    };
    const loginUser: LoginUser = {
      id: publicId,
      displayName: 'Jane Doe',
      email: 'jane@example.com',
    };
    const loginResData: LoginResponseData = {
      accessToken: 'jwt-token',
      tokenType: 'Bearer',
      expiresIn: 900,
      user: loginUser,
    };
    const loginRes: LoginResponse = { data: loginResData };
    const refreshResData: RefreshResponseData = loginResData;
    const refreshRes: RefreshResponse = { data: refreshResData };
    const logoutResData: LogoutResponseData = { loggedOut: true };
    const logoutRes: LogoutResponse = { data: logoutResData };
    const reqReset: RequestPasswordResetRequest = { email: 'jane@example.com' };
    const reqResetResData: RequestPasswordResetResponseData = {
      accepted: true,
      message: 'Accepted',
    };
    const reqResetRes: RequestPasswordResetResponse = { data: reqResetResData };
    const confirmResetReq: ConfirmPasswordResetRequest = {
      token: 'reset_token',
      newPassword: 'Password123!',
    };
    const confirmResetResData: ConfirmPasswordResetResponseData = {
      reset: true,
      message: 'Reset',
    };
    const confirmResetRes: ConfirmPasswordResetResponse = { data: confirmResetResData };

    expect(output.page).toBe(1);
    expect(paginationOutput.page).toBe(1);
    expect(publicId).toBeDefined();
    expect(single.data.page).toBe(1);
    expect(paginated.data[0]?.page).toBe(1);
    expect(problem.status).toBe(404);
    expect(regReq.displayName).toBe('Jane Doe');
    expect(regResData.emailVerificationRequired).toBe(true);
    expect(regRes.data.id).toBe(publicId);
    expect(verifyReq.token).toBe('sample_token');
    expect(verifyRes.data.verified).toBe(true);
    expect(resendReq.email).toBe('jane@example.com');
    expect(resendRes.data.accepted).toBe(true);
    expect(loginReq.email).toBe('jane@example.com');
    expect(loginRes.data.tokenType).toBe('Bearer');
    expect(refreshRes.data.tokenType).toBe('Bearer');
    expect(logoutRes.data.loggedOut).toBe(true);
    expect(reqReset.email).toBe('jane@example.com');
    expect(reqResetRes.data.accepted).toBe(true);
    expect(confirmResetReq.token).toBe('reset_token');
    expect(confirmResetRes.data.reset).toBe(true);

    expect(EMPLOYER_STATUS_VALUES).toContain('ACTIVE');
    expect(VERIFICATION_STATUS_VALUES).toContain('UNVERIFIED');
    expect(employerStatusSchema).toBeDefined();
    expect(verificationStatusSchema).toBeDefined();
    expect(createIndividualEmployerAccountRequestSchema).toBeDefined();
    expect(updateIndividualEmployerProfileRequestSchema).toBeDefined();
    expect(individualEmployerProfileDtoSchema).toBeDefined();
    expect(individualEmployerAccountDtoSchema).toBeDefined();
    expect(createIndividualEmployerAccountResponseEnvelopeSchema).toBeDefined();
    expect(getIndividualEmployerAccountResponseEnvelopeSchema).toBeDefined();
    expect(updateIndividualEmployerProfileResponseEnvelopeSchema).toBeDefined();

    const empStatus: EmployerAccountStatus = 'ACTIVE';
    const empVerif: EmployerVerificationStatus = 'UNVERIFIED';
    const empCreateReq: CreateIndividualEmployerAccountRequest = { publicName: 'Solo Studio' };
    const empPatchReq: UpdateIndividualEmployerProfileRequest = { publicName: 'Updated Studio' };
    const empProfile: IndividualEmployerProfileDto = {
      publicName: 'Solo Studio',
      contactPhone: null,
      countryCode: 'ET',
      city: 'Addis Ababa',
      updatedAt: '2026-11-27T14:00:00.000Z',
    };
    const empDto: IndividualEmployerAccountDto = {
      id: publicId,
      type: 'INDIVIDUAL',
      status: empStatus,
      verificationStatus: empVerif,
      createdAt: '2026-11-27T14:00:00.000Z',
      updatedAt: '2026-11-27T14:00:00.000Z',
      profile: empProfile,
    };
    const empCreateRes: CreateIndividualEmployerAccountResponse = { data: empDto };
    const empGetRes: GetIndividualEmployerAccountResponse = { data: empDto };
    const empPatchRes: UpdateIndividualEmployerProfileResponse = { data: empDto };
    expect(empCreateReq.publicName).toBe('Solo Studio');
    expect(empPatchReq.publicName).toBe('Updated Studio');
    expect(empCreateRes.data.id).toBe(publicId);
    expect(empGetRes.data.type).toBe('INDIVIDUAL');
    expect(empPatchRes.data.status).toBe('ACTIVE');
  });
});
