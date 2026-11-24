import { describe, it, expect } from 'vitest';
import {
  jobSearchQuerySchema,
  type JobSearchQueryInput,
  type JobSearchQueryOutput,
} from '@jmp/contracts';

describe('@jmp/api -> @jmp/contracts integration', () => {
  const sampleUuid1 = '550e8400-e29b-41d4-a716-446655440000';
  const sampleUuid2 = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

  it('validates a simulated Express req.query with default pagination', () => {
    // Simulated Express req.query where all values are initially strings or undefined
    const rawReqQuery: JobSearchQueryInput = {};
    const parsed: JobSearchQueryOutput = jobSearchQuerySchema.parse(rawReqQuery);

    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(20);
    expect(parsed.q).toBeUndefined();
  });

  it('normalizes single and repeated skillId query parameters', () => {
    // Single query parameter ?skillId=uuid1 -> Express presents as string
    const singleQuery: JobSearchQueryInput = {
      skillId: sampleUuid1,
    };
    const parsedSingle = jobSearchQuerySchema.parse(singleQuery);
    expect(parsedSingle.skillId).toEqual([sampleUuid1]);

    // Repeated query parameter ?skillId=uuid1&skillId=uuid2 -> Express presents as string[]
    const multiQuery: JobSearchQueryInput = {
      skillId: [sampleUuid1, sampleUuid2],
    };
    const parsedMulti = jobSearchQuerySchema.parse(multiQuery);
    expect(parsedMulti.skillId).toEqual([sampleUuid1, sampleUuid2]);
  });

  it('rejects malformed UUID in categoryId and skillId', () => {
    expect(() => jobSearchQuerySchema.parse({ categoryId: 'not-a-valid-uuid' })).toThrow();

    expect(() => jobSearchQuerySchema.parse({ skillId: 'not-a-valid-uuid' })).toThrow();
  });

  it('enforces page and pageSize bounds', () => {
    expect(() => jobSearchQuerySchema.parse({ page: '0' })).toThrow();
    expect(() => jobSearchQuerySchema.parse({ page: '-1' })).toThrow();
    expect(() => jobSearchQuerySchema.parse({ pageSize: '101' })).toThrow();
  });

  it('rejects unknown query properties to prevent parameter pollution', () => {
    expect(() =>
      jobSearchQuerySchema.parse({
        page: '1',
        unsupportedProperty: 'malicious',
      }),
    ).toThrow();
  });

  it('normalizes countryCode to uppercase', () => {
    const parsed = jobSearchQuerySchema.parse({ countryCode: 'et' });
    expect(parsed.countryCode).toBe('ET');
  });
});
