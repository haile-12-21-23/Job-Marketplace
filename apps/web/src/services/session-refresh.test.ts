import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAppStore } from '../app/store.js';
import {
  selectAccessToken,
  selectAuthNotice,
  selectAuthStatus,
  selectCurrentUser,
  selectExpiresAt,
  selectIsAuthenticated,
} from '../app/auth-slice.js';
import { restoreAuthSession } from './session-refresh.js';

describe('restoreAuthSession coordination', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('deduplicates concurrent in-tab refresh requests via shared in-flight promise', async () => {
    let resolveFetch: (res: Response) => void;
    const deferred = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const mockFetch = vi.fn((_input: RequestInfo | URL) => deferred);
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const store = createAppStore();

    const p1 = restoreAuthSession(store.dispatch);
    const p2 = restoreAuthSession(store.dispatch);

    expect(selectAuthStatus(store.getState())).toBe('refreshing');
    await vi.waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    resolveFetch!(
      new Response(
        JSON.stringify({
          data: {
            accessToken: 'restored-jwt-123',
            tokenType: 'Bearer',
            expiresIn: 900,
            user: {
              id: '550e8400-e29b-41d4-a716-446655440000',
              displayName: 'Abebe Bikila',
              email: 'abebe@example.com',
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const [ok1, ok2] = await Promise.all([p1, p2]);
    expect(ok1).toBe(true);
    expect(ok2).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const req = mockFetch.mock.calls[0]![0] as Request;
    expect(req.url).toContain('/auth/refresh');
    expect(req.credentials).toBe('include');

    expect(selectIsAuthenticated(store.getState())).toBe(true);
    expect(selectAuthStatus(store.getState())).toBe('authenticated');
    expect(selectAccessToken(store.getState())).toBe('restored-jwt-123');
    expect(selectCurrentUser(store.getState())?.email).toBe('abebe@example.com');
    expect(selectExpiresAt(store.getState())).toBeGreaterThan(Date.now());
  });

  it('uses Web Locks API when available to coordinate refreshes across tabs', async () => {
    const lockRequestSpy = vi.fn(
      async (_name: string, callback: () => Promise<boolean>): Promise<boolean> => callback(),
    );
    vi.stubGlobal('navigator', {
      ...navigator,
      locks: { request: lockRequestSpy },
    });

    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: {
              accessToken: 'locked-jwt-456',
              tokenType: 'Bearer',
              expiresIn: 900,
              user: {
                id: '550e8400-e29b-41d4-a716-446655440000',
                displayName: 'Abebe Bikila',
                email: 'abebe@example.com',
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );

    const store = createAppStore();
    const ok = await restoreAuthSession(store.dispatch);

    expect(ok).toBe(true);
    expect(lockRequestSpy).toHaveBeenCalledTimes(1);
    expect(lockRequestSpy).toHaveBeenCalledWith('jmp_auth_refresh', expect.any(Function));
    expect(selectAccessToken(store.getState())).toBe('locked-jwt-456');
  });

  it('clears auth cleanly on 401 without error notice, and surfaces notice on transient network/5xx errors', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            type: 'about:blank',
            title: 'Unauthorized',
            status: 401,
            code: 'INVALID_REFRESH_TOKEN',
            detail: 'Invalid or expired session.',
          }),
          { status: 401, headers: { 'Content-Type': 'application/problem+json' } },
        ),
    );

    const store401 = createAppStore();
    const ok401 = await restoreAuthSession(store401.dispatch);
    expect(ok401).toBe(false);
    expect(selectAuthStatus(store401.getState())).toBe('unauthenticated');
    expect(selectAuthNotice(store401.getState())).toBeNull();

    globalThis.fetch = vi.fn(async () => {
      throw new Error('Network offline');
    });

    const storeNetwork = createAppStore();
    const okNetwork = await restoreAuthSession(storeNetwork.dispatch);
    expect(okNetwork).toBe(false);
    expect(selectAuthStatus(storeNetwork.getState())).toBe('unauthenticated');
    expect(selectAuthNotice(storeNetwork.getState())).toEqual({
      message:
        'Unable to verify your session due to a temporary network or server issue. Please sign in again.',
      kind: 'refresh_error',
    });
  });
});
