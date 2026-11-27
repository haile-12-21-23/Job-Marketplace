import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import ForgotPasswordPage from './ForgotPasswordPage.js';
import { AppProviders } from '../app/providers.js';
import { createAppStore } from '../app/store.js';

describe('ForgotPasswordPage', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function renderForgotPage() {
    const store = createAppStore();
    const router = createMemoryRouter(
      [
        { path: '/forgot-password', element: <ForgotPasswordPage /> },
        { path: '/login', element: <h1>Sign in</h1> },
      ],
      { initialEntries: ['/forgot-password'] },
    );

    return render(
      <AppProviders storeInstance={store}>
        <RouterProvider router={router} />
      </AppProviders>,
    );
  }

  it('validates email inline before calling API', async () => {
    const user = userEvent.setup();
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    renderForgotPage();

    await user.click(screen.getByRole('button', { name: 'Send Reset Instructions' }));

    expect(screen.getByText('Enter a valid email address')).toBeDefined();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('prevents duplicate submit while in-flight and displays generic anti-enumeration success message', async () => {
    const user = userEvent.setup();
    let resolveFetch: (res: Response) => void;
    const deferred = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const mockFetch = vi.fn((_input: RequestInfo | URL) => deferred);
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    renderForgotPage();

    const emailInput = screen.getByLabelText(/email address/i) as HTMLInputElement;
    await user.type(emailInput, 'abebe@example.com');

    const submitBtn = screen.getByRole('button', { name: 'Send Reset Instructions' });
    await user.click(submitBtn);
    expect(screen.getByText('Sending reset instructions...')).toBeDefined();

    await user.click(submitBtn);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    resolveFetch!(
      new Response(
        JSON.stringify({
          data: {
            accepted: true,
            message:
              'If an account matches that email address, password reset instructions will be sent.',
          },
        }),
        { status: 202, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        'If an account matches that email address, password reset instructions will be sent.',
      );
    });
    expect(emailInput.value).toBe('');
    expect(screen.getByRole('link', { name: 'Back to Sign in' }).getAttribute('href')).toBe(
      '/login',
    );
  });

  it('displays rate-limit error banner on 429', async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            type: 'about:blank',
            title: 'Too Many Requests',
            status: 429,
            code: 'RATE_LIMIT_EXCEEDED',
            detail: 'Too many password reset requests. Please try again later.',
          }),
          { status: 429, headers: { 'Content-Type': 'application/problem+json' } },
        ),
    );

    renderForgotPage();

    await user.type(screen.getByLabelText(/email address/i), 'abebe@example.com');
    await user.click(screen.getByRole('button', { name: 'Send Reset Instructions' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many password reset requests. Please try again later.',
    );
  });
});
