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

    expect(output.page).toBe(1);
    expect(paginationOutput.page).toBe(1);
    expect(publicId).toBeDefined();
    expect(single.data.page).toBe(1);
    expect(paginated.data[0]?.page).toBe(1);
    expect(problem.status).toBe(404);
    expect(regReq.displayName).toBe('Jane Doe');
    expect(regResData.emailVerificationRequired).toBe(true);
    expect(regRes.data.id).toBe(publicId);
  });
});
