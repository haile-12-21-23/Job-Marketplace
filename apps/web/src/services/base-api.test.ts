import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getApiBaseUrl, baseApi } from './base-api.js';
import { createAppStore } from '../app/store.js';

describe('baseApi & getApiBaseUrl', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('normalizes base URL with trailing slashes stripped', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000/api/v1///');
    expect(getApiBaseUrl()).toBe('http://localhost:3000/api/v1');
  });

  it('falls back to default development URL when VITE_API_BASE_URL is not set', () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    expect(getApiBaseUrl()).toBe('http://localhost:3000/api/v1');
  });

  it('targets /api/v1 exactly once without path duplication', async () => {
    let capturedUrl = '';
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      capturedUrl =
        typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString();
      return new Response(
        JSON.stringify({
          data: { service: 'Job Marketplace API', version: 'v1', status: 'ok' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    globalThis.fetch = mockFetch;

    const store = createAppStore();
    const result = await store.dispatch(baseApi.endpoints.getServiceStatus.initiate());

    expect(capturedUrl).toBe('http://localhost:3000/api/v1');
    expect(capturedUrl).not.toContain('/api/v1/api/v1');
    expect(result.data).toEqual({
      data: { service: 'Job Marketplace API', version: 'v1', status: 'ok' },
    });
  });
});
