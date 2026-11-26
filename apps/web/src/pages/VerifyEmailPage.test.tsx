import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import VerifyEmailPage from './VerifyEmailPage.js';
import { AppProviders } from '../app/providers.js';
import { createAppStore } from '../app/store.js';

describe('VerifyEmailPage', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function renderVerifyPage(initialEntry = '/verify-email') {
    const store = createAppStore();
    return render(
      <AppProviders storeInstance={store}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <VerifyEmailPage />
        </MemoryRouter>
      </AppProviders>,
    );
  }

  it('submits token from URL, renders loading then verified success state', async () => {
    let resolveFetch: (value: Response) => void;
    const deferred = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });

    const mockFetch = vi.fn(() => deferred);
    globalThis.fetch = mockFetch;

    renderVerifyPage('/verify-email?token=valid-raw-token-123');

    expect(screen.getByRole('heading', { level: 1, name: 'Verifying your email' })).toBeDefined();
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    resolveFetch!(
      new Response(
        JSON.stringify({
          data: {
            verified: true,
            message: 'Your email address has been verified.',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    expect(await screen.findByRole('heading', { level: 1, name: 'Email verified' })).toBeDefined();
    expect(screen.getByText('Your email address has been verified.')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Back to Home' })).toBeDefined();
  });

  it('shows invalid/expired-token state and resend form when verification fails with 400', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            type: 'about:blank',
            title: 'Bad Request',
            status: 400,
            code: 'INVALID_OR_EXPIRED_VERIFICATION_TOKEN',
            detail:
              'This verification link is invalid or has expired. Please request a new verification email.',
          }),
          { status: 400, headers: { 'Content-Type': 'application/problem+json' } },
        ),
    );

    renderVerifyPage('/verify-email?token=expired-token');

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Verification link invalid or expired',
      }),
    ).toBeDefined();
    expect(screen.getByLabelText(/email address/i)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Send Verification Email' })).toBeDefined();
  });

  it('shows unexpected-error state with retry action on server error and allows retrying', async () => {
    const user = userEvent.setup();
    const mockFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            type: 'about:blank',
            title: 'Internal Server Error',
            status: 500,
            code: 'INTERNAL_SERVER_ERROR',
            detail: 'An unexpected error occurred. Please try again later.',
          }),
          { status: 500, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              verified: true,
              message: 'Your email address has been verified.',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

    globalThis.fetch = mockFetch;

    renderVerifyPage('/verify-email?token=retry-token');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Unable to verify email' }),
    ).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Email verified' })).toBeDefined();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('validates resend form and displays generic response on submit', async () => {
    const user = userEvent.setup();
    const mockFetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: {
              accepted: true,
              message:
                'If an unverified account exists for that email address, a verification email has been sent.',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    globalThis.fetch = mockFetch;

    renderVerifyPage('/verify-email');

    expect(
      screen.getByRole('heading', { level: 1, name: 'Verify your email address' }),
    ).toBeDefined();

    const submitBtn = screen.getByRole('button', { name: 'Send Verification Email' });
    await user.click(submitBtn);
    expect(screen.getByText('Enter a valid email address')).toBeDefined();
    expect(mockFetch).not.toHaveBeenCalled();

    const emailInput = screen.getByLabelText(/email address/i) as HTMLInputElement;
    await user.type(emailInput, 'unknown@example.com');
    await user.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText(
          'If an unverified account exists for that email address, a verification email has been sent.',
        ),
      ).toBeDefined();
    });
    expect(emailInput.value).toBe('');
  });

  it('displays rate-limit error banner when resend returns 429', async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            type: 'about:blank',
            title: 'Too Many Requests',
            status: 429,
            code: 'RATE_LIMIT_EXCEEDED',
            detail: 'Too many verification email requests. Please try again later.',
          }),
          { status: 429, headers: { 'Content-Type': 'application/problem+json' } },
        ),
    );

    renderVerifyPage('/verify-email');

    await user.type(screen.getByLabelText(/email address/i), 'user@example.com');
    await user.click(screen.getByRole('button', { name: 'Send Verification Email' }));

    expect(
      await screen.findByText('Too many verification email requests. Please try again later.'),
    ).toBeDefined();
  });
});
