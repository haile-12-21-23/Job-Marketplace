import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from './router.js';
import { AppProviders } from './providers.js';
import { createAppStore } from './store.js';
import { selectIsAuthenticated, setAuthSession } from './auth-slice.js';

describe('React Router configuration and routes', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: { service: 'Job Marketplace API', version: 'v1', status: 'ok' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
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

    return render(
      <AppProviders storeInstance={store}>
        <RouterProvider router={memoryRouter} />
      </AppProviders>,
    );
  }

  it('renders the public layout and home page for "/"', async () => {
    renderWithRouter('/');

    expect(screen.getByLabelText('Job Marketplace home')).toBeDefined();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Work that moves your life forward.' }),
    ).toBeDefined();
    expect(screen.getByTestId('api-status-card')).toBeDefined();
  });

  it('redirects "/app" to "/login" via UX guard when no in-memory access token exists', async () => {
    renderWithRouter('/app');

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeDefined();
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

    // Click Workspace link in header (first matching link in navigation)
    const workspaceLinks = screen.getAllByRole('link', { name: 'Workspace (App)' });
    expect(workspaceLinks.length).toBeGreaterThan(0);
    await user.click(workspaceLinks[0]!);

    // Verify /app content is rendered
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Candidate & Employer Workspace' }),
    ).toBeDefined();

    // Click Back to Public Site link
    const backLink = screen.getByRole('link', { name: 'Back to Public Site' });
    await user.click(backLink);

    // Verify back on home
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
    });
  });
});
