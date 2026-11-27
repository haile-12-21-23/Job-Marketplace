import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from './router.js';
import { AppProviders } from './providers.js';
import { createAppStore } from './store.js';
import {
  selectAccessToken,
  selectAuthStatus,
  selectIsAuthenticated,
  setAuthSession,
} from './auth-slice.js';

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof Request) return input.url;
  return input.toString();
}

describe('React Router configuration and routes', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    localStorage.clear();
    sessionStorage.clear();

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.endsWith('/auth/refresh')) {
        return new Response(
          JSON.stringify({
            type: 'about:blank',
            title: 'Unauthorized',
            status: 401,
            code: 'INVALID_REFRESH_TOKEN',
            detail: 'Invalid or expired session.',
          }),
          { status: 401, headers: { 'Content-Type': 'application/problem+json' } },
        );
      }

      return new Response(
        JSON.stringify({
          data: { service: 'Job Marketplace API', version: 'v1', status: 'ok' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  function renderWithRouter(initialEntry: string, authenticated = false) {
    const memoryRouter = createMemoryRouter(routes, {
      initialEntries: [initialEntry],
    });
    const store = createAppStore();
    if (authenticated) {
      store.dispatch(
        setAuthSession({
          accessToken: 'in-memory-jwt',
          expiresIn: 900,
          user: {
            id: '550e8400-e29b-41d4-a716-446655440000',
            displayName: 'Abebe',
            email: 'abebe@example.com',
          },
        }),
      );
    }

    const rendered = render(
      <AppProviders storeInstance={store}>
        <RouterProvider router={memoryRouter} />
      </AppProviders>,
    );

    return { store, ...rendered };
  }

  it('renders the public layout and home page for "/"', async () => {
    renderWithRouter('/');

    expect(screen.getByLabelText('Job Marketplace home')).toBeDefined();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Work that moves your life forward.' }),
    ).toBeDefined();
    expect(screen.getByTestId('api-status-card')).toBeDefined();
  });

  it('attempts one refresh on "/app" reload and redirects to "/login" when refresh fails', async () => {
    const { store } = renderWithRouter('/app');

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeDefined();
    expect(selectAuthStatus(store.getState())).toBe('unauthenticated');
    expect(selectIsAuthenticated(store.getState())).toBe(false);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const calledReq = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Request;
    expect(calledReq.url).toContain('/auth/refresh');
  });

  it('shows loading state while refresh is in-flight, restores auth on success, and avoids premature redirect', async () => {
    let resolveRefresh: (res: Response) => void;
    const deferred = new Promise<Response>((resolve) => {
      resolveRefresh = resolve;
    });
    const mockFetch = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.endsWith('/auth/refresh')) {
        return deferred;
      }
      return Promise.resolve(
        new Response(JSON.stringify({ data: {} }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const { store } = renderWithRouter('/app');

    expect(screen.getByRole('status')).toHaveTextContent('Checking your session...');
    expect(screen.queryByRole('heading', { level: 1, name: 'Sign in' })).toBeNull();

    resolveRefresh!(
      new Response(
        JSON.stringify({
          data: {
            accessToken: 'restored-on-reload-jwt',
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

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Candidate & Employer Workspace' }),
    ).toBeDefined();
    expect(selectAccessToken(store.getState())).toBe('restored-on-reload-jwt');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('handles transient refresh failure without an infinite loop and surfaces notice on "/login"', async () => {
    const mockFetch = vi.fn(async () => {
      throw new Error('503 upstream');
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const { store } = renderWithRouter('/app');

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeDefined();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(selectAuthStatus(store.getState())).toBe('unauthenticated');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Unable to verify your session due to a temporary network or server issue.',
    );
  });

  it('renders the authenticated workspace for "/app" when an in-memory access token exists', async () => {
    renderWithRouter('/app', true);

    expect(screen.getByRole('region', { name: 'Placeholder notice' })).toHaveTextContent(
      'Authenticated Area Placeholder',
    );
    expect(
      screen.getByRole('heading', { level: 1, name: 'Candidate & Employer Workspace' }),
    ).toBeDefined();
    expect(screen.getByText('Back to Public Site')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeDefined();
  });

  it('logs out via POST /auth/logout, clears in-memory auth state, and redirects to "/login"', async () => {
    const user = userEvent.setup();
    const mockFetch = vi.fn(async (_input: RequestInfo | URL) => {
      return new Response(JSON.stringify({ data: { loggedOut: true } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const { store } = renderWithRouter('/app', true);

    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeDefined();
    expect(selectIsAuthenticated(store.getState())).toBe(false);
    expect(selectAccessToken(store.getState())).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const req = mockFetch.mock.calls[0]![0] as Request;
    expect(req.url).toContain('/auth/logout');
    expect(req.method).toBe('POST');
    expect(req.credentials).toBe('include');
  });

  it('clears local auth state and surfaces retryable failure notice when server logout fails', async () => {
    const user = userEvent.setup();
    let failLogout = true;
    const mockFetch = vi.fn(async () => {
      if (failLogout) {
        return new Response(JSON.stringify({ status: 500, detail: 'Down' }), {
          status: 500,
          headers: { 'Content-Type': 'application/problem+json' },
        });
      }
      return new Response(JSON.stringify({ data: { loggedOut: true } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const { store } = renderWithRouter('/app', true);

    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeDefined();
    expect(selectIsAuthenticated(store.getState())).toBe(false);
    expect(selectAccessToken(store.getState())).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Your local session was cleared, but we could not confirm server sign-out.',
    );

    failLogout = false;
    await user.click(screen.getByRole('button', { name: 'Retry server sign-out' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Your server session has been revoked.');
    });
  });

  it('renders NotFoundPage for unknown routes', async () => {
    renderWithRouter('/this-does-not-exist');

    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeDefined();
    expect(screen.getByText('Return to home')).toBeDefined();
  });

  it('allows authenticated navigation from public home to /app and back', async () => {
    const user = userEvent.setup();
    const memoryRouter = createMemoryRouter(routes, {
      initialEntries: ['/'],
    });
    const store = createAppStore();
    store.dispatch(
      setAuthSession({
        accessToken: 'in-memory-jwt',
        expiresIn: 900,
        user: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          displayName: 'Abebe',
          email: 'abebe@example.com',
        },
      }),
    );

    render(
      <AppProviders storeInstance={store}>
        <RouterProvider router={memoryRouter} />
      </AppProviders>,
    );

    const workspaceLinks = screen.getAllByRole('link', { name: 'Workspace (App)' });
    expect(workspaceLinks.length).toBeGreaterThan(0);
    await user.click(workspaceLinks[0]!);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Candidate & Employer Workspace' }),
    ).toBeDefined();

    const backLink = screen.getByRole('link', { name: 'Back to Public Site' });
    await user.click(backLink);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Work that moves your life forward.' }),
    ).toBeDefined();
  });

  it('renders the login page for "/login"', async () => {
    renderWithRouter('/login');

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeDefined();
    expect(screen.getByLabelText(/email address/i)).toBeDefined();
    expect(screen.getByLabelText(/password/i)).toBeDefined();
  });

  it('renders the registration page for "/register"', async () => {
    renderWithRouter('/register');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Create your account' }),
    ).toBeDefined();
    expect(screen.getByLabelText(/full name/i)).toBeDefined();
    expect(screen.getByLabelText(/email address/i)).toBeDefined();
    expect(screen.getByLabelText(/password/i)).toBeDefined();
  });

  it('renders the email verification page for "/verify-email"', async () => {
    renderWithRouter('/verify-email');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Verify your email address' }),
    ).toBeDefined();
    expect(screen.getByLabelText(/email address/i)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Send Verification Email' })).toBeDefined();
  });

  it('redirects "/app" to "/login" and clears in-memory auth state when the access token has expired', async () => {
    const expiredAt = Date.now() - 1000;
    const store = createAppStore({
      auth: {
        accessToken: 'stale-expired-jwt',
        expiresIn: 900,
        expiresAt: expiredAt,
        user: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          displayName: 'Abebe',
          email: 'abebe@example.com',
        },
        status: 'authenticated',
        authNotice: null,
        authNoticeKind: null,
      },
    });
    const memoryRouter = createMemoryRouter(routes, {
      initialEntries: ['/app'],
    });

    render(
      <AppProviders storeInstance={store}>
        <RouterProvider router={memoryRouter} />
      </AppProviders>,
    );

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeDefined();
    expect(selectIsAuthenticated(store.getState())).toBe(false);
    expect(store.getState().auth).toEqual({
      accessToken: null,
      expiresIn: null,
      expiresAt: null,
      user: null,
      status: 'unauthenticated',
      authNotice: null,
      authNoticeKind: null,
    });
  });

  it('redirects active "/app" session to "/login" and clears auth state once the token expires', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-27T09:00:00.000Z'));

    const store = createAppStore();
    store.dispatch(
      setAuthSession({
        accessToken: 'active-jwt',
        expiresIn: 900,
        user: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          displayName: 'Abebe',
          email: 'abebe@example.com',
        },
      }),
    );

    const memoryRouter = createMemoryRouter(routes, {
      initialEntries: ['/app'],
    });

    render(
      <AppProviders storeInstance={store}>
        <RouterProvider router={memoryRouter} />
      </AppProviders>,
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'Candidate & Employer Workspace' }),
    ).toBeDefined();

    act(() => {
      vi.advanceTimersByTime(900_000);
    });

    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeDefined();
    expect(store.getState().auth).toEqual({
      accessToken: null,
      expiresIn: null,
      expiresAt: null,
      user: null,
      status: 'unauthenticated',
      authNotice: null,
      authNoticeKind: null,
    });
  });
});
