import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import ResetPasswordPage from './ResetPasswordPage.js';
import { AppProviders } from '../app/providers.js';
import { createAppStore } from '../app/store.js';
import { selectIsAuthenticated } from '../app/auth-slice.js';
import indexHtml from '../../index.html?raw';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{`${location.pathname}${location.search}`}</div>;
}

describe('ResetPasswordPage', () => {
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

  function renderResetPage(initialEntry = '/reset-password?token=raw-reset-token-123') {
    const store = createAppStore();
    const rendered = render(
      <AppProviders storeInstance={store}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <ResetPasswordPage />
          <LocationProbe />
        </MemoryRouter>
      </AppProviders>,
    );
    return { store, ...rendered };
  }

  it('captures token, removes it from URL immediately, sets no-referrer, validates mismatch, and sends only token and newPassword', async () => {
    const user = userEvent.setup();
    const mockFetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: {
              reset: true,
              message: 'Your password has been reset. You can now sign in with your new password.',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const { store } = renderResetPage('/reset-password?token=raw-reset-token-123&source=email');

    expect(document.querySelector('meta[name="referrer"]')?.getAttribute('content')).toBe(
      'no-referrer',
    );
    await waitFor(() => {
      expect(screen.getByTestId('location-probe').textContent).toBe('/reset-password?source=email');
    });

    // Policy & mismatch validation
    await user.type(screen.getByLabelText('New Password'), 'short');
    await user.type(screen.getByLabelText('Confirm New Password'), 'different');
    await user.click(screen.getByRole('button', { name: 'Reset Password' }));

    expect(screen.getByText('Password must be at least 8 characters')).toBeDefined();
    expect(screen.getByText('Passwords do not match')).toBeDefined();
    expect(mockFetch).not.toHaveBeenCalled();

    // Valid submit
    await user.clear(screen.getByLabelText('New Password'));
    await user.clear(screen.getByLabelText('Confirm New Password'));
    await user.type(screen.getByLabelText('New Password'), 'NewStrongPassword123!');
    await user.type(screen.getByLabelText('Confirm New Password'), 'NewStrongPassword123!');
    await user.click(screen.getByRole('button', { name: 'Reset Password' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Password reset complete' }),
    ).toBeDefined();
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/login');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const fetchCall = mockFetch.mock.calls[0] as unknown as [Request | string, RequestInit?];
    const reqArg = fetchCall[0];
    const submittedBody =
      reqArg instanceof Request ? await reqArg.clone().text() : String(fetchCall[1]?.body ?? '');
    expect(JSON.parse(submittedBody)).toEqual({
      token: 'raw-reset-token-123',
      newPassword: 'NewStrongPassword123!',
    });

    // Never auto-logs in or persists tokens
    expect(selectIsAuthenticated(store.getState())).toBe(false);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('shows invalid-link state with link to /forgot-password when token is missing or rejected with 400', async () => {
    renderResetPage('/reset-password');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Reset link invalid or expired' }),
    ).toBeDefined();
    expect(screen.getByRole('link', { name: 'Request a new link' }).getAttribute('href')).toBe(
      '/forgot-password',
    );

    const user = userEvent.setup();
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            type: 'about:blank',
            title: 'Bad Request',
            status: 400,
            code: 'INVALID_OR_EXPIRED_PASSWORD_RESET_TOKEN',
            detail: 'This password reset link is invalid or has expired. Request a new link.',
          }),
          { status: 400, headers: { 'Content-Type': 'application/problem+json' } },
        ),
    );

    renderResetPage('/reset-password?token=expired-reset-token');
    const newPwInputs = screen.getAllByLabelText('New Password');
    const confirmPwInputs = screen.getAllByLabelText('Confirm New Password');
    await user.type(newPwInputs[0]!, 'NewStrongPassword123!');
    await user.type(confirmPwInputs[0]!, 'NewStrongPassword123!');
    await user.click(screen.getByRole('button', { name: 'Reset Password' }));

    await waitFor(() => {
      expect(
        screen.getAllByRole('heading', { level: 1, name: 'Reset link invalid or expired' }).length,
      ).toBe(2);
    });
  });

  it('displays transient server/network error banner and clears password fields', async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn(async () => {
      throw new Error('Network error');
    });

    renderResetPage('/reset-password?token=valid-reset-token');

    const newPw = screen.getByLabelText('New Password') as HTMLInputElement;
    const confirmPw = screen.getByLabelText('Confirm New Password') as HTMLInputElement;
    await user.type(newPw, 'NewStrongPassword123!');
    await user.type(confirmPw, 'NewStrongPassword123!');
    await user.click(screen.getByRole('button', { name: 'Reset Password' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'An unexpected network error occurred. Please try again.',
    );
    expect(newPw.value).toBe('');
    expect(confirmPw.value).toBe('');
  });

  it('includes static no-referrer meta tag in index.html head before module script subresources', () => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(indexHtml, 'text/html');
    const metaReferrer = doc.head.querySelector('meta[name="referrer"]');
    expect(metaReferrer?.getAttribute('content')).toBe('no-referrer');

    const headChildren = Array.from(doc.head.children);
    const referrerIndex = headChildren.findIndex(
      (el) => el.tagName === 'META' && el.getAttribute('name') === 'referrer',
    );
    const scriptInHeadIndex = headChildren.findIndex((el) => el.tagName === 'SCRIPT');
    expect(referrerIndex).toBeGreaterThanOrEqual(0);
    if (scriptInHeadIndex >= 0) {
      expect(referrerIndex).toBeLessThan(scriptInHeadIndex);
    }

    // Verify raw document order places meta[name="referrer"] before the entry module script
    expect(indexHtml.indexOf('name="referrer"')).toBeLessThan(indexHtml.indexOf('/src/main.tsx'));
  });
});
