import { describe, it, expect } from 'vitest';
import {
  jobSearchQuerySchema,
  countryCodeSchema,
  JOB_SEARCH_SORT_VALUES,
  type JobSearchQueryInput,
  type JobSearchQueryOutput,
} from './job-search.js';

describe('countryCodeSchema', () => {
  it('normalizes lowercase 2-letter codes to uppercase', () => {
    expect(countryCodeSchema.parse('et')).toBe('ET');
    expect(countryCodeSchema.parse('us')).toBe('US');
  });

  it('accepts uppercase 2-letter codes', () => {
    expect(countryCodeSchema.parse('ET')).toBe('ET');
    expect(countryCodeSchema.parse('DE')).toBe('DE');
  });

  it('rejects non-2-letter strings and numbers', () => {
    expect(() => countryCodeSchema.parse('USA')).toThrow();
    expect(() => countryCodeSchema.parse('E')).toThrow();
    expect(() => countryCodeSchema.parse('12')).toThrow();
    expect(() => countryCodeSchema.parse('')).toThrow();
  });
});

describe('jobSearchQuerySchema', () => {
  const sampleUuid1 = '550e8400-e29b-41d4-a716-446655440000';
  const sampleUuid2 = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

  it('applies default pagination values for empty query input', () => {
    const rawInput: JobSearchQueryInput = {};
    const parsed: JobSearchQueryOutput = jobSearchQuerySchema.parse(rawInput);

    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(20);
    expect(parsed.q).toBeUndefined();
    expect(parsed.countryCode).toBeUndefined();
    expect(parsed.city).toBeUndefined();
    expect(parsed.categoryId).toBeUndefined();
    expect(parsed.skillId).toBeUndefined();
    expect(parsed.sort).toBeUndefined();
  });

  it('parses and normalizes a fully populated valid query input', () => {
    const rawInput: JobSearchQueryInput = {
      page: '2',
      pageSize: '50',
      q: '  fullstack engineer  ',
      countryCode: 'et',
      city: 'Addis Ababa',
      categoryId: sampleUuid1,
      skillId: [sampleUuid1, sampleUuid2],
      sort: 'publishedAt:desc',
    };

    const parsed: JobSearchQueryOutput = jobSearchQuerySchema.parse(rawInput);

    expect(parsed).toEqual({
      page: 2,
      pageSize: 50,
      q: 'fullstack engineer',
      countryCode: 'ET',
      city: 'Addis Ababa',
      categoryId: sampleUuid1,
      skillId: [sampleUuid1, sampleUuid2],
      sort: 'publishedAt:desc',
    });
  });

  it('normalizes single string skillId to an array of UUIDs', () => {
    const parsed = jobSearchQuerySchema.parse({
      skillId: sampleUuid1,
    });
    expect(parsed.skillId).toEqual([sampleUuid1]);
  });

  it('preserves array skillId with multiple UUIDs', () => {
    const parsed = jobSearchQuerySchema.parse({
      skillId: [sampleUuid1, sampleUuid2],
    });
    expect(parsed.skillId).toEqual([sampleUuid1, sampleUuid2]);
  });

  it('rejects malformed UUID in single skillId', () => {
    expect(() =>
      jobSearchQuerySchema.parse({
        skillId: 'invalid-uuid-string',
      }),
    ).toThrow();
  });

  it('rejects array skillId containing any malformed UUID', () => {
    expect(() =>
      jobSearchQuerySchema.parse({
        skillId: [sampleUuid1, 'invalid-uuid'],
      }),
    ).toThrow();
  });

  it('rejects malformed categoryId UUID', () => {
    expect(() =>
      jobSearchQuerySchema.parse({
        categoryId: 'not-a-uuid',
      }),
    ).toThrow();
  });

  it('accepts allowlisted sort values', () => {
    for (const sortValue of JOB_SEARCH_SORT_VALUES) {
      const parsed = jobSearchQuerySchema.parse({ sort: sortValue });
      expect(parsed.sort).toBe(sortValue);
    }
  });

  it('rejects arbitrary or unsupported sort strings', () => {
    expect(() =>
      jobSearchQuerySchema.parse({
        sort: 'unsupportedField:asc',
      }),
    ).toThrow();

    expect(() =>
      jobSearchQuerySchema.parse({
        sort: 'DROP TABLE jobs;--',
      }),
    ).toThrow();
  });

  it('rejects unknown query fields (strict validation)', () => {
    expect(() =>
      jobSearchQuerySchema.parse({
        page: 1,
        forbiddenField: 'injected',
      }),
    ).toThrow();
  });
});
