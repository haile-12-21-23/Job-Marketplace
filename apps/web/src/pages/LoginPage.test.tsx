import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import LoginPage from './LoginPage.js';
import { AppProviders } from '../app/providers.js';
import { createAppStore } from '../app/store.js';
import { selectAccessToken, selectCurrentUser } from '../app/auth-slice.js';

describe('LoginPage', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  function renderLoginPage(initialEntries: string[] = ['/login']) {
    const store = createAppStore();
    const router = createMemoryRouter(
      [
        { path: '/login', element: <LoginPage /> },
        { path: '/app', element: <h1>Workspace Destination</h1> },
      ],
      { initialEntries },
    );

    const rendered = render(
      <AppProviders storeInstance={store}>
        <RouterProvider router={router} />
      </AppProviders>,
    );

    return { store, ...rendered };
  }

  it('validates login inputs inline before calling API', async () => {
    const user = userEvent.setup();
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    renderLoginPage();

    await user.click(screen.getByRole('button', { name: 'Sign In' }));

    expect(screen.getByText('Enter a valid email address')).toBeDefined();
    expect(screen.getByText('Password must be at least 8 characters')).toBeDefined();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('prevents duplicate submit while in-flight, stores access token in memory only, and navigates to /app', async () => {
    const user = userEvent.setup();
    let resolveFetch: (value: Response) => void;
    const deferred = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });

    const mockFetch = vi.fn(() => deferred);
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const { store } = renderLoginPage();

    await user.type(screen.getByLabelText(/email address/i), 'abebe@example.com');
    await user.type(screen.getByLabelText(/password/i), 'CorrectPassword123!');

    const submitBtn = screen.getByRole('button', { name: 'Sign In' });
    await user.click(submitBtn);

    expect(submitBtn.getAttribute('disabled')).toBeDefined();
    expect(screen.getByText('Signing in...')).toBeDefined();

    await user.click(submitBtn);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const fetchCall = mockFetch.mock.calls[0] as unknown as [Request | string, RequestInit?];
    const reqArg = fetchCall[0];
    if (reqArg instanceof Request) {
      expect(reqArg.credentials).toBe('include');
    }

    resolveFetch!(
      new Response(
        JSON.stringify({
          data: {
            accessToken: 'jwt-memory-token-abc',
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
      await screen.findByRole('heading', { level: 1, name: 'Workspace Destination' }),
    ).toBeDefined();

    const state = store.getState();
    expect(selectAccessToken(state)).toBe('jwt-memory-token-abc');
    expect(selectCurrentUser(state)?.email).toBe('abebe@example.com');

    // Never persisted in browser storage
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('displays generic invalid-credentials error on 401 and clears password', async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            type: 'about:blank',
            title: 'Unauthorized',
            status: 401,
            code: 'INVALID_CREDENTIALS',
            detail: 'Invalid email or password.',
          }),
          { status: 401, headers: { 'Content-Type': 'application/problem+json' } },
        ),
    );

    renderLoginPage();

    const emailInput = screen.getByLabelText(/email address/i) as HTMLInputElement;
    const passwordInput = screen.getByLabelText(/password/i) as HTMLInputElement;

    await user.type(emailInput, 'abebe@example.com');
    await user.type(passwordInput, 'WrongPassword123!');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));

    expect(await screen.findByText('Invalid email or password.')).toBeDefined();
    expect(emailInput.value).toBe('abebe@example.com');
    expect(passwordInput.value).toBe('');
  });

  it('displays generic rate-limit banner on 429', async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            type: 'about:blank',
            title: 'Too Many Requests',
            status: 429,
            code: 'RATE_LIMIT_EXCEEDED',
            detail: 'Too many login attempts. Please try again later.',
          }),
          { status: 429, headers: { 'Content-Type': 'application/problem+json' } },
        ),
    );

    renderLoginPage();

    await user.type(screen.getByLabelText(/email address/i), 'abebe@example.com');
    await user.type(screen.getByLabelText(/password/i), 'CorrectPassword123!');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => {
      expect(screen.getByText('Too many login attempts. Please try again later.')).toBeDefined();
    });
  });
});
