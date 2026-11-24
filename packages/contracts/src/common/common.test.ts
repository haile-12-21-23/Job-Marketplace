import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { publicIdSchema } from './identifiers.js';
import { paginationQuerySchema, paginationMetaSchema } from './pagination.js';
import {
  createDataEnvelopeSchema,
  createPaginatedEnvelopeSchema,
  createSingleResourceResponseSchema,
  createCollectionResponseSchema,
} from './envelopes.js';
import { problemDetailsSchema } from './problem-details.js';

describe('publicIdSchema', () => {
  it('accepts valid UUID strings', () => {
    const validUuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(publicIdSchema.parse(validUuid)).toBe(validUuid);
  });

  it('rejects sequential integer IDs and malformed strings', () => {
    expect(() => publicIdSchema.parse(123)).toThrow();
    expect(() => publicIdSchema.parse('not-a-uuid')).toThrow();
    expect(() => publicIdSchema.parse('1')).toThrow();
    expect(() => publicIdSchema.parse('')).toThrow();
  });
});

describe('paginationQuerySchema', () => {
  it('applies default page=1 and pageSize=20 when empty object provided', () => {
    const parsed = paginationQuerySchema.parse({});
    expect(parsed).toEqual({
      page: 1,
      pageSize: 20,
    });
  });

  it('coerces valid string integers to numbers', () => {
    const parsed = paginationQuerySchema.parse({
      page: '3',
      pageSize: '50',
    });
    expect(parsed.page).toBe(3);
    expect(parsed.pageSize).toBe(50);
  });

  it('accepts valid numeric page and pageSize bounds', () => {
    const parsed = paginationQuerySchema.parse({
      page: 1,
      pageSize: 100,
    });
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(100);
  });

  it('rejects zero, negative, or non-integer page values', () => {
    expect(() => paginationQuerySchema.parse({ page: 0 })).toThrow();
    expect(() => paginationQuerySchema.parse({ page: -1 })).toThrow();
    expect(() => paginationQuerySchema.parse({ page: '0' })).toThrow();
    expect(() => paginationQuerySchema.parse({ page: '-5' })).toThrow();
    expect(() => paginationQuerySchema.parse({ page: 1.5 })).toThrow();
    expect(() => paginationQuerySchema.parse({ page: '1.5' })).toThrow();
    expect(() => paginationQuerySchema.parse({ page: 'abc' })).toThrow();
  });

  it('rejects zero, negative, non-integer, or pageSize > 100', () => {
    expect(() => paginationQuerySchema.parse({ pageSize: 0 })).toThrow();
    expect(() => paginationQuerySchema.parse({ pageSize: -10 })).toThrow();
    expect(() => paginationQuerySchema.parse({ pageSize: 101 })).toThrow();
    expect(() => paginationQuerySchema.parse({ pageSize: '101' })).toThrow();
    expect(() => paginationQuerySchema.parse({ pageSize: 25.5 })).toThrow();
  });

  it('trims search query and accepts phrases up to 120 characters', () => {
    const parsed = paginationQuerySchema.parse({
      q: '   software engineer   ',
    });
    expect(parsed.q).toBe('software engineer');

    const exact120 = 'a'.repeat(120);
    expect(paginationQuerySchema.parse({ q: exact120 }).q).toBe(exact120);
  });

  it('rejects search phrase longer than 120 characters', () => {
    const tooLong = 'a'.repeat(121);
    expect(() => paginationQuerySchema.parse({ q: tooLong })).toThrow();
  });

  it('rejects unknown query properties (strict)', () => {
    expect(() =>
      paginationQuerySchema.parse({
        page: 1,
        unknownFilter: 'malicious',
      }),
    ).toThrow();
  });
});

describe('paginationMetaSchema', () => {
  it('validates empty/zero result collections', () => {
    const emptyMeta = {
      page: 1,
      pageSize: 20,
      totalItems: 0,
      totalPages: 0,
    };
    expect(paginationMetaSchema.parse(emptyMeta)).toEqual(emptyMeta);
  });

  it('validates normal non-empty result sets', () => {
    const normalMeta = {
      page: 2,
      pageSize: 20,
      totalItems: 125,
      totalPages: 7,
    };
    expect(paginationMetaSchema.parse(normalMeta)).toEqual(normalMeta);
  });

  it('rejects negative numbers or floats', () => {
    expect(() =>
      paginationMetaSchema.parse({
        page: 1,
        pageSize: 20,
        totalItems: -1,
        totalPages: 0,
      }),
    ).toThrow();

    expect(() =>
      paginationMetaSchema.parse({
        page: 1.5,
        pageSize: 20,
        totalItems: 10,
        totalPages: 1,
      }),
    ).toThrow();
  });
});

describe('Envelope factories', () => {
  const itemSchema = z.object({
    id: z.string().uuid(),
    title: z.string(),
  });

  it('creates single resource response envelope { data: T }', () => {
    const singleSchema = createDataEnvelopeSchema(itemSchema);
    const validData = {
      data: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        title: 'Senior TypeScript Engineer',
      },
    };
    expect(singleSchema.parse(validData)).toEqual(validData);

    // Alias verification
    const aliasSchema = createSingleResourceResponseSchema(itemSchema);
    expect(aliasSchema.parse(validData)).toEqual(validData);
  });

  it('creates paginated collection response envelope { data: T[], meta: { pagination } }', () => {
    const collectionSchema = createPaginatedEnvelopeSchema(itemSchema);
    const validCollection = {
      data: [
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          title: 'Senior TypeScript Engineer',
        },
      ],
      meta: {
        pagination: {
          page: 1,
          pageSize: 20,
          totalItems: 1,
          totalPages: 1,
        },
      },
    };
    expect(collectionSchema.parse(validCollection)).toEqual(validCollection);

    // Alias verification
    const aliasSchema = createCollectionResponseSchema(itemSchema);
    expect(aliasSchema.parse(validCollection)).toEqual(validCollection);
  });

  it('rejects collection envelope missing meta.pagination', () => {
    const collectionSchema = createPaginatedEnvelopeSchema(itemSchema);
    expect(() =>
      collectionSchema.parse({
        data: [],
      }),
    ).toThrow();
  });
});

describe('problemDetailsSchema (RFC 9457)', () => {
  it('validates complete problem details with field errors', () => {
    const problem = {
      type: 'https://api.example.com/problems/validation-error',
      title: 'Request validation failed',
      status: 422,
      detail: 'One or more fields are invalid.',
      instance: '/api/v1/jobs',
      code: 'VALIDATION_ERROR',
      requestId: 'req_01JABCDEF1234567890',
      errors: [
        {
          pointer: '#/countryCode',
          code: 'INVALID_FORMAT',
          detail: 'Country code must be a 2-letter ISO 3166-1 alpha-2 code',
        },
      ],
    };
    expect(problemDetailsSchema.parse(problem)).toEqual(problem);
  });

  it('validates minimal problem details without optional fields', () => {
    const minimal = {
      type: 'about:blank',
      title: 'Unauthorized',
      status: 401,
      code: 'AUTHENTICATION_REQUIRED',
      requestId: 'req_12345',
    };
    expect(problemDetailsSchema.parse(minimal)).toEqual(minimal);
  });

  it('rejects problem details missing required code or requestId', () => {
    expect(() =>
      problemDetailsSchema.parse({
        type: 'about:blank',
        title: 'Error',
        status: 400,
        // missing code and requestId
      }),
    ).toThrow();
  });
});
