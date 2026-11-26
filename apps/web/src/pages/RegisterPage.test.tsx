import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import RegisterPage from './RegisterPage.js';
import { AppProviders } from '../app/providers.js';
import { createAppStore } from '../app/store.js';

describe('RegisterPage', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function renderRegisterPage() {
    const store = createAppStore();
    return render(
      <AppProviders storeInstance={store}>
        <MemoryRouter>
          <RegisterPage />
        </MemoryRouter>
      </AppProviders>,
    );
  }

  it('renders registration form with accessible labels and inputs', () => {
    renderRegisterPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Create your account' })).toBeDefined();
    expect(screen.getByLabelText(/full name/i)).toBeDefined();
    expect(screen.getByLabelText(/email address/i)).toBeDefined();
    expect(screen.getByLabelText(/password/i)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Create Account' })).toBeDefined();
  });

  it('blocks submission and displays accessible inline errors for invalid input', async () => {
    const user = userEvent.setup();
    renderRegisterPage();

    const submitBtn = screen.getByRole('button', { name: 'Create Account' });
    await user.click(submitBtn);

    // Displays inline field error messages
    const alerts = screen.getAllByRole('alert');
    expect(alerts.length).toBeGreaterThan(0);

    expect(screen.getByText('Display name must be at least 2 characters')).toBeDefined();
    expect(screen.getByText('Enter a valid email address')).toBeDefined();
    expect(screen.getByText('Password must be at least 8 characters')).toBeDefined();

    // Inputs have aria-invalid="true"
    const nameInput = screen.getByLabelText(/full name/i);
    expect(nameInput.getAttribute('aria-invalid')).toBe('true');

    // Fill invalid email and too-short password
    await user.type(nameInput, 'Haile');
    const emailInput = screen.getByLabelText(/email address/i);
    await user.type(emailInput, 'notanemail');
    const passwordInput = screen.getByLabelText(/password/i);
    await user.type(passwordInput, '12345');

    await user.click(submitBtn);

    expect(screen.getByText('Enter a valid email address')).toBeDefined();
    expect(screen.getByText('Password must be at least 8 characters')).toBeDefined();
  });

  it('calls API on valid input and displays the verification-required success state', async () => {
    const user = userEvent.setup();

    const mockFetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: {
              id: '550e8400-e29b-41d4-a716-446655440000',
              displayName: 'Hailemariam Addisu',
              email: 'haile@example.com',
              emailVerificationRequired: true,
            },
          }),
          {
            status: 201,
            headers: {
              'Content-Type': 'application/json',
              Location: '/api/v1/users/550e8400-e29b-41d4-a716-446655440000',
            },
          },
        ),
    );
    globalThis.fetch = mockFetch;

    renderRegisterPage();

    await user.type(screen.getByLabelText(/full name/i), 'Hailemariam Addisu');
    await user.type(screen.getByLabelText(/email address/i), 'haile@example.com');
    await user.type(screen.getByLabelText(/password/i), 'StrongPassword123!');

    const submitBtn = screen.getByRole('button', { name: 'Create Account' });
    await user.click(submitBtn);

    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Verify success state rendered
    const statusRegion = await screen.findByRole('status');
    expect(statusRegion).toBeDefined();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Registration successful' }),
    ).toBeDefined();
    expect(
      screen.getByText(/email verification is required before accessing protected features/i),
    ).toBeDefined();
    expect(screen.getByRole('link', { name: 'Back to Home' })).toBeDefined();
  });

  it('renders duplicate email error from API and retains non-secret inputs while clearing password', async () => {
    const user = userEvent.setup();

    const mockFetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            type: 'about:blank',
            title: 'Conflict',
            status: 409,
            code: 'EMAIL_ALREADY_EXISTS',
            detail: 'An account with this email address already exists.',
            errors: [
              {
                pointer: '#/email',
                code: 'DUPLICATE_EMAIL',
                detail: 'An account with this email address already exists.',
              },
            ],
          }),
          {
            status: 409,
            headers: { 'Content-Type': 'application/problem+json' },
          },
        ),
    );
    globalThis.fetch = mockFetch;

    renderRegisterPage();

    const nameInput = screen.getByLabelText(/full name/i) as HTMLInputElement;
    const emailInput = screen.getByLabelText(/email address/i) as HTMLInputElement;
    const passwordInput = screen.getByLabelText(/password/i) as HTMLInputElement;

    await user.type(nameInput, 'Hailemariam Addisu');
    await user.type(emailInput, 'haile@example.com');
    await user.type(passwordInput, 'StrongPassword123!');

    await user.click(screen.getByRole('button', { name: 'Create Account' }));

    // Alert banner shown
    const alerts = await screen.findAllByRole('alert');
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText('An account with this email address already exists.').length,
    ).toBeGreaterThan(0);

    // Non-secret inputs are preserved
    expect(nameInput.value).toBe('Hailemariam Addisu');
    expect(emailInput.value).toBe('haile@example.com');

    // Sensitive password input is cleared
    expect(passwordInput.value).toBe('');
  });

  it('prevents accidental duplicate submission while request is in flight', async () => {
    const user = userEvent.setup();

    // Deferred response to test in-flight loading state
    let resolvePromise: (value: Response) => void;
    const promise = new Promise<Response>((resolve) => {
      resolvePromise = resolve;
    });

    const mockFetch = vi.fn(() => promise);
    globalThis.fetch = mockFetch;

    renderRegisterPage();

    await user.type(screen.getByLabelText(/full name/i), 'Hailemariam Addisu');
    await user.type(screen.getByLabelText(/email address/i), 'haile@example.com');
    await user.type(screen.getByLabelText(/password/i), 'StrongPassword123!');

    const submitBtn = screen.getByRole('button', { name: 'Create Account' });
    await user.click(submitBtn);

    // Button should now be disabled and show loading indicator
    expect(submitBtn.getAttribute('disabled')).toBeDefined();
    expect(screen.getByText('Creating account...')).toBeDefined();

    // Click again while in-flight
    await user.click(submitBtn);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Resolve request
    resolvePromise!(
      new Response(
        JSON.stringify({
          data: {
            id: '550e8400-e29b-41d4-a716-446655440000',
            displayName: 'Hailemariam Addisu',
            email: 'haile@example.com',
            emailVerificationRequired: true,
          },
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: 'Registration successful' }),
      ).toBeDefined();
    });
  });
});
