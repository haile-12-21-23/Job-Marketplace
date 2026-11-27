import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getApiBaseUrl, baseApi } from './base-api.js';
import { createAppStore } from '../app/store.js';
import { setAuthSession } from '../app/auth-slice.js';

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

  it('includes credentials and attaches Bearer access token from in-memory auth state', async () => {
    let capturedAuthHeader: string | null = null;
    let capturedCredentials: RequestCredentials | undefined;

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input instanceof Request) {
        capturedAuthHeader = input.headers.get('Authorization');
        capturedCredentials = input.credentials;
      } else {
        const headers = new Headers(init?.headers);
        capturedAuthHeader = headers.get('Authorization');
        capturedCredentials = init?.credentials;
      }

      return new Response(
        JSON.stringify({
          data: { service: 'Job Marketplace API', version: 'v1', status: 'ok' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const store = createAppStore();
    store.dispatch(
      setAuthSession({
        accessToken: 'in-memory-jwt-token',
        expiresIn: 900,
        user: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          displayName: 'Abebe',
          email: 'abebe@example.com',
        },
      }),
    );

    await store.dispatch(baseApi.endpoints.getServiceStatus.initiate());

    expect(capturedCredentials).toBe('include');
    expect(capturedAuthHeader).toBe('Bearer in-memory-jwt-token');
  });

  it('clears expired in-memory auth state and omits Authorization header when token has expired', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    let capturedAuthHeader: string | null = 'unexpected';

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input instanceof Request) {
        capturedAuthHeader = input.headers.get('Authorization');
      } else {
        capturedAuthHeader = new Headers(init?.headers).get('Authorization');
      }

      return new Response(
        JSON.stringify({
          data: { service: 'Job Marketplace API', version: 'v1', status: 'ok' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const store = createAppStore();
    store.dispatch(
      setAuthSession({
        accessToken: 'expired-jwt-token',
        expiresIn: 900,
        user: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          displayName: 'Abebe',
          email: 'abebe@example.com',
        },
      }),
    );

    // Advance Date.now past the 15-minute expiry without relying on timers
    nowSpy.mockReturnValue(1_700_000_000_000 + 900_000);

    await store.dispatch(baseApi.endpoints.getServiceStatus.initiate());

    expect(capturedAuthHeader).toBeNull();
    expect(store.getState().auth).toEqual({
      accessToken: null,
      expiresIn: null,
      expiresAt: null,
      user: null,
    });
  });
});
